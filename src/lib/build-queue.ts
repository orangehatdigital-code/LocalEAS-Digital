import { spawn, type ChildProcess } from "child_process";
import fs from "fs/promises";
import path from "path";
import type {
  BuildPhase,
  BuildRecord,
  BuildStreamEvent,
  TargetArchitecture,
} from "@/types/dashboard";
import {
  appendBuildLog,
  getBuildById,
  listBuilds,
  readBuildLog,
  updateBuild,
  upsertBuild,
} from "./db";
import {
  ARTIFACTS_DIR,
  EAS_TMP_DIR,
  ensureBaseDirs,
  getBuildEnv,
  runBashCommand,
  shellQuote,
} from "./env";
import { findProjectBySlug } from "./scanner";

export type BuildStreamListener = (event: BuildStreamEvent) => void;

interface ActiveProcessState {
  child: ChildProcess;
  pid: number;
  cancelled: boolean;
}

interface BuildQueueManagerState {
  activeBuildId: string | null;
  queue: string[];
  activeProcesses: Map<string, ActiveProcessState>;
  liveLogs: Map<string, string[]>;
  listeners: Map<string, Set<BuildStreamListener>>;
  bootReconciled: boolean;
}

const globalForQueue = globalThis as typeof globalThis & {
  __buildQueue?: BuildQueueManagerState;
};

function getQueueState(): BuildQueueManagerState {
  if (!globalForQueue.__buildQueue) {
    globalForQueue.__buildQueue = {
      activeBuildId: null,
      queue: [],
      activeProcesses: new Map(),
      liveLogs: new Map(),
      listeners: new Map(),
      bootReconciled: false,
    };
  }
  return globalForQueue.__buildQueue;
}

const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|\u001b\][^\u0007]*\u0007/g;

function cleanLogLine(raw: string): string {
  return raw.replace(ANSI_REGEX, "").replace(/\r/g, "");
}

function detectPhaseFromLine(
  line: string,
  currentPhase: BuildPhase
): BuildPhase {
  if (line.includes("[INSTALL_DEPENDENCIES]")) return "install";
  if (line.includes("[PREBUILD]")) return "prebuild";
  if (line.includes("[RUN_GRADLEW]")) return "gradle";
  if (line.includes("BUILD SUCCESSFUL")) return "packaging";
  return currentPhase;
}

function formatTimestampForFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function emitEvent(buildId: string, event: BuildStreamEvent): void {
  const state = getQueueState();
  const subs = state.listeners.get(buildId);
  if (!subs || subs.size === 0) return;
  for (const listener of Array.from(subs)) {
    try {
      listener(event);
    } catch {
      // Ignore broken subscriber
    }
  }
}

async function pushLogLines(buildId: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const state = getQueueState();
  const buffer = state.liveLogs.get(buildId) ?? [];
  buffer.push(...lines);
  if (buffer.length > 5000) {
    buffer.splice(0, buffer.length - 5000);
  }
  state.liveLogs.set(buildId, buffer);

  for (const line of lines) {
    emitEvent(buildId, { type: "log", buildId, line });
  }

  await appendBuildLog(buildId, `${lines.join("\n")}\n`);
}

/**
 * Marks any stale `queued` or `building` builds left over from a previous server crash as failed.
 */
export async function reconcileStaleBuildsOnce(): Promise<void> {
  const state = getQueueState();
  if (state.bootReconciled) return;
  state.bootReconciled = true;

  try {
    const builds = await listBuilds();
    for (const build of builds) {
      if (
        (build.status === "building" || build.status === "queued") &&
        build.id !== state.activeBuildId &&
        !state.queue.includes(build.id)
      ) {
        await updateBuild(build.id, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          errorMessage: "Sunucu yeniden başlatıldığı için işlem yarım kaldı.",
          pid: null,
        });
      }
    }
  } catch {
    // Allow app startup even if builds directory is not yet writable
  }
}

export interface EnqueueBuildInput {
  projectSlug: string;
  profile: string;
  architecture: TargetArchitecture;
  autoCommit: boolean;
  cleanTemp?: boolean;
}

/**
 * Creates a build record, stores it in the JSON DB, and appends it to the strict single-concurrency queue.
 */
export async function enqueueBuild(
  input: EnqueueBuildInput
): Promise<BuildRecord> {
  await ensureBaseDirs();
  await reconcileStaleBuildsOnce();

  const scanned = await findProjectBySlug(input.projectSlug);
  if (!scanned) {
    throw new Error(`Proje bulunamadı: ${input.projectSlug}`);
  }

  const profileInfo = scanned.info.profiles.find(
    (p) => p.name === input.profile
  );
  const outputType =
    profileInfo?.outputType ??
    (input.profile === "production" ? "aab" : "apk");

  const now = new Date();
  const id = `bld_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`;
  const artifactFilename = `${scanned.info.slug}-${input.profile}-${formatTimestampForFilename(now)}.${outputType}`;

  const record: BuildRecord = {
    id,
    projectSlug: scanned.info.slug,
    projectName: scanned.info.name,
    profile: input.profile,
    outputType,
    architecture: input.architecture,
    autoCommit: Boolean(input.autoCommit),
    cleanTemp: input.cleanTemp !== false,
    status: "queued",
    phase: "queued",
    createdAt: now.toISOString(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    artifactFilename,
    artifactPath: path.posix.join(ARTIFACTS_DIR, artifactFilename),
    artifactSizeBytes: null,
    errorMessage: null,
    pid: null,
  };

  await upsertBuild(record);

  const state = getQueueState();
  state.liveLogs.set(id, [
    `[DASHBOARD] Build kuyruğa alındı: ${scanned.info.name} (${input.profile} / ${input.architecture})`,
  ]);
  await appendBuildLog(
    id,
    `[DASHBOARD] Build kuyruğa alındı: ${scanned.info.name} (${input.profile} / ${input.architecture})\n`
  );

  state.queue.push(id);
  void processNextInQueue();

  return record;
}

async function processNextInQueue(): Promise<void> {
  const state = getQueueState();
  if (state.activeBuildId !== null) return;

  const nextId = state.queue.shift();
  if (!nextId) return;

  state.activeBuildId = nextId;
  try {
    await executeBuild(nextId);
  } finally {
    state.activeBuildId = null;
    void processNextInQueue();
  }
}

async function executeBuild(buildId: string): Promise<void> {
  const state = getQueueState();
  const existing = await getBuildById(buildId);
  if (!existing || existing.status === "cancelled") {
    return;
  }

  const scanned = await findProjectBySlug(existing.projectSlug);
  if (!scanned) {
    const failed = await updateBuild(buildId, {
      status: "failed",
      phase: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: `Proje dizini artık bulunamıyor: ${existing.projectSlug}`,
    });
    if (failed) {
      emitEvent(buildId, { type: "done", buildId, build: failed });
    }
    return;
  }

  const startedAt = new Date();
  let currentPhase: BuildPhase = "preparing";
  const buildingRecord = await updateBuild(buildId, {
    status: "building",
    phase: currentPhase,
    startedAt: startedAt.toISOString(),
  });
  if (buildingRecord) {
    emitEvent(buildId, {
      type: "status",
      buildId,
      status: "building",
      phase: currentPhase,
      build: buildingRecord,
    });
  }

  // Step 1: Clean EAS local temp directory
  if (existing.cleanTemp) {
    await pushLogLines(buildId, [
      `[DASHBOARD] Geçici dizin temizleniyor: ${EAS_TMP_DIR}/*`,
    ]);
    await runBashCommand(`rm -rf ${EAS_TMP_DIR}/*`, { timeoutMs: 10_000 });
  }

  // Step 2: Optional auto-commit inside repoRoot
  if (existing.autoCommit) {
    await pushLogLines(buildId, [
      `[DASHBOARD] Auto-Commit çalışıyor (${scanned.info.repoRoot})...`,
    ]);
    const commitRes = await runBashCommand(
      'git add -A && git commit -m "chore: local build auto-commit" || true',
      { cwd: scanned.info.repoRoot, timeoutMs: 15_000 }
    );
    const outLines = `${commitRes.stdout}\n${commitRes.stderr}`
      .split(/\r?\n/)
      .map(cleanLogLine)
      .filter((l) => l.trim().length > 0);
    if (outLines.length > 0) {
      await pushLogLines(buildId, outLines);
    }
  }

  // Step 3: Ensure eas.json exists
  const easJsonPath = path.posix.join(scanned.info.workingDir, "eas.json");
  try {
    await fs.access(easJsonPath);
  } catch {
    await pushLogLines(buildId, [
      `[DASHBOARD] 'eas.json' bulunamadı, yerel yapılandırma oluşturuluyor...`,
    ]);
    const defaultEasJson = {
      cli: { appVersionSource: "local" },
      build: {
        development: { developmentClient: true, distribution: "internal" },
        preview: { distribution: "internal" },
        production: {},
      },
    };
    await fs.writeFile(
      easJsonPath,
      JSON.stringify(defaultEasJson, null, 2) + "\n",
      "utf8"
    );
  }

  // Step 4: Ensure EAS project is linked (app.json extra.eas.projectId)
  const appJsonPath = path.posix.join(scanned.info.workingDir, "app.json");
  try {
    const appJsonRaw = await fs.readFile(appJsonPath, "utf8");
    const appJson = JSON.parse(appJsonRaw);
    if (!appJson.extra?.eas?.projectId && !appJson.expo?.extra?.eas?.projectId) {
      await pushLogLines(buildId, [
        `[DASHBOARD] Proje EAS'a henüz bağlanmamış (projectId eksik). 'eas init' otomatik çalıştırılıyor...`,
      ]);
      const initRes = await runBashCommand("eas init --non-interactive", {
        cwd: scanned.info.workingDir,
        timeoutMs: 30_000,
      });
      if (initRes.exitCode === 0) {
        await pushLogLines(buildId, [
          `[DASHBOARD] Proje EAS ile başarıyla eşleştirildi.`,
        ]);
      } else {
        await pushLogLines(buildId, [
          `[DASHBOARD UYARI] eas init otomatik tamamlanamadı: ${initRes.stderr || initRes.stdout}`,
        ]);
      }
    }
  } catch {
    // Non-fatal
  }

  // Re-check cancellation before spawning eas build
  const beforeSpawn = await getBuildById(buildId);
  if (!beforeSpawn || beforeSpawn.status === "cancelled") {
    return;
  }

  const outputPath =
    existing.artifactPath ??
    path.posix.join(
      ARTIFACTS_DIR,
      existing.artifactFilename ?? `${buildId}.${existing.outputType}`
    );

  const easCommand = [
    "eas build",
    "--platform android",
    `--profile ${shellQuote(existing.profile)}`,
    "--local",
    "--non-interactive",
    `--output=${shellQuote(outputPath)}`,
  ].join(" ");

  await pushLogLines(buildId, [
    `[DASHBOARD] Çalışma dizini: ${scanned.info.workingDir}`,
    `[DASHBOARD] Mimari: ${existing.architecture}`,
    `[DASHBOARD] Komut: ${easCommand}`,
  ]);

  const env = await getBuildEnv({
    ORG_GRADLE_PROJECT_reactNativeArchitectures: existing.architecture,
  });

  await new Promise<void>((resolve) => {
    const child = spawn("bash", ["-lc", easCommand], {
      cwd: scanned.info.workingDir,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const procState: ActiveProcessState = {
      child,
      pid: child.pid ?? 0,
      cancelled: false,
    };
    state.activeProcesses.set(buildId, procState);

    if (child.pid) {
      void updateBuild(buildId, { pid: child.pid });
    }

    let trailing = "";
    let writeQueue = Promise.resolve();

    const handleChunk = (chunk: Buffer) => {
      const text = trailing + chunk.toString("utf8");
      const parts = text.split(/\r?\n/);
      trailing = parts.pop() ?? "";

      const cleaned = parts
        .map(cleanLogLine)
        .filter((line) => line.length > 0);

      if (cleaned.length === 0) return;

      for (const line of cleaned) {
        const nextPhase = detectPhaseFromLine(line, currentPhase);
        if (nextPhase !== currentPhase) {
          currentPhase = nextPhase;
          void updateBuild(buildId, { phase: currentPhase }).then((updated) => {
            if (updated) {
              emitEvent(buildId, {
                type: "status",
                buildId,
                status: updated.status,
                phase: currentPhase,
                build: updated,
              });
            }
          });
        }
      }

      writeQueue = writeQueue.then(() => pushLogLines(buildId, cleaned));
    };

    child.stdout?.on("data", handleChunk);
    child.stderr?.on("data", handleChunk);

    child.on("error", async (err) => {
      await writeQueue;
      await pushLogLines(buildId, [`[DASHBOARD ERROR] ${err.message}`]);
      state.activeProcesses.delete(buildId);

      const finishedAt = new Date();
      const failed = await updateBuild(buildId, {
        status: "failed",
        phase: currentPhase,
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorMessage: err.message,
        pid: null,
      });
      if (failed) {
        emitEvent(buildId, { type: "done", buildId, build: failed });
      }
      resolve();
    });

    child.on("close", async (code) => {
      if (trailing.trim().length > 0) {
        const lastLine = cleanLogLine(trailing);
        if (lastLine) {
          writeQueue = writeQueue.then(() => pushLogLines(buildId, [lastLine]));
        }
      }
      await writeQueue;

      const wasCancelled =
        state.activeProcesses.get(buildId)?.cancelled === true;
      state.activeProcesses.delete(buildId);

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      if (wasCancelled) {
        const cancelled = await updateBuild(buildId, {
          status: "cancelled",
          phase: currentPhase,
          finishedAt: finishedAt.toISOString(),
          durationMs,
          errorMessage: "Build kullanıcı tarafından iptal edildi.",
          pid: null,
        });
        if (cancelled) {
          emitEvent(buildId, { type: "done", buildId, build: cancelled });
        }
        resolve();
        return;
      }

      if (code === 0) {
        let artifactSizeBytes: number | null = null;
        try {
          const stat = await fs.stat(outputPath);
          artifactSizeBytes = stat.size;
        } catch {
          artifactSizeBytes = null;
        }

        if (artifactSizeBytes !== null) {
          await pushLogLines(buildId, [
            `[DASHBOARD] Build tamamlandı: ${path.posix.basename(outputPath)} (${(artifactSizeBytes / (1024 * 1024)).toFixed(2)} MB)`,
          ]);
          const succeeded = await updateBuild(buildId, {
            status: "success",
            phase: "done",
            finishedAt: finishedAt.toISOString(),
            durationMs,
            artifactSizeBytes,
            errorMessage: null,
            pid: null,
          });
          if (succeeded) {
            emitEvent(buildId, { type: "done", buildId, build: succeeded });
          }
          resolve();
          return;
        }
      }

      const errMsg =
        code === 0
          ? "Build sıfır koduyla bitti ancak çıktı dosyası bulunamadı."
          : `EAS build başarısız oldu (exit code ${code ?? 1}).`;
      await pushLogLines(buildId, [`[DASHBOARD ERROR] ${errMsg}`]);

      const failed = await updateBuild(buildId, {
        status: "failed",
        phase: currentPhase,
        finishedAt: finishedAt.toISOString(),
        durationMs,
        errorMessage: errMsg,
        pid: null,
      });
      if (failed) {
        emitEvent(buildId, { type: "done", buildId, build: failed });
      }
      resolve();
    });
  });
}

/**
 * Cancels a queued or running build and cleans up Gradle/Kotlin daemon processes.
 */
export async function cancelBuild(buildId: string): Promise<BuildRecord | null> {
  const state = getQueueState();
  const build = await getBuildById(buildId);
  if (!build) return null;

  // If still queued, remove from queue immediately
  const queueIdx = state.queue.indexOf(buildId);
  if (queueIdx >= 0) {
    state.queue.splice(queueIdx, 1);
    const cancelled = await updateBuild(buildId, {
      status: "cancelled",
      phase: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: "Kuyruktayken iptal edildi.",
      pid: null,
    });
    await pushLogLines(buildId, [
      "[DASHBOARD] Build kuyruktayken iptal edildi.",
    ]);
    if (cancelled) {
      emitEvent(buildId, { type: "done", buildId, build: cancelled });
    }
    return cancelled;
  }

  // If actively running, kill its detached process group + daemons
  const procState = state.activeProcesses.get(buildId);
  if (procState) {
    procState.cancelled = true;
    await pushLogLines(buildId, [
      "[DASHBOARD] Build iptal ediliyor, süreç grubu sonlandırılıyor (SIGKILL)...",
    ]);

    if (procState.pid > 0) {
      try {
        process.kill(-procState.pid, "SIGKILL");
      } catch {
        try {
          procState.child.kill("SIGKILL");
        } catch {
          // Process already exited
        }
      }
    }

    await runBashCommand(
      "pkill -f '.*GradleDaemon.*' || true; pkill -f '.*KotlinCompileDaemon.*' || true",
      { timeoutMs: 5000 }
    );

    return getBuildById(buildId);
  }

  return build;
}

export function getQueueSnapshotMeta() {
  const state = getQueueState();
  return {
    activeBuildId: state.activeBuildId,
    queuedIds: [...state.queue],
  };
}

/**
 * Returns initial build state + log lines and subscribes a listener if the build is active or queued.
 */
export async function subscribeBuildStream(
  buildId: string,
  listener: BuildStreamListener
): Promise<{
  build: BuildRecord | null;
  lines: string[];
  unsubscribe: () => void;
}> {
  const state = getQueueState();
  const build = await getBuildById(buildId);

  const memoryLines = state.liveLogs.get(buildId);
  const lines =
    memoryLines && memoryLines.length > 0
      ? [...memoryLines]
      : await readBuildLog(buildId);

  const isLive =
    build !== null && (build.status === "queued" || build.status === "building");

  if (!isLive) {
    return {
      build,
      lines,
      unsubscribe: () => {},
    };
  }

  let subs = state.listeners.get(buildId);
  if (!subs) {
    subs = new Set();
    state.listeners.set(buildId, subs);
  }
  subs.add(listener);

  return {
    build,
    lines,
    unsubscribe: () => {
      const currentSubs = state.listeners.get(buildId);
      if (currentSubs) {
        currentSubs.delete(listener);
        if (currentSubs.size === 0) {
          state.listeners.delete(buildId);
        }
      }
    },
  };
}


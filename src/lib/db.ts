import fs from "fs/promises";
import path from "path";
import type { BuildRecord, DashboardDatabase } from "@/types/dashboard";
import { DB_PATH, LOGS_DIR, ensureBaseDirs } from "./env";

const globalForDb = globalThis as typeof globalThis & {
  __dbWriteLock?: Promise<void>;
};

function sanitizeBuildId(buildId: string): string {
  return buildId.replace(/[^a-zA-Z0-9_-]/g, "");
}

function runSerializedDbWrite<T>(task: () => Promise<T>): Promise<T> {
  const prev = globalForDb.__dbWriteLock ?? Promise.resolve();
  const next = prev.then(task, task);
  globalForDb.__dbWriteLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/**
 * Reads the metadata database from disk, returning an empty database if missing.
 */
export async function readDb(): Promise<DashboardDatabase> {
  await ensureBaseDirs();
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<DashboardDatabase>;
    if (Array.isArray(parsed.builds)) {
      return { builds: parsed.builds };
    }
    return { builds: [] };
  } catch {
    return { builds: [] };
  }
}

async function writeDbUnsafe(data: DashboardDatabase): Promise<void> {
  await ensureBaseDirs();
  const tmpPath = `${DB_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, DB_PATH);
}

/**
 * Inserts or updates a build record in `dashboard-db.json` atomically.
 */
export async function upsertBuild(record: BuildRecord): Promise<void> {
  await runSerializedDbWrite(async () => {
    const db = await readDb();
    const idx = db.builds.findIndex((b) => b.id === record.id);
    if (idx >= 0) {
      db.builds[idx] = record;
    } else {
      db.builds.unshift(record);
    }
    // Keep metadata list bounded to last 200 builds
    if (db.builds.length > 200) {
      db.builds = db.builds.slice(0, 200);
    }
    await writeDbUnsafe(db);
  });
}

/**
 * Applies a partial update to an existing build record.
 */
export async function updateBuild(
  buildId: string,
  patch: Partial<BuildRecord>
): Promise<BuildRecord | null> {
  return runSerializedDbWrite(async () => {
    const db = await readDb();
    const idx = db.builds.findIndex((b) => b.id === buildId);
    if (idx < 0) {
      return null;
    }
    const updated: BuildRecord = { ...db.builds[idx], ...patch };
    db.builds[idx] = updated;
    await writeDbUnsafe(db);
    return updated;
  });
}

export async function listBuilds(): Promise<BuildRecord[]> {
  const db = await readDb();
  return db.builds;
}

export async function getBuildById(buildId: string): Promise<BuildRecord | null> {
  const db = await readDb();
  return db.builds.find((b) => b.id === buildId) ?? null;
}

/**
 * Deletes a build record from dashboard-db.json.
 */
export async function deleteBuild(buildId: string): Promise<boolean> {
  return runSerializedDbWrite(async () => {
    const db = await readDb();
    const idx = db.builds.findIndex((b) => b.id === buildId);
    if (idx < 0) return false;
    db.builds.splice(idx, 1);
    await writeDbUnsafe(db);
    return true;
  });
}

export function getBuildLogPath(buildId: string): string {
  const safeId = sanitizeBuildId(buildId);
  return path.posix.join(LOGS_DIR, `${safeId}.log`);
}

/**
 * Deletes a build's dedicated log file.
 */
export async function deleteBuildLog(buildId: string): Promise<void> {
  const safeId = sanitizeBuildId(buildId);
  if (!safeId) return;
  try {
    await fs.unlink(getBuildLogPath(safeId));
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Appends text to a build's dedicated log file.
 */
export async function appendBuildLog(buildId: string, text: string): Promise<void> {
  const safeId = sanitizeBuildId(buildId);
  if (!safeId) return;
  await ensureBaseDirs();
  await fs.appendFile(getBuildLogPath(safeId), text, "utf8");
}

/**
 * Reads all log lines from a build's log file.
 */
export async function readBuildLog(buildId: string): Promise<string[]> {
  const safeId = sanitizeBuildId(buildId);
  if (!safeId) return [];
  try {
    const raw = await fs.readFile(getBuildLogPath(safeId), "utf8");
    if (!raw) return [];
    const lines = raw.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines;
  } catch {
    return [];
  }
}


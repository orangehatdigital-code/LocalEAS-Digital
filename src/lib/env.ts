import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

// Normalize ~ to user's home directory
function resolvePathWithHome(targetPath: string): string {
  if (targetPath.startsWith("~/") || targetPath === "~") {
    return path.posix.join(USER_HOME, targetPath.slice(targetPath === "~" ? 1 : 2));
  }
  return targetPath;
}

// User home directory (defaults to current system user home)
export const USER_HOME =
  process.env.DASHBOARD_HOME ||
  process.env.HOME ||
  (process.platform === "win32" ? process.env.USERPROFILE || "C:\\Users\\Default" : os.homedir());

// Directory where projects are located (defaults to ~/builds)
export const BUILDS_ROOT = resolvePathWithHome(
  process.env.BUILDS_ROOT || path.posix.join(USER_HOME, "builds")
);

export const ARTIFACTS_DIR = resolvePathWithHome(
  process.env.ARTIFACTS_DIR || path.posix.join(BUILDS_ROOT, "artifacts")
);

export const LOGS_DIR = resolvePathWithHome(
  process.env.LOGS_DIR || path.posix.join(BUILDS_ROOT, "logs")
);

export const DB_PATH = resolvePathWithHome(
  process.env.DB_PATH || path.posix.join(BUILDS_ROOT, "dashboard-db.json")
);

export const EAS_TMP_DIR = resolvePathWithHome(
  process.env.EAS_TMP_DIR ||
    path.posix.join("/tmp", process.env.USER || "eas", "eas-build-local-nodejs")
);

export const JAVA_HOME_DIR =
  process.env.JAVA_HOME || "/usr/lib/jvm/java-17-openjdk-amd64";

export const ANDROID_HOME_DIR = resolvePathWithHome(
  process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.posix.join(USER_HOME, "android-sdk")
);

export const EXCLUDED_PROJECT_DIRS = new Set([
  "artifacts",
  "logs",
  "local-expo-dashboard",
  "eas-dashboard",
  "LocalEAS-Digital",
  ".git",
  ...(process.env.EXCLUDED_DIRS ? process.env.EXCLUDED_DIRS.split(",").map((s) => s.trim()) : []),
]);

/**
 * Ensures core dashboard storage directories exist.
 */
export async function ensureBaseDirs(): Promise<void> {
  await Promise.all([
    fs.mkdir(BUILDS_ROOT, { recursive: true }),
    fs.mkdir(ARTIFACTS_DIR, { recursive: true }),
    fs.mkdir(LOGS_DIR, { recursive: true }),
  ]);
}

/**
 * Picks the highest version directory name inside a parent folder (e.g. NVM node or Android build-tools).
 */
async function resolveLatestVersionDir(parentDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(parentDir, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      );

    if (dirs.length === 0) {
      return null;
    }

    return path.posix.join(parentDir, dirs[dirs.length - 1]);
  } catch {
    return null;
  }
}

/**
 * Builds an explicit Linux environment with dynamically resolved NVM Node and Android SDK paths.
 */
export async function getBuildEnv(
  extraEnv?: Record<string, string>
): Promise<NodeJS.ProcessEnv> {
  const nvmNodeDir = await resolveLatestVersionDir(
    `${USER_HOME}/.nvm/versions/node`
  );
  const buildToolsDir = await resolveLatestVersionDir(
    `${ANDROID_HOME_DIR}/build-tools`
  );

  const pathParts = [
    nvmNodeDir ? `${nvmNodeDir}/bin` : null,
    `${ANDROID_HOME_DIR}/cmdline-tools/latest/bin`,
    `${ANDROID_HOME_DIR}/platform-tools`,
    buildToolsDir ?? `${ANDROID_HOME_DIR}/build-tools/34.0.0`,
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
  ].filter((part): part is string => Boolean(part));

  return {
    ...process.env,
    HOME: USER_HOME,
    JAVA_HOME: JAVA_HOME_DIR,
    ANDROID_HOME: ANDROID_HOME_DIR,
    ANDROID_SDK_ROOT: ANDROID_HOME_DIR,
    PATH: pathParts.join(":"),
    ...extraEnv,
  };
}

export interface BashCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface BashCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  extraEnv?: Record<string, string>;
}

/**
 * Executes a shell command via `bash -lc` with explicit environment variables.
 */
export async function runBashCommand(
  command: string,
  options: BashCommandOptions = {}
): Promise<BashCommandResult> {
  const env = await getBuildEnv(options.extraEnv);
  const timeoutMs = options.timeoutMs ?? 30_000;

  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], {
      cwd: options.cwd ?? BUILDS_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        resolve({
          stdout,
          stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms`.trim(),
          exitCode: 124,
        });
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: err.message,
          exitCode: 1,
        });
      }
    });

    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      }
    });
  });
}

/**
 * Escapes an argument for safe single-quoted inclusion in bash commands.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

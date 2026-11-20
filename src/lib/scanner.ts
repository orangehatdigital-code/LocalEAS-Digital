import fs from "fs/promises";
import path from "path";
import type {
  BuildOutputType,
  EasProfileInfo,
  ProjectGitInfo,
  ProjectInfo,
} from "@/types/dashboard";
import {
  BUILDS_ROOT,
  EXCLUDED_PROJECT_DIRS,
  runBashCommand,
} from "./env";

interface AppJsonShape {
  expo?: {
    name?: string;
    slug?: string;
    version?: string;
    sdkVersion?: string;
    icon?: string;
    android?: {
      package?: string;
      versionCode?: number;
      icon?: string;
    };
  };
  name?: string;
  slug?: string;
  version?: string;
}

interface PackageJsonShape {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface EasJsonProfile {
  android?: {
    buildType?: string;
    gradleCommand?: string;
  };
}

interface EasJsonShape {
  build?: Record<string, EasJsonProfile>;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function readJsonSafe<T>(targetPath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(targetPath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function extractStringMatch(source: string, key: string): string | null {
  const pattern = new RegExp(
    `(?:^|[,{\\s])${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`,
    "m"
  );
  const match = source.match(pattern);
  return match?.[1]?.trim() ?? null;
}

async function readAppConfigMetadata(workingDir: string): Promise<{
  name?: string;
  slug?: string;
  version?: string;
  versionCode?: number;
  sdkVersion?: string;
  androidPackage?: string;
  iconRelPath?: string;
}> {
  const appJson = await readJsonSafe<AppJsonShape>(
    path.posix.join(workingDir, "app.json")
  );
  if (appJson) {
    const expo = appJson.expo ?? appJson;
    const androidPkg = appJson.expo?.android?.package;
    const versionCode = appJson.expo?.android?.versionCode;
    const iconRel = appJson.expo?.android?.icon ?? appJson.expo?.icon;
    return {
      name: expo.name,
      slug: expo.slug,
      version: expo.version,
      versionCode,
      sdkVersion: appJson.expo?.sdkVersion,
      androidPackage: androidPkg,
      iconRelPath: iconRel,
    };
  }

  for (const configFile of ["app.config.ts", "app.config.js"]) {
    const configPath = path.posix.join(workingDir, configFile);
    try {
      const content = await fs.readFile(configPath, "utf8");
      return {
        name: extractStringMatch(content, "name") ?? undefined,
        slug: extractStringMatch(content, "slug") ?? undefined,
        version: extractStringMatch(content, "version") ?? undefined,
        androidPackage: extractStringMatch(content, "package") ?? undefined,
        iconRelPath: extractStringMatch(content, "icon") ?? undefined,
      };
    } catch {
      // Try next file
    }
  }

  return {};
}

function resolveProfileOutputType(
  profileName: string,
  profileCfg?: EasJsonProfile
): BuildOutputType {
  const buildType = profileCfg?.android?.buildType?.toLowerCase();
  if (buildType === "apk") return "apk";
  if (buildType === "app-bundle" || buildType === "aab") return "aab";

  const gradleCmd = profileCfg?.android?.gradleCommand?.toLowerCase() ?? "";
  if (gradleCmd.includes("assemble")) return "apk";
  if (gradleCmd.includes("bundle")) return "aab";

  return profileName === "production" ? "aab" : "apk";
}

function parseProfiles(easJson: EasJsonShape | null): EasProfileInfo[] {
  const defaultOrder = ["development", "preview", "production"];
  if (!easJson?.build || Object.keys(easJson.build).length === 0) {
    return defaultOrder.map((name) => ({
      name,
      outputType: resolveProfileOutputType(name),
    }));
  }

  const keys = Object.keys(easJson.build);
  const sortedKeys = [
    ...defaultOrder.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !defaultOrder.includes(k)),
  ];

  return sortedKeys.map((name) => ({
    name,
    outputType: resolveProfileOutputType(name, easJson.build?.[name]),
  }));
}

function extractExpoSdkVersion(pkg: PackageJsonShape | null): string | null {
  const raw =
    pkg?.dependencies?.expo ?? pkg?.devDependencies?.expo ?? undefined;
  if (!raw) return null;
  const cleaned = raw.replace(/^[\^~>=<]+/, "").trim();
  const major = cleaned.split(".")[0];
  return major && /^\d+$/.test(major) ? `SDK ${major}` : cleaned;
}

async function resolveWorkingDir(repoRoot: string): Promise<string | null> {
  const candidates = [repoRoot, path.posix.join(repoRoot, "mobile")];
  const markers = [
    "app.json",
    "app.config.ts",
    "app.config.js",
    "eas.json",
  ];

  for (const candidate of candidates) {
    for (const marker of markers) {
      if (await fileExists(path.posix.join(candidate, marker))) {
        return candidate;
      }
    }
  }

  // Fallback: check if root package.json depends on expo
  for (const candidate of candidates) {
    const pkg = await readJsonSafe<PackageJsonShape>(
      path.posix.join(candidate, "package.json")
    );
    if (pkg?.dependencies?.expo || pkg?.devDependencies?.expo) {
      return candidate;
    }
  }

  return null;
}

async function resolveIconFile(
  workingDir: string,
  iconRelPath?: string
): Promise<string | null> {
  const candidates = [
    iconRelPath,
    "./assets/icon.png",
    "./assets/images/icon.png",
    "./assets/adaptive-icon.png",
  ].filter((item): item is string => Boolean(item));

  const normalizedWorkingDir = path.posix.resolve(workingDir);
  for (const rel of candidates) {
    const resolved = path.posix.resolve(normalizedWorkingDir, rel);
    if (
      resolved.startsWith(`${normalizedWorkingDir}/`) &&
      (await fileExists(resolved))
    ) {
      return resolved;
    }
  }
  return null;
}

async function readGitInfo(repoRoot: string): Promise<ProjectGitInfo> {
  const gitCheck = await fileExists(path.posix.join(repoRoot, ".git"));
  // `.git` may be a directory (or file in submodules), so test via git command directly
  const [branchRes, logRes, statusRes] = await Promise.all([
    runBashCommand("git rev-parse --abbrev-ref HEAD", {
      cwd: repoRoot,
      timeoutMs: 5000,
    }),
    runBashCommand('git log -1 --format="%h|||%s"', {
      cwd: repoRoot,
      timeoutMs: 5000,
    }),
    runBashCommand("git status --porcelain", {
      cwd: repoRoot,
      timeoutMs: 5000,
    }),
  ]);

  if (branchRes.exitCode !== 0 && !gitCheck) {
    return {
      branch: "no-git",
      commitHash: "-",
      commitMessage: "Git deposu bulunamadı",
      isDirty: false,
    };
  }

  const branch =
    branchRes.exitCode === 0 ? branchRes.stdout.trim() || "HEAD" : "unknown";

  let commitHash = "-";
  let commitMessage = "";
  if (logRes.exitCode === 0 && logRes.stdout.trim()) {
    const [hash, ...msgParts] = logRes.stdout.trim().split("|||");
    commitHash = hash || "-";
    commitMessage = msgParts.join("|||").trim();
  }

  const isDirty =
    statusRes.exitCode === 0 && statusRes.stdout.trim().length > 0;

  return {
    branch,
    commitHash,
    commitMessage,
    isDirty,
  };
}

interface ScannedProjectInternal {
  info: ProjectInfo;
  iconPath: string | null;
}

async function scanSingleRepo(
  folderName: string
): Promise<ScannedProjectInternal | null> {
  const repoRoot = path.posix.join(BUILDS_ROOT, folderName);
  const workingDir = await resolveWorkingDir(repoRoot);
  if (!workingDir) {
    return null;
  }

  const [appMeta, pkgJson, easJson, gitInfo] = await Promise.all([
    readAppConfigMetadata(workingDir),
    readJsonSafe<PackageJsonShape>(path.posix.join(workingDir, "package.json")),
    readJsonSafe<EasJsonShape>(path.posix.join(workingDir, "eas.json")),
    readGitInfo(repoRoot),
  ]);

  const slug =
    (appMeta.slug || folderName)
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-") || folderName;
  const name = appMeta.name || pkgJson?.name || folderName;
  const version = appMeta.version || pkgJson?.version || "1.0.0";
  const sdkVersion = appMeta.sdkVersion
    ? `SDK ${appMeta.sdkVersion.split(".")[0]}`
    : extractExpoSdkVersion(pkgJson);

  const iconPath = await resolveIconFile(workingDir, appMeta.iconRelPath);

  return {
    info: {
      name,
      slug,
      folderName,
      version,
      versionCode: appMeta.versionCode ?? null,
      sdkVersion,
      androidPackage: appMeta.androidPackage ?? null,
      hasIcon: Boolean(iconPath),
      repoRoot,
      workingDir,
      isMonorepoSubdir: workingDir !== repoRoot,
      profiles: parseProfiles(easJson),
      git: gitInfo,
    },
    iconPath,
  };
}

/**
 * Scans the configured builds directory for Expo React Native projects.
 */
export async function scanProjects(): Promise<ProjectInfo[]> {
  try {
    const entries = await fs.readdir(BUILDS_ROOT, { withFileTypes: true });
    const repoFolders = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !EXCLUDED_PROJECT_DIRS.has(entry.name)
      )
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    const results = await Promise.all(
      repoFolders.map((folder) => scanSingleRepo(folder))
    );

    return results
      .filter((item): item is ScannedProjectInternal => item !== null)
      .map((item) => item.info);
  } catch {
    return [];
  }
}

/**
 * Finds a single scanned project by its slug, folderName, or name (including its local icon path).
 */
export async function findProjectBySlug(
  identifier: string
): Promise<ScannedProjectInternal | null> {
  try {
    const entries = await fs.readdir(BUILDS_ROOT, { withFileTypes: true });
    const repoFolders = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !EXCLUDED_PROJECT_DIRS.has(entry.name)
      )
      .map((entry) => entry.name);

    const results = await Promise.all(
      repoFolders.map((folder) => scanSingleRepo(folder))
    );

    const decoded = decodeURIComponent(identifier).trim();
    const lower = decoded.toLowerCase();

    return (
      results.find(
        (item) =>
          item !== null &&
          (item.info.slug === decoded ||
            item.info.slug.toLowerCase() === lower ||
            item.info.folderName === decoded ||
            item.info.folderName.toLowerCase() === lower ||
            item.info.name === decoded ||
            item.info.name.toLowerCase() === lower)
      ) ?? null
    );
  } catch {
    return null;
  }
}


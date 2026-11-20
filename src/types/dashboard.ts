export type TargetArchitecture =
  | "arm64-v8a"
  | "arm64-v8a,x86_64"
  | "armeabi-v7a,arm64-v8a,x86,x86_64";

export type BuildProfile = "development" | "preview" | "production" | string;

export type BuildOutputType = "apk" | "aab";

export type BuildStatus =
  | "queued"
  | "building"
  | "success"
  | "failed"
  | "cancelled";

export type BuildPhase =
  | "queued"
  | "preparing"
  | "install"
  | "prebuild"
  | "gradle"
  | "packaging"
  | "done"
  | "failed";

export interface EasProfileInfo {
  name: string;
  outputType: BuildOutputType;
}

export interface ProjectGitInfo {
  branch: string;
  commitHash: string;
  commitMessage: string;
  isDirty: boolean;
}

export interface ProjectInfo {
  name: string;
  slug: string;
  folderName: string;
  version: string;
  versionCode?: number | null;
  sdkVersion: string | null;
  androidPackage: string | null;
  hasIcon: boolean;
  repoRoot: string;
  workingDir: string;
  isMonorepoSubdir: boolean;
  profiles: EasProfileInfo[];
  git: ProjectGitInfo;
}

export interface BuildRecord {
  id: string;
  projectSlug: string;
  projectName: string;
  profile: BuildProfile;
  outputType: BuildOutputType;
  architecture: TargetArchitecture;
  autoCommit: boolean;
  cleanTemp: boolean;
  status: BuildStatus;
  phase: BuildPhase;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  artifactFilename: string | null;
  artifactPath: string | null;
  artifactSizeBytes: number | null;
  errorMessage: string | null;
  pid: number | null;
}

export interface DashboardDatabase {
  builds: BuildRecord[];
}

export interface SystemTelemetry {
  ramUsedMb: number;
  ramTotalMb: number;
  ramPercent: number;
  swapUsedMb: number;
  swapTotalMb: number;
  swapPercent: number;
  diskFreeHuman: string;
  diskTotalHuman: string;
  diskUsedPercent: number;
  activeDaemons: number;
  timestamp: string;
}

export interface ProjectActionResponse {
  ok: boolean;
  action: "git-pull" | "fix-deps";
  output: string;
  exitCode: number;
}

export interface BuildStreamEvent {
  type: "snapshot" | "log" | "status" | "done";
  buildId: string;
  status?: BuildStatus;
  phase?: BuildPhase;
  line?: string;
  lines?: string[];
  build?: BuildRecord;
}

export interface ConnectedDevice {
  id: string;
  type: "device" | "emulator" | "offline" | "unauthorized";
  model?: string;
  product?: string;
}


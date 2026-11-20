import type { SystemTelemetry } from "@/types/dashboard";
import { EAS_TMP_DIR, runBashCommand } from "./env";

function parsePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}

/**
 * Collects live WSL2 memory, swap, disk, and Gradle/Kotlin daemon counts.
 */
export async function getSystemTelemetry(): Promise<SystemTelemetry> {
  const [freeRes, dfRes, daemonRes] = await Promise.all([
    runBashCommand("free -m", { timeoutMs: 4000 }),
    runBashCommand("df -Ph / | tail -n 1", { timeoutMs: 4000 }),
    runBashCommand(
      "pgrep -f '[G]radleDaemon|[K]otlinCompileDaemon' | wc -l",
      { timeoutMs: 4000 }
    ),
  ]);

  let ramTotalMb = 0;
  let ramUsedMb = 0;
  let swapTotalMb = 0;
  let swapUsedMb = 0;

  if (freeRes.exitCode === 0) {
    for (const line of freeRes.stdout.split(/\r?\n/)) {
      const cols = line.trim().split(/\s+/);
      if (cols[0] === "Mem:" && cols.length >= 3) {
        ramTotalMb = Number.parseInt(cols[1], 10) || 0;
        ramUsedMb = Number.parseInt(cols[2], 10) || 0;
      } else if (cols[0] === "Swap:" && cols.length >= 3) {
        swapTotalMb = Number.parseInt(cols[1], 10) || 0;
        swapUsedMb = Number.parseInt(cols[2], 10) || 0;
      }
    }
  }

  let diskTotalHuman = "-";
  let diskFreeHuman = "-";
  let diskUsedPercent = 0;

  if (dfRes.exitCode === 0 && dfRes.stdout.trim()) {
    const cols = dfRes.stdout.trim().split(/\s+/);
    if (cols.length >= 5) {
      diskTotalHuman = cols[1] || "-";
      diskFreeHuman = cols[3] || "-";
      diskUsedPercent = Number.parseInt(cols[4].replace("%", ""), 10) || 0;
    }
  }

  const activeDaemons =
    daemonRes.exitCode === 0
      ? Number.parseInt(daemonRes.stdout.trim(), 10) || 0
      : 0;

  return {
    ramUsedMb,
    ramTotalMb,
    ramPercent: parsePercent(ramUsedMb, ramTotalMb),
    swapUsedMb,
    swapTotalMb,
    swapPercent: parsePercent(swapUsedMb, swapTotalMb),
    diskFreeHuman,
    diskTotalHuman,
    diskUsedPercent,
    activeDaemons,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Kills stuck Gradle/Kotlin daemons and clears temporary EAS local build files.
 */
export async function cleanSystemDaemonsAndTmp(): Promise<SystemTelemetry> {
  await runBashCommand(
    `pkill -9 -f KotlinCompileDaemon 2>/dev/null || true; pkill -9 -f GradleDaemon 2>/dev/null || true; rm -rf ${EAS_TMP_DIR}/*`,
    { timeoutMs: 10_000 }
  );
  return getSystemTelemetry();
}


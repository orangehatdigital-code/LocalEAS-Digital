import { DashboardClient } from "@/components/dashboard-client";
import { reconcileStaleBuildsOnce } from "@/lib/build-queue";
import { listBuilds } from "@/lib/db";
import { scanProjects } from "@/lib/scanner";
import { getSystemTelemetry } from "@/lib/system";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  await reconcileStaleBuildsOnce();

  const [projects, builds, telemetry] = await Promise.all([
    scanProjects(),
    listBuilds(),
    getSystemTelemetry().catch(() => null),
  ]);

  return (
    <DashboardClient
      initialProjects={projects}
      initialBuilds={builds}
      initialTelemetry={telemetry}
    />
  );
}

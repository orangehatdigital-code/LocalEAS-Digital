import fs from "fs/promises";
import { NextResponse } from "next/server";
import { deleteBuild, deleteBuildLog, getBuildById } from "@/lib/db";
import { resolveArtifactFile } from "@/lib/artifacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  context: { params: { id: string } },
) {
  try {
    const buildId = context.params.id;
    const build = await getBuildById(buildId);

    if (!build) {
      return NextResponse.json(
        { ok: false, error: "Build kaydı bulunamadı." },
        { status: 404 },
      );
    }

    // Delete artifact file if it exists
    if (build.artifactFilename) {
      const artifact = await resolveArtifactFile(build.artifactFilename);
      if (artifact) {
        try {
          await fs.unlink(artifact.fullPath);
        } catch {
          // Ignore if artifact file already missing
        }
      }
    }

    // Delete log file
    await deleteBuildLog(buildId);

    // Delete DB record
    await deleteBuild(buildId);

    return NextResponse.json({ ok: true, buildId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Build silinemedi.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

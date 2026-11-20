import { NextResponse } from "next/server";
import { listBuilds } from "@/lib/db";
import {
  enqueueBuild,
  getQueueSnapshotMeta,
  reconcileStaleBuildsOnce,
} from "@/lib/build-queue";
import type { TargetArchitecture } from "@/types/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ARCHS = new Set<TargetArchitecture>([
  "arm64-v8a",
  "arm64-v8a,x86_64",
  "armeabi-v7a,arm64-v8a,x86,x86_64",
]);

export async function GET() {
  try {
    await reconcileStaleBuildsOnce();
    const builds = await listBuilds();
    const queue = getQueueSnapshotMeta();
    return NextResponse.json({ builds, ...queue });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Build listesi alınamadı";
    return NextResponse.json({ error: message, builds: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectSlug?: string;
      profile?: string;
      architecture?: TargetArchitecture;
      autoCommit?: boolean;
      cleanTemp?: boolean;
    };

    if (!body.projectSlug || !body.profile) {
      return NextResponse.json(
        { error: "projectSlug ve profile zorunludur." },
        { status: 400 }
      );
    }

    const architecture: TargetArchitecture =
      body.architecture && ALLOWED_ARCHS.has(body.architecture)
        ? body.architecture
        : "arm64-v8a";

    const build = await enqueueBuild({
      projectSlug: body.projectSlug,
      profile: body.profile,
      architecture,
      autoCommit: Boolean(body.autoCommit),
      cleanTemp: body.cleanTemp !== false,
    });

    return NextResponse.json({ build }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Build başlatılamadı";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


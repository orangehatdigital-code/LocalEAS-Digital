import { NextResponse } from "next/server";
import { cancelBuild } from "@/lib/build-queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: Request,
  context: { params: { id: string } }
) {
  try {
    const build = await cancelBuild(context.params.id);
    if (!build) {
      return NextResponse.json(
        { ok: false, error: "Build bulunamadı." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, build });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Build iptal edilemedi.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


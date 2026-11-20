import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { findProjectBySlug } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(
  _req: Request,
  context: { params: { slug: string } }
) {
  const slug = context.params.slug;
  const project = await findProjectBySlug(slug);

  if (!project?.iconPath) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const fileBuffer = await fs.readFile(project.iconPath);
    const ext = path.posix.extname(project.iconPath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}


import { NextResponse } from "next/server";
import { scanProjects } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const projects = await scanProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Projeler taranamadı";
    return NextResponse.json({ error: message, projects: [] }, { status: 500 });
  }
}


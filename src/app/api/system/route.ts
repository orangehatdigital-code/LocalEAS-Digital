import { NextResponse } from "next/server";
import { getSystemTelemetry } from "@/lib/system";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const telemetry = await getSystemTelemetry();
    return NextResponse.json(telemetry);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sistem verisi alınamadı";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


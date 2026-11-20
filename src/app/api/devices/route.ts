import { NextResponse } from "next/server";
import { getConnectedDevices } from "@/lib/adb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const devices = await getConnectedDevices();
    return NextResponse.json({ devices });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cihazlar listelenemedi.";
    return NextResponse.json({ devices: [], error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cleanSystemDaemonsAndTmp } from "@/lib/system";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const telemetry = await cleanSystemDaemonsAndTmp();
    return NextResponse.json({ ok: true, telemetry });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Temizleme işlemi başarısız";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

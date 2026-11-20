import { NextResponse } from "next/server";
import { connectWirelessDevice } from "@/lib/adb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { host?: string };
    if (!body.host || !body.host.trim()) {
      return NextResponse.json(
        { ok: false, error: "Host (IP veya IP:port) zorunludur." },
        { status: 400 },
      );
    }

    const result = await connectWirelessDevice(body.host);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kablosuz bağlantı başarısız.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

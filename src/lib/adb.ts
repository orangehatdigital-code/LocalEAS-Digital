import path from "path";
import { resolveArtifactFile } from "./artifacts";
import { ARTIFACTS_DIR, runBashCommand, shellQuote } from "./env";

export interface ConnectedDevice {
  id: string;
  type: "device" | "emulator" | "offline" | "unauthorized";
  model?: string;
  product?: string;
}

/**
 * Returns list of connected Android devices via WSL2 ADB.
 */
export async function getConnectedDevices(): Promise<ConnectedDevice[]> {
  const res = await runBashCommand("adb devices -l", { timeoutMs: 5000 });
  if (res.exitCode !== 0) {
    return [];
  }

  const lines = res.stdout.split(/\r?\n/).slice(1); // skip "List of devices attached"
  const devices: ConnectedDevice[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const id = parts[0];
      const state = parts[1] as ConnectedDevice["type"];

      let model: string | undefined;
      let product: string | undefined;

      for (const token of parts.slice(2)) {
        if (token.startsWith("model:")) model = token.replace("model:", "");
        if (token.startsWith("product:"))
          product = token.replace("product:", "");
      }

      devices.push({
        id,
        type: state,
        model: model || id,
        product,
      });
    }
  }

  return devices;
}

/**
 * Connects to a wireless device via adb connect <ip:port>.
 */
export async function connectWirelessDevice(
  host: string,
): Promise<{ ok: boolean; output: string }> {
  const cleanHost = host.trim();
  const res = await runBashCommand(`adb connect ${shellQuote(cleanHost)}`, {
    timeoutMs: 10_000,
  });
  return {
    ok: res.exitCode === 0 && !res.stdout.toLowerCase().includes("failed"),
    output: (res.stdout || res.stderr).trim(),
  };
}

/**
 * Installs an APK artifact onto a connected device via adb install -r -d.
 */
export async function installArtifactToDevice(
  filename: string,
  deviceId?: string,
): Promise<{ ok: boolean; output: string }> {
  const artifact = await resolveArtifactFile(filename);
  if (!artifact) {
    return { ok: false, output: "Artifact dosyası bulunamadı." };
  }

  if (!artifact.filename.endsWith(".apk")) {
    return {
      ok: false,
      output:
        "Yalnızca .apk uzantılı dosyalar ADB ile kurulabilir (.aab bundle cihazda doğrudan kurulamaz).",
    };
  }

  const deviceArg = deviceId ? `-s ${shellQuote(deviceId)}` : "";
  const cmd = `adb ${deviceArg} install -r -d ${shellQuote(artifact.fullPath)}`;

  const res = await runBashCommand(cmd, { timeoutMs: 120_000 });
  const output = [res.stdout, res.stderr].filter(Boolean).join("\n").trim();
  const ok = res.exitCode === 0 && output.includes("Success");

  return {
    ok,
    output: ok
      ? "Uygulama başarıyla yüklendi (Success)."
      : output || "Yükleme başarısız oldu.",
  };
}

"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Cpu,
  HardDrive,
  Info,
  Loader2,
  MemoryStick,
  RefreshCw,
  Smartphone,
  Trash2,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { ConnectedDevice, SystemTelemetry } from "@/types/dashboard";

interface TopTelemetryBarProps {
  telemetry: SystemTelemetry | null;
  devices: ConnectedDevice[];
  activeBuildCount: number;
  queuedCount: number;
  lanHost: string;
  onLanHostChange: (value: string) => void;
  onRefresh: () => Promise<void>;
  onEmergencyClean: () => Promise<void>;
  onConnectWirelessDevice: (host: string) => Promise<void>;
  onCleanupArtifacts: (keepCount: number) => Promise<void>;
  isRefreshing: boolean;
  isCleaning: boolean;
  isCleaningArtifacts?: boolean;
}

const PORTPROXY_SNIPPET = `$wslIp = (wsl -d Ubuntu-22.04 hostname -I).Trim().Split(" ")[0]
netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=0.0.0.0
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIp`;

export function TopTelemetryBar({
  telemetry,
  devices,
  activeBuildCount,
  queuedCount,
  lanHost,
  onLanHostChange,
  onRefresh,
  onEmergencyClean,
  onConnectWirelessDevice,
  onCleanupArtifacts,
  isRefreshing,
  isCleaning,
  isCleaningArtifacts = false,
}: TopTelemetryBarProps) {
  const [lanDraft, setLanDraft] = useState(lanHost);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [wirelessHost, setWirelessHost] = useState("");
  const [isConnectingDevice, setIsConnectingDevice] = useState(false);

  const ramPct = telemetry?.ramPercent ?? 0;
  const swapPct = telemetry?.swapPercent ?? 0;

  const ramBarColor =
    ramPct >= 90
      ? "bg-rose-500"
      : ramPct >= 75
        ? "bg-amber-500"
        : "bg-emerald-500";

  const handleSaveLan = () => {
    const cleaned = lanDraft
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    onLanHostChange(cleaned || "localhost:3000");
  };

  const handleCopyPortproxy = async () => {
    try {
      await navigator.clipboard.writeText(PORTPROXY_SNIPPET);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleConnectWireless = async () => {
    if (!wirelessHost.trim()) return;
    setIsConnectingDevice(true);
    try {
      await onConnectWirelessDevice(wirelessHost.trim());
      setWirelessHost("");
    } finally {
      setIsConnectingDevice(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        {/* Brand + Queue Status */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/15 text-indigo-400">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
                  EAS Local Factory
                </h1>
                {activeBuildCount > 0 ? (
                  <Badge variant="warning" className="gap-1.5 text-[11px]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                    Build Aktif{queuedCount > 0 ? ` (+${queuedCount})` : ""}
                  </Badge>
                ) : (
                  <Badge variant="success" className="text-[11px]">
                    Hazır
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                WSL2 Android Build Hub • 0.0.0.0:3000
              </p>
            </div>
          </div>

          {/* Mobile Quick Actions */}
          <div className="flex items-center gap-1.5 lg:hidden">
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Yenile"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onEmergencyClean}
              disabled={isCleaning}
              aria-label="Daemon ve Temp Temizle"
              className="border-rose-500/30 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
            >
              {isCleaning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* System Metrics + ADB Status */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:flex lg:items-center lg:gap-3">
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1.5 lg:min-w-[130px]">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-zinc-400">
                <MemoryStick className="h-3 w-3" /> RAM
              </span>
              <span className="font-mono text-zinc-200">
                {telemetry
                  ? `${(telemetry.ramUsedMb / 1024).toFixed(1)}/${(telemetry.ramTotalMb / 1024).toFixed(1)}G`
                  : "-"}
              </span>
            </div>
            <Progress
              value={ramPct}
              className="h-1.5"
              indicatorClassName={ramBarColor}
            />
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1.5 lg:min-w-[120px]">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Swap</span>
              <span className="font-mono text-zinc-200">
                {telemetry
                  ? `${telemetry.swapUsedMb}/${telemetry.swapTotalMb}M`
                  : "-"}
              </span>
            </div>
            <Progress
              value={swapPct}
              className="h-1.5"
              indicatorClassName="bg-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] lg:gap-2">
            <span className="flex items-center gap-1 text-zinc-400">
              <HardDrive className="h-3 w-3" /> Disk
            </span>
            <span className="font-mono text-zinc-200">
              {telemetry ? `${telemetry.diskFreeHuman} boş` : "-"}
            </span>
          </div>

          {/* ADB Devices Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] transition-colors hover:border-zinc-700 lg:gap-2"
              >
                <span className="flex items-center gap-1 text-zinc-400">
                  <Smartphone className="h-3 w-3 text-indigo-400" /> ADB
                </span>
                <Badge
                  variant={devices.length > 0 ? "success" : "secondary"}
                  className="h-5 px-1.5 font-mono text-[10px]"
                >
                  {devices.length > 0 ? `${devices.length} Cihaz` : "0 Cihaz"}
                </Badge>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-zinc-100">
                    Bağlı Android Cihazlar
                  </h4>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    adb devices
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400">
                  APK derlemesi bittiğinde tek tıkla cihaza yükleyebilirsiniz.
                </p>
              </div>

              {devices.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-800 p-3 text-center text-xs text-zinc-500">
                  Bağlı cihaz bulunamadı. USB kabloyla telefon bağlayabilir veya
                  aşağıdan Wi-Fi ile bağlanabilirsiniz.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {devices.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-200">
                          {d.model || d.id}
                        </p>
                        <p className="font-mono text-[10px] text-zinc-500">
                          {d.id}
                        </p>
                      </div>
                      <Badge
                        variant={d.type === "device" ? "success" : "warning"}
                        className="text-[10px]"
                      >
                        {d.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <label className="text-[11px] font-medium text-zinc-300">
                  Kablosuz Cihaz Bağla (Wi-Fi ADB)
                </label>
                <div className="flex gap-2">
                  <Input
                    value={wirelessHost}
                    onChange={(e) => setWirelessHost(e.target.value)}
                    placeholder="192.168.1.50:5555"
                    className="h-8 font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0 text-xs"
                    onClick={handleConnectWireless}
                    disabled={isConnectingDevice}
                  >
                    {isConnectingDevice ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Bağlan"
                    )}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] lg:gap-2">
            <span className="text-zinc-400">Daemon</span>
            <Badge
              variant={
                (telemetry?.activeDaemons ?? 0) > 0 ? "warning" : "secondary"
              }
              className="h-5 px-1.5 font-mono text-[10px]"
            >
              {telemetry?.activeDaemons ?? 0}
            </Badge>
          </div>
        </div>

        {/* LAN Settings + Desktop Actions */}
        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <Popover
            onOpenChange={(open) => {
              if (open) setLanDraft(lanHost);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 font-mono text-xs"
              >
                <Wifi className="h-3.5 w-3.5 text-indigo-400" />
                <span className="max-w-[130px] truncate">{lanHost}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-zinc-100">
                  LAN / QR İndirme Adresi
                </h4>
                <p className="text-xs text-zinc-400">
                  Telefonun aynı Wi-Fi üzerinden APK indirebilmesi için Windows
                  LAN IP adresinizi girin (ör. 192.168.1.42:3000).
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={lanDraft}
                  onChange={(e) => setLanDraft(e.target.value)}
                  placeholder="192.168.1.42:3000"
                  className="h-8 font-mono text-xs"
                />
                <Button size="sm" className="h-8" onClick={handleSaveLan}>
                  Kaydet
                </Button>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-300">
                    <Info className="h-3 w-3 text-indigo-400" /> WSL2 LAN
                    PortProxy Yardımı
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyPortproxy}
                    className="h-6 px-2 text-[11px]"
                  >
                    {copiedCmd ? (
                      <>
                        <Check className="mr-1 h-3 w-3 text-emerald-400" />
                        Kopyalandı
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 h-3 w-3" />
                        Kopyala
                      </>
                    )}
                  </Button>
                </div>
                <pre className="terminal-scrollbar overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-[10px] leading-relaxed text-zinc-400">
                  {PORTPROXY_SNIPPET}
                </pre>
              </div>
            </PopoverContent>
          </Popover>

          <div className="hidden items-center gap-2 lg:flex">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs text-zinc-400 hover:text-zinc-200"
              onClick={() => onCleanupArtifacts(5)}
              disabled={isCleaningArtifacts}
              title="Son 5 artifact dışındaki eski build dosyalarını silerek disk açar"
            >
              {isCleaningArtifacts ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3 text-zinc-500" />
              )}
              Eski Çıktıları Temizle
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Yenile
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 border-rose-500/30 text-xs text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
              onClick={onEmergencyClean}
              disabled={isCleaning}
            >
              {isCleaning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Daemon Temizle
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

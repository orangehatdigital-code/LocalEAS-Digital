"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Info,
  Loader2,
  Menu,
  RefreshCw,
  Smartphone,
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
import { Separator } from "@/components/ui/separator";
import type { ConnectedDevice } from "@/types/dashboard";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  devices: ConnectedDevice[];
  lanHost: string;
  onLanHostChange: (value: string) => void;
  onRefresh: () => Promise<void>;
  onConnectWirelessDevice: (host: string) => Promise<void>;
  onOpenMobileMenu: () => void;
  isRefreshing: boolean;
}

const PORTPROXY_SNIPPET = `$wslIp = (wsl -d Ubuntu-22.04 hostname -I).Trim().Split(" ")[0]
netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=0.0.0.0
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIp`;

export function AppHeader({
  title,
  subtitle,
  devices,
  lanHost,
  onLanHostChange,
  onRefresh,
  onConnectWirelessDevice,
  onOpenMobileMenu,
  isRefreshing,
}: AppHeaderProps) {
  const [lanDraft, setLanDraft] = useState(lanHost);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [wirelessHost, setWirelessHost] = useState("");
  const [isConnectingDevice, setIsConnectingDevice] = useState(false);

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
    <header className="sticky top-0 z-20 flex h-14 w-full items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-4 backdrop-blur-md lg:px-6">
      {/* Left: Mobile Menu + View Title */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-zinc-100 lg:hidden"
          onClick={onOpenMobileMenu}
          aria-label="Menüyü aç"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            {title}
            {subtitle && (
              <span className="text-xs font-normal text-zinc-500 hidden sm:inline">
                • {subtitle}
              </span>
            )}
          </h2>
        </div>
      </div>

      {/* Right: Telemetry Quick Access & Actions */}
      <div className="flex items-center gap-2">
        {/* Connected ADB Device Pill */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 font-mono text-xs border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900"
            >
              <Smartphone className="h-3.5 w-3.5 text-indigo-400" />
              <span className="hidden sm:inline">ADB:</span>
              <span className="text-zinc-300">
                {devices.length > 0 ? `${devices.length} Cihaz` : "0 Cihaz"}
              </span>
              {devices.length > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-zinc-100">
                  Android Cihazlar
                </h4>
                <Badge variant="outline" className="font-mono text-[10px]">
                  adb devices
                </Badge>
              </div>
              <p className="text-xs text-zinc-400">
                USB veya yerel Wi-Fi ile bağlı Android cihazlar.
              </p>
            </div>

            {devices.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-800 p-3 text-center text-xs text-zinc-500">
                Bağlı cihaz yok. Telefonu USB ile bağlayabilir veya aşağıdaki Wi-Fi kutusundan IP ile bağlanabilirsiniz.
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
                Wi-Fi ADB ile Bağlan
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

        {/* LAN IP Host Pill */}
        <Popover
          onOpenChange={(open) => {
            if (open) setLanDraft(lanHost);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 font-mono text-xs border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900"
            >
              <Wifi className="h-3.5 w-3.5 text-indigo-400" />
              <span className="max-w-[120px] truncate">{lanHost}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3">
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-zinc-100">
                LAN / QR İndirme Adresi
              </h4>
              <p className="text-xs text-zinc-400">
                Telefonun aynı Wi-Fi üzerinden APK indirebilmesi için Windows LAN IP&apos;sini girin.
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
                  <Info className="h-3 w-3 text-indigo-400" /> WSL2 LAN PortProxy
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

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 text-xs gap-1.5"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Tüm verileri yenile"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Yenile</span>
        </Button>
      </div>
    </header>
  );
}


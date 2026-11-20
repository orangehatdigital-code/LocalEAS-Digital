"use client";

import { useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  Cpu,
  ExternalLink,
  FolderGit2,
  HardDrive,
  History,
  Info,
  Loader2,
  Mail,
  MemoryStick,
  Plus,
  RefreshCw,
  Smartphone,
  Sparkles,
  Terminal,
  Trash2,
  Users,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { ConnectedDevice, ProjectInfo, SystemTelemetry } from "@/types/dashboard";

interface AppSidebarProps {
  projects: ProjectInfo[];
  selectedProjectSlug: string | null;
  onSelectProjectSlug: (slug: string | null) => void;
  activeNav: "overview" | "projects" | "terminal" | "history";
  onSelectNav: (nav: "overview" | "projects" | "terminal" | "history") => void;
  telemetry: SystemTelemetry | null;
  devices: ConnectedDevice[];
  activeBuildCount: number;
  queuedCount: number;
  onOpenCloneModal: () => void;
  onEmergencyClean: () => Promise<void>;
  onCleanupArtifacts: (keepCount: number) => Promise<void>;
  isCleaning: boolean;
  isCleaningArtifacts?: boolean;
}

export function AppSidebar({
  projects,
  selectedProjectSlug,
  onSelectProjectSlug,
  activeNav,
  onSelectNav,
  telemetry,
  devices,
  activeBuildCount,
  queuedCount,
  onOpenCloneModal,
  onEmergencyClean,
  onCleanupArtifacts,
  isCleaning,
  isCleaningArtifacts = false,
}: AppSidebarProps) {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const ramPct = telemetry?.ramPercent ?? 0;
  const swapPct = telemetry?.swapPercent ?? 0;

  const ramBarColor =
    ramPct >= 90
      ? "bg-rose-500"
      : ramPct >= 75
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <>
      <aside className="flex h-full w-64 flex-col border-r border-zinc-800/80 bg-zinc-950 text-zinc-100 select-none">
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-zinc-800/80 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10 p-1 shadow-sm overflow-hidden">
              <img
                src="/assets/ohd_logo.png"
                alt="OrangeHat Digital Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-1.5">
                LocalEAS Digital
                <span className="text-[10px] text-orange-400 font-mono font-normal">v1.2</span>
              </h1>
              <p className="text-[10px] text-zinc-500 font-mono">by OrangeHat Digital</p>
            </div>
          </div>

          {activeBuildCount > 0 ? (
            <Badge variant="warning" className="h-5 px-1.5 gap-1 text-[10px]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {activeBuildCount} Aktif
            </Badge>
          ) : (
            <Badge variant="success" className="h-5 px-1.5 text-[10px]">
              Hazır
            </Badge>
          )}
        </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 terminal-scrollbar">
        {/* Workspace Switcher / Project Focus */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-2 text-[11px] font-medium text-zinc-400">
            <span>ÇALIŞMA ALANI</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-zinc-400 hover:text-zinc-100"
              onClick={onOpenCloneModal}
              title="Yeni Proje Klonla"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left text-xs text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
              >
                <div className="flex items-center gap-2 truncate">
                  <FolderGit2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate font-medium">
                    {selectedProjectSlug
                      ? projects.find((p) => p.slug === selectedProjectSlug)?.name || selectedProjectSlug
                      : "Tüm Projeler"}
                  </span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">Görünüm Filtresi</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onSelectProjectSlug(null)}>
                <span className="flex-1">Tüm Projeler ({projects.length})</span>
                {selectedProjectSlug === null && <Check className="h-3.5 w-3.5 text-indigo-400" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] text-zinc-500">PROJELER</DropdownMenuLabel>
              {projects.map((p) => {
                const isGeneric = p.name.toLowerCase() === "mobile" || p.name.toLowerCase() === "app";
                return (
                  <DropdownMenuItem key={p.slug} onClick={() => onSelectProjectSlug(p.slug)}>
                    <span className="truncate flex-1">
                      {p.name}
                      {isGeneric && p.folderName && (
                        <span className="text-[10px] text-zinc-500 ml-1">({p.folderName})</span>
                      )}
                    </span>
                    {selectedProjectSlug === p.slug && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* View Tabs */}
        <div className="space-y-1">
          <div className="px-2 text-[11px] font-medium text-zinc-400">GÖRÜNÜM</div>
          <nav className="space-y-0.5">
            <button
              type="button"
              onClick={() => onSelectNav("overview")}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                activeNav === "overview"
                  ? "bg-indigo-600/15 text-indigo-300 border border-indigo-500/20"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              <Cpu className="h-4 w-4" />
              <span>Genel Panel (HUD)</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectNav("projects")}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                activeNav === "projects"
                  ? "bg-indigo-600/15 text-indigo-300 border border-indigo-500/20"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FolderGit2 className="h-4 w-4" />
                <span>Expo Projeleri</span>
              </div>
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {projects.length}
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => onSelectNav("terminal")}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                activeNav === "terminal"
                  ? "bg-indigo-600/15 text-indigo-300 border border-indigo-500/20"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Terminal className="h-4 w-4" />
                <span>Canlı Terminal</span>
              </div>
              {activeBuildCount > 0 && (
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectNav("history")}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                activeNav === "history"
                  ? "bg-indigo-600/15 text-indigo-300 border border-indigo-500/20"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <History className="h-4 w-4" />
                <span>Geçmiş &amp; Çıktılar</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Quick Project Add Button */}
        <div className="pt-2">
          <Button
            size="sm"
            onClick={onOpenCloneModal}
            className="w-full justify-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Yeni Proje Ekle
          </Button>
        </div>

        {/* Connected ADB Device pill */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium">
              <Smartphone className="h-3.5 w-3.5 text-indigo-400" />
              Android Cihaz
            </span>
            <Badge
              variant={devices.length > 0 ? "success" : "secondary"}
              className="h-4 px-1 text-[10px]"
            >
              {devices.length > 0 ? `${devices.length} Bağlı` : "Yok"}
            </Badge>
          </div>
          {devices.length > 0 ? (
            <p className="truncate font-mono text-[10px] text-zinc-300">
              {devices[0].model || devices[0].id}
            </p>
          ) : (
            <p className="text-[10px] text-zinc-500">USB veya Wi-Fi ile bağlayın</p>
          )}
        </div>

        {/* OrangeHat Digital & Team Button */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setIsAboutOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border border-orange-500/25 bg-orange-500/5 px-2.5 py-2 text-left text-xs transition-all hover:border-orange-500/50 hover:bg-orange-500/10 group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-3.5 w-3.5 text-orange-400 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="truncate">
                <p className="font-semibold text-zinc-100 text-[11px] leading-tight truncate">
                  OrangeHat Digital
                </p>
                <p className="text-[10px] text-orange-400/80 truncate">Geliştiriciler &amp; Marka</p>
              </div>
            </div>
            <ExternalLink className="h-3 w-3 text-zinc-500 group-hover:text-orange-400 shrink-0 transition-colors" />
          </button>
        </div>
      </div>

      {/* Bottom System Telemetry Widget */}
      <div className="border-t border-zinc-800/80 bg-zinc-950/80 p-3 space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
          <span>WSL2 KAYNAKLARI</span>
          <span className="font-mono text-zinc-300 text-[10px]">
            {telemetry ? `${telemetry.diskFreeHuman} boş` : "-"}
          </span>
        </div>

        <div className="space-y-1.5">
          <div>
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
              <span>RAM</span>
              <span className="font-mono text-zinc-200">
                {telemetry
                  ? `${(telemetry.ramUsedMb / 1024).toFixed(1)} / ${(telemetry.ramTotalMb / 1024).toFixed(1)} GB`
                  : "-"}
              </span>
            </div>
            <Progress
              value={ramPct}
              className="h-1.5"
              indicatorClassName={ramBarColor}
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
              <span>Swap</span>
              <span className="font-mono text-zinc-200">
                {telemetry ? `${telemetry.swapUsedMb} / ${telemetry.swapTotalMb} MB` : "-"}
              </span>
            </div>
            <Progress
              value={swapPct}
              className="h-1.5"
              indicatorClassName="bg-indigo-500"
            />
          </div>
        </div>

        {/* Maintenance quick buttons */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCleanupArtifacts(5)}
            disabled={isCleaningArtifacts}
            className="h-7 px-1.5 text-[10px] text-zinc-400 hover:text-zinc-200"
            title="Son 5 build dışındakileri temizler"
          >
            {isCleaningArtifacts ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1 text-zinc-500" />
            )}
            Artifact Sil
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onEmergencyClean}
            disabled={isCleaning}
            className="h-7 px-1.5 text-[10px] border-rose-500/20 text-rose-300 hover:bg-rose-500/10"
            title="Gradle/Kotlin daemonlarını öldürür"
          >
            {isCleaning ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Daemon Sil
          </Button>
        </div>
      </div>
    </aside>

    {/* About & Developers Dialog */}
    <Dialog open={isAboutOpen} onOpenChange={setIsAboutOpen}>
      <DialogContent className="max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10 p-0.5 overflow-hidden">
              <img
                src="/assets/ohd_logo.png"
                alt="OrangeHat Digital Logo"
                className="h-full w-full object-contain"
              />
            </span>
            <span>Geliştiriciler &amp; Marka</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 pt-1">
            Bu proje{" "}
            <a
              href="https://orangehatdigital.com.tr/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:underline font-medium"
            >
              OrangeHat Digital
            </a>{" "}
            bünyesinde açık kaynak topluluğu için geliştirilmiştir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {/* Organization Card */}
          <a
            href="https://orangehatdigital.com.tr/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 hover:border-orange-500/40 hover:bg-orange-500/10 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10 p-1 overflow-hidden shadow-sm">
                <img
                  src="/assets/ohd_logo.png"
                  alt="OrangeHat Digital Logo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-100 group-hover:text-orange-300 transition-colors">
                  OrangeHat Digital
                </p>
                <p className="text-[11px] text-zinc-400">Topluluk &amp; Organizasyon</p>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-zinc-500 group-hover:text-orange-400 transition-colors" />
          </a>

          {/* Furkan Aslan Card */}
          <a
            href="https://furkanaslan.orangehatdigital.com.tr/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3 hover:border-zinc-700 hover:bg-zinc-900 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 font-bold text-sm">
                FA
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-100 group-hover:text-emerald-300 transition-colors">
                  Furkan Aslan
                </p>
                <p className="text-[11px] text-zinc-400">Geliştirici</p>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
          </a>

          {/* Kübra Kara Card */}
          <a
            href="https://kubrakara.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3 hover:border-zinc-700 hover:bg-zinc-900 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400 font-bold text-sm">
                KK
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-100 group-hover:text-indigo-300 transition-colors">
                  Kübra Kara
                </p>
                <p className="text-[11px] text-zinc-400">Geliştirici</p>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
          </a>

          {/* Contact & Feedback Box */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 text-center">
            <p className="text-xs font-medium text-zinc-200">İletişim &amp; Geri Bildirim</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Soru, öneri veya hata bildirimleriniz için bize e-posta ile ulaşabilirsiniz:
            </p>
            <a
              href="mailto:hello@orangehatdigital.com.tr"
              className="inline-flex items-center gap-1.5 mt-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/20 transition-colors"
            >
              <Mail className="h-3.5 w-3.5 text-orange-400" />
              hello@orangehatdigital.com.tr
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}


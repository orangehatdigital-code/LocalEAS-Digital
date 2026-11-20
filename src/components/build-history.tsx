"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Download,
  FolderOpen,
  History,
  Loader2,
  QrCode,
  Smartphone,
  Terminal,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BuildRecord, ConnectedDevice } from "@/types/dashboard";

interface BuildHistoryProps {
  builds: BuildRecord[];
  devices: ConnectedDevice[];
  selectedBuildId: string | null;
  lanHost: string;
  onSelectBuild: (build: BuildRecord) => void;
  onOpenExplorerFeedback: (message: string, isError?: boolean) => void;
  onInstallToDevice: (filename: string, deviceId?: string) => Promise<void>;
  onDeleteBuild: (buildId: string) => Promise<void>;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "-";
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins}dk ${secs}sn` : `${secs}sn`;
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "-";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function renderStatusBadge(status: BuildRecord["status"]) {
  switch (status) {
    case "queued":
      return <Badge variant="secondary">Kuyrukta</Badge>;
    case "building":
      return <Badge variant="warning">Derleniyor</Badge>;
    case "success":
      return <Badge variant="success">Başarılı</Badge>;
    case "failed":
      return <Badge variant="destructive">Hatalı</Badge>;
    case "cancelled":
      return <Badge variant="outline">İptal</Badge>;
  }
}

export function BuildHistory({
  builds,
  devices,
  selectedBuildId,
  lanHost,
  onSelectBuild,
  onOpenExplorerFeedback,
  onInstallToDevice,
  onDeleteBuild,
}: BuildHistoryProps) {
  const [qrBuild, setQrBuild] = useState<BuildRecord | null>(null);
  const [deleteConfirmBuild, setDeleteConfirmBuild] = useState<BuildRecord | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [openingFile, setOpeningFile] = useState<string | null>(null);
  const [installingFile, setInstallingFile] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const qrUrl =
    qrBuild?.artifactFilename
      ? `http://${lanHost}/api/artifacts/${encodeURIComponent(qrBuild.artifactFilename)}`
      : "";

  const isLocalhostHost =
    lanHost.startsWith("localhost") || lanHost.startsWith("127.0.0.1");

  const handleCopyQrUrl = async () => {
    if (!qrUrl) return;
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleOpenExplorer = async (filename: string) => {
    setOpeningFile(filename);
    try {
      const res = await fetch(
        `/api/artifacts/${encodeURIComponent(filename)}/open`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        windowsPath?: string;
        error?: string;
      };
      if (res.ok && data.ok) {
        onOpenExplorerFeedback(`Explorer açıldı: ${data.windowsPath ?? filename}`);
      } else {
        onOpenExplorerFeedback(
          data.error ?? "Explorer açılamadı.",
          true
        );
      }
    } catch (err) {
      onOpenExplorerFeedback(
        err instanceof Error ? err.message : "Explorer isteği başarısız.",
        true
      );
    } finally {
      setOpeningFile(null);
    }
  };

  const handleInstallAdb = async (filename: string) => {
    setInstallingFile(filename);
    try {
      await onInstallToDevice(filename);
    } finally {
      setInstallingFile(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmBuild) return;
    setIsDeleting(true);
    try {
      await onDeleteBuild(deleteConfirmBuild.id);
      setDeleteConfirmBuild(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="border-zinc-800/90 bg-zinc-900/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-indigo-400" />
              Build Geçmişi &amp; Çıktılar
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-[11px]">
              {builds.length} kayıt
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-2.5">
          {builds.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center text-xs text-zinc-500">
              Henüz kayıtlı build bulunmuyor.
            </div>
          ) : (
            builds.map((build) => {
              const isSelected = build.id === selectedBuildId;
              const isSuccess =
                build.status === "success" && Boolean(build.artifactFilename);
              const isApk = build.artifactFilename?.endsWith(".apk");

              return (
                <div
                  key={build.id}
                  onClick={() => onSelectBuild(build)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectBuild(build);
                    }
                  }}
                  className={`flex cursor-pointer flex-col gap-2.5 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                    isSelected
                      ? "border-indigo-500/50 bg-indigo-500/10"
                      : "border-zinc-800/80 bg-zinc-950/50 hover:border-zinc-700"
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {renderStatusBadge(build.status)}
                      <span className="truncate text-sm font-medium text-zinc-100">
                        {build.projectName}
                      </span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {build.profile} • {build.outputType.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[10px] text-zinc-400">
                        {build.architecture}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(build.createdAt)}
                      </span>
                      <span className="font-mono">
                        Süre: {formatDuration(build.durationMs)}
                      </span>
                      {build.artifactSizeBytes !== null && (
                        <span className="font-mono text-zinc-300">
                          {formatBytes(build.artifactSizeBytes)}
                        </span>
                      )}
                    </div>

                    {build.errorMessage && (
                      <p className="truncate text-[11px] text-rose-400">
                        {build.errorMessage}
                      </p>
                    )}
                  </div>

                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => onSelectBuild(build)}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      Log
                    </Button>

                    {isSuccess && build.artifactFilename && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 gap-1 px-2.5 text-xs"
                          asChild
                        >
                          <a
                            href={`/api/artifacts/${encodeURIComponent(build.artifactFilename)}`}
                            download={build.artifactFilename}
                          >
                            <Download className="h-3.5 w-3.5" />
                            İndir
                          </a>
                        </Button>

                        {/* ADB Install button for APK files */}
                        {isApk && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2.5 text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            disabled={installingFile === build.artifactFilename}
                            onClick={() => handleInstallAdb(build.artifactFilename!)}
                            title={
                              devices.length > 0
                                ? `Bağlı cihaza kur (${devices[0].model || devices[0].id})`
                                : "Bağlı Android cihaz veya emülatöre kurar"
                            }
                          >
                            {installingFile === build.artifactFilename ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Smartphone className="h-3.5 w-3.5" />
                            )}
                            ADB Kur
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2.5 text-xs"
                          onClick={() => setQrBuild(build)}
                        >
                          <QrCode className="h-3.5 w-3.5 text-indigo-400" />
                          QR
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs"
                          disabled={openingFile === build.artifactFilename}
                          onClick={() =>
                            handleOpenExplorer(build.artifactFilename!)
                          }
                          aria-label="Windows Explorer'da aç"
                        >
                          {openingFile === build.artifactFilename ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FolderOpen className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">Explorer</span>
                        </Button>
                      </>
                    )}

                    {/* Delete build action */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-zinc-500 hover:text-rose-400"
                      onClick={() => setDeleteConfirmBuild(build)}
                      aria-label="Build kaydını sil"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
      <Dialog
        open={qrBuild !== null}
        onOpenChange={(open) => {
          if (!open) setQrBuild(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Telefondan İndir (QR)</DialogTitle>
            <DialogDescription>
              {qrBuild?.projectName} • {qrBuild?.artifactFilename}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            {isLocalhostHost && (
              <div className="flex w-full items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  Şu an adres <strong>{lanHost}</strong> görünüyor. Telefondan
                  okutmak için üst bardan Windows LAN IP&apos;nizi girin (ör.{" "}
                  <code className="font-mono">192.168.1.42:3000</code>).
                </span>
              </div>
            )}

            <div className="rounded-xl bg-white p-4 shadow-inner">
              <QRCodeSVG value={qrUrl} size={200} level="M" />
            </div>

            <div className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2">
              <code className="flex-1 truncate font-mono text-[11px] text-zinc-300">
                {qrUrl}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={handleCopyQrUrl}
                aria-label="İndirme linkini kopyala"
              >
                {copiedUrl ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmBuild !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmBuild(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Build Kaydını Sil</DialogTitle>
            <DialogDescription>
              Bu işlem build geçmişini, log dosyasını ve varsa üretilen artifact
              dosyasını diskten kalıcı olarak silecektir.
            </DialogDescription>
          </DialogHeader>

          {deleteConfirmBuild && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs space-y-1">
              <p className="text-zinc-200 font-medium">{deleteConfirmBuild.projectName}</p>
              <p className="text-zinc-400 font-mono">
                {deleteConfirmBuild.profile} • {deleteConfirmBuild.outputType.toUpperCase()}
              </p>
              {deleteConfirmBuild.artifactFilename && (
                <p className="text-zinc-500 font-mono truncate">
                  Dosya: {deleteConfirmBuild.artifactFilename}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmBuild(null)}
              disabled={isDeleting}
            >
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" />
              )}
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

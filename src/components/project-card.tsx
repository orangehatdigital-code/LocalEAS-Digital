"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
  Smartphone,
  Trash2,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  ProjectActionResponse,
  ProjectInfo,
  TargetArchitecture,
} from "@/types/dashboard";

interface ProjectCardProps {
  project: ProjectInfo;
  onStartBuild: (params: {
    projectSlug: string;
    profile: string;
    architecture: TargetArchitecture;
    autoCommit: boolean;
  }) => Promise<void>;
  onActionComplete: () => Promise<void>;
  isStartingBuild?: boolean;
}

function formatProfileLabel(name: string, outputType: "apk" | "aab"): string {
  const ext = outputType.toUpperCase();
  if (name === "development") return `Dev ${ext}`;
  if (name === "preview") return `Preview ${ext}`;
  if (name === "production") return `Prod ${ext}`;
  return `${name} ${ext}`;
}

export function ProjectCard({
  project,
  onStartBuild,
  onActionComplete,
  isStartingBuild = false,
}: ProjectCardProps) {
  const [architecture, setArchitecture] =
    useState<TargetArchitecture>("arm64-v8a");
  const [autoCommit, setAutoCommit] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const [actionLoading, setActionLoading] = useState<
    "git-pull" | "fix-deps" | null
  >(null);
  const [actionResult, setActionResult] =
    useState<ProjectActionResponse | null>(null);
  const [startingProfile, setStartingProfile] = useState<string | null>(null);

  // Edit Project Dialog State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editSlug, setEditSlug] = useState(project.slug);
  const [editVersion, setEditVersion] = useState(project.version);
  const [editVersionCode, setEditVersionCode] = useState(
    project.versionCode ? String(project.versionCode) : "1"
  );
  const [editPackage, setEditPackage] = useState(project.androidPackage ?? "");
  const [editFolderName, setEditFolderName] = useState(project.folderName);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Project Dialog State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Synchronize form when project changes
  useEffect(() => {
    setEditName(project.name);
    setEditSlug(project.slug);
    setEditVersion(project.version);
    setEditVersionCode(project.versionCode ? String(project.versionCode) : "1");
    setEditPackage(project.androidPackage ?? "");
    setEditFolderName(project.folderName);
  }, [project]);

  const handleRunAction = async (action: "git-pull" | "fix-deps") => {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/projects/${project.slug}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as ProjectActionResponse & {
        error?: string;
      };
      setActionResult({
        ok: Boolean(data.ok),
        action,
        output: data.output || data.error || "Tamamlandı.",
        exitCode: data.exitCode ?? (res.ok ? 0 : 1),
      });
      await onActionComplete();
    } catch (err) {
      setActionResult({
        ok: false,
        action,
        output: err instanceof Error ? err.message : "İstek başarısız oldu.",
        exitCode: 1,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editName.trim()) {
      setEditError("Uygulama adı boş bırakılamaz.");
      return;
    }
    if (!editSlug.trim()) {
      setEditError("Slug boş bırakılamaz.");
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/projects/${project.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          slug: editSlug.trim(),
          version: editVersion.trim() || "1.0.0",
          versionCode: editVersionCode ? parseInt(editVersionCode, 10) : 1,
          androidPackage: editPackage.trim() || undefined,
          folderName: editFolderName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Proje güncellenemedi.");
      }

      setIsEditOpen(false);
      await onActionComplete();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Bilinmeyen hata.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/projects/${project.slug}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Proje silinemedi.");
      }

      setIsDeleteOpen(false);
      setIsEditOpen(false);
      await onActionComplete();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Silme başarısız.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBuildClick = async (profile: string) => {
    setStartingProfile(profile);
    try {
      await onStartBuild({
        projectSlug: project.slug,
        profile,
        architecture,
        autoCommit,
      });
    } finally {
      setStartingProfile(null);
    }
  };

  const isGenericName =
    project.name.toLowerCase() === "mobile" ||
    project.name.toLowerCase() === "app";

  return (
    <>
      <Card className="border-zinc-800/90 bg-zinc-900/80 transition-colors hover:border-zinc-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                {project.hasIcon && !iconFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/projects/${project.slug}/icon`}
                    alt={project.name}
                    className="h-full w-full object-cover"
                    onError={() => setIconFailed(true)}
                  />
                ) : (
                  <Smartphone className="h-5 w-5 text-zinc-500" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="truncate text-sm font-semibold text-zinc-100">
                    {project.name}
                  </h2>
                  {isGenericName && project.folderName && (
                    <span
                      className="font-mono text-[11px] text-amber-400 font-medium"
                      title="Proje klasör adı"
                    >
                      ({project.folderName})
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-zinc-500">
                    v{project.version}
                    {project.versionCode ? ` (${project.versionCode})` : ""}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 pt-0.5">
                  {project.androidPackage ? (
                    <p className="truncate font-mono text-[11px] text-zinc-400">
                      {project.androidPackage}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditOpen(true)}
                      className="flex items-center gap-1 font-mono text-[11px] text-amber-400/90 hover:text-amber-300 hover:underline transition-colors"
                      title="Android paket kimliği ve uygulama adını düzenlemek için tıklayın"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      <span>Paket Adı Belirlenmedi (Düzenle)</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {project.sdkVersion && (
                <Badge variant="secondary" className="text-[10px]">
                  {project.sdkVersion}
                </Badge>
              )}
              {project.isMonorepoSubdir && (
                <Badge variant="outline" className="text-[10px] text-zinc-400">
                  mobile/
                </Badge>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-zinc-400"
                    disabled={actionLoading !== null}
                    aria-label="Proje işlemleri menüsü"
                  >
                    {actionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MoreVertical className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Proje İşlemleri</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                    <Pencil className="h-3.5 w-3.5 text-indigo-400 mr-2" />
                    Projeyi Düzenle (İsim / Paket)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRunAction("git-pull")}>
                    <FolderGit2 className="h-3.5 w-3.5 text-emerald-400 mr-2" />
                    Git Pull
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRunAction("fix-deps")}>
                    <Wrench className="h-3.5 w-3.5 text-amber-400 mr-2" />
                    Fix Dependencies
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setIsDeleteOpen(true)}
                    className="text-rose-400 focus:bg-rose-950/40 focus:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Projeyi Sil...
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pb-3">
          {/* Git Info Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-2.5 py-1.5 text-[11px]">
            <div className="flex min-w-0 items-center gap-2 text-zinc-300">
              <span className="flex items-center gap-1 font-mono text-indigo-300">
                <GitBranch className="h-3 w-3" />
                {project.git.branch}
              </span>
              <span className="flex items-center gap-1 font-mono text-zinc-500">
                <GitCommitHorizontal className="h-3 w-3" />
                {project.git.commitHash}
              </span>
              {project.git.commitMessage && (
                <span className="hidden truncate text-zinc-500 sm:inline max-w-[160px]">
                  {project.git.commitMessage}
                </span>
              )}
            </div>
            {project.git.isDirty ? (
              <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                Dirty Tree
              </Badge>
            ) : (
              <Badge variant="success" className="h-5 px-1.5 text-[10px]">
                Clean
              </Badge>
            )}
          </div>

          {/* Arch & Auto-Commit Controls */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
            <Select
              value={architecture}
              onValueChange={(v) => setArchitecture(v as TargetArchitecture)}
            >
              <SelectTrigger aria-label="Hedef Mimari">
                <SelectValue placeholder="Mimari seçin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="arm64-v8a">
                  arm64-v8a (Telefon — En Hızlı)
                </SelectItem>
                <SelectItem value="arm64-v8a,x86_64">
                  arm64-v8a, x86_64 (Tel + Emülatör)
                </SelectItem>
                <SelectItem value="armeabi-v7a,arm64-v8a,x86,x86_64">
                  Tüm Mimariler (Full Bundle)
                </SelectItem>
              </SelectContent>
            </Select>

            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-zinc-800/80 bg-zinc-950/40 px-2.5 py-1.5 text-xs text-zinc-300">
              <span>Auto-Commit</span>
              <Switch
                checked={autoCommit}
                onCheckedChange={setAutoCommit}
                aria-label="Build öncesi otomatik commit"
              />
            </label>
          </div>
        </CardContent>

        <CardFooter className="flex flex-wrap gap-2 pt-0">
          {project.profiles.map((profile) => {
            const isThisStarting =
              isStartingBuild && startingProfile === profile.name;
            const isProd = profile.name === "production";
            return (
              <Button
                key={profile.name}
                size="sm"
                variant={isProd ? "default" : "secondary"}
                disabled={isStartingBuild}
                onClick={() => handleBuildClick(profile.name)}
                className="flex-1 text-xs"
              >
                {isThisStarting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {formatProfileLabel(profile.name, profile.outputType)}
              </Button>
            );
          })}
        </CardFooter>
      </Card>

      {/* Edit Project Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleSaveProject} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base text-zinc-100">
                <Pencil className="h-4 w-4 text-indigo-400" />
                <span>Projeyi Düzenle (app.json)</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                Uygulama adı, paket kimliği ve sürüm bilgilerini güncelleyin.
                Değişiklikler doğrudan <code>app.json</code> dosyasına kaydedilir.
              </DialogDescription>
            </DialogHeader>

            {editError && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-800/60 bg-rose-950/40 p-2.5 text-xs text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{editError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Uygulama Adı (Name)
                </label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Örn: Block Block Block"
                  required
                  className="h-9 text-xs"
                />
                <p className="text-[11px] text-zinc-500">
                  Telefon ana ekranında ve buildlerde görünen uygulama adı.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Expo Slug
                  </label>
                  <Input
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    placeholder="Örn: block-block-block"
                    required
                    className="h-9 font-mono text-xs"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Tireli küçük harfli tanımlayıcı.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Android Paket Adı (Package)
                  </label>
                  <Input
                    value={editPackage}
                    onChange={(e) => setEditPackage(e.target.value)}
                    placeholder="Örn: com.example.myapp"
                    className="h-9 font-mono text-xs"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Android OS & Google Play paket kimliği.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Sürüm (version)
                  </label>
                  <Input
                    value={editVersion}
                    onChange={(e) => setEditVersion(e.target.value)}
                    placeholder="1.0.0"
                    required
                    className="h-9 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Build Numarası (versionCode)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={editVersionCode}
                    onChange={(e) => setEditVersionCode(e.target.value)}
                    placeholder="1"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5 border-t border-zinc-800/80 pt-3">
                <label className="text-xs font-medium text-zinc-300">
                  Repo Klasör Adı (Opsiyonel)
                </label>
                <Input
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  placeholder={project.folderName}
                  className="h-9 font-mono text-xs text-zinc-400"
                />
                <p className="text-[11px] text-zinc-500">
                  Projeler dizini altındaki klasör adı. Değiştirilirse disk üzerindeki klasör yeniden adlandırılır.
                </p>
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-zinc-800/80">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 justify-start px-2.5"
                onClick={() => {
                  setIsEditOpen(false);
                  setIsDeleteOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Projeyi Sil...
              </Button>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(false)}
                  disabled={isSaving}
                  className="text-xs"
                >
                  Vazgeç
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white min-w-[80px]"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Kaydet
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-rose-400">
              <Trash2 className="h-4 w-4" />
              <span>Projeyi Sil</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Bu işlem geri alınamaz. Lütfen onaylamadan önce kontrol edin.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-800/60 bg-rose-950/40 p-2.5 text-xs text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{deleteError}</span>
            </div>
          )}

          <div className="rounded-lg border border-rose-950/80 bg-rose-950/30 p-3 space-y-2 text-xs text-zinc-300">
            <p>
              <strong className="text-rose-300">{project.name}</strong> projesi ve
              bütün kaynak kodları diskten kalıcı olarak silinecektir:
            </p>
            <code className="block rounded bg-zinc-950/90 p-2 font-mono text-[11px] text-zinc-400 break-all border border-zinc-800">
              {project.repoRoot}
            </code>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteOpen(false)}
              disabled={isDeleting}
              className="text-xs"
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteProject}
              disabled={isDeleting}
              className="text-xs bg-rose-600 hover:bg-rose-500 text-white min-w-[100px]"
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Kalıcı Olarak Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maintenance Action Output Dialog */}
      <Dialog
        open={actionResult !== null}
        onOpenChange={(open) => {
          if (!open) setActionResult(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span>
                {actionResult?.action === "git-pull"
                  ? "Git Pull Çıktısı"
                  : "Bağımlılık Kontrolü / Fix Çıktısı"}
              </span>
              <Badge
                variant={actionResult?.ok ? "success" : "destructive"}
                className="text-[11px]"
              >
                Exit {actionResult?.exitCode}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {project.name} ({project.slug})
            </DialogDescription>
          </DialogHeader>
          <pre className="terminal-scrollbar max-h-80 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap break-words">
            {actionResult?.output}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}

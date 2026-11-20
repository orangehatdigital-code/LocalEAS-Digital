"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FolderGit2,
  FolderKanban,
  GitBranch,
  History,
  LayoutDashboard,
  Loader2,
  PackageX,
  Plus,
  Smartphone,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type {
  BuildRecord,
  ConnectedDevice,
  ProjectInfo,
  SystemTelemetry,
  TargetArchitecture,
} from "@/types/dashboard";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { BuildHistory } from "./build-history";
import { LiveTerminal } from "./live-terminal";
import { ProjectCard } from "./project-card";

interface DashboardClientProps {
  initialProjects: ProjectInfo[];
  initialBuilds: BuildRecord[];
  initialTelemetry: SystemTelemetry | null;
}

const LAN_STORAGE_KEY = "eas_dashboard_lan_host";

export function DashboardClient({
  initialProjects,
  initialBuilds,
  initialTelemetry,
}: DashboardClientProps) {
  const [projects, setProjects] = useState<ProjectInfo[]>(initialProjects);
  const [builds, setBuilds] = useState<BuildRecord[]>(initialBuilds);
  const [telemetry, setTelemetry] = useState<SystemTelemetry | null>(
    initialTelemetry
  );
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);

  // Selected project for focused view (null = All projects)
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string | null>(null);

  // Active view tab in sidebar
  const [activeNav, setActiveNav] = useState<"overview" | "projects" | "terminal" | "history">(
    "overview"
  );

  // Mobile drawer open state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Active build selected in terminal
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(() => {
    const live = initialBuilds.find(
      (b) => b.status === "building" || b.status === "queued"
    );
    return live?.id ?? initialBuilds[0]?.id ?? null;
  });

  const [lanHost, setLanHost] = useState("localhost:3000");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isCleaningArtifacts, setIsCleaningArtifacts] = useState(false);
  const [isStartingBuild, setIsStartingBuild] = useState(false);

  // Clone Project Modal state
  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneBranch, setCloneBranch] = useState("");
  const [cloneFolderName, setCloneFolderName] = useState("");
  const [cloneInstallDeps, setCloneInstallDeps] = useState(true);
  const [isCloning, setIsCloning] = useState(false);

  const [notice, setNotice] = useState<{
    message: string;
    isError?: boolean;
  } | null>(null);

  const showNotice = useCallback((message: string, isError = false) => {
    setNotice({ message, isError });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAN_STORAGE_KEY);
      if (saved) {
        setLanHost(saved);
      } else if (window.location.host) {
        setLanHost(window.location.host);
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const handleLanHostChange = useCallback(
    (value: string) => {
      setLanHost(value);
      try {
        window.localStorage.setItem(LAN_STORAGE_KEY, value);
      } catch {
        // Ignore storage errors
      }
      showNotice(`LAN adresi güncellendi: ${value}`);
    },
    [showNotice]
  );

  const fetchBuildsAndTelemetry = useCallback(async () => {
    try {
      const [buildsRes, sysRes, devRes] = await Promise.all([
        fetch("/api/builds", { cache: "no-store" }),
        fetch("/api/system", { cache: "no-store" }),
        fetch("/api/devices", { cache: "no-store" }),
      ]);
      if (buildsRes.ok) {
        const data = (await buildsRes.json()) as { builds?: BuildRecord[] };
        if (Array.isArray(data.builds)) {
          setBuilds(data.builds);
        }
      }
      if (sysRes.ok) {
        const sysData = (await sysRes.json()) as SystemTelemetry;
        setTelemetry(sysData);
      }
      if (devRes.ok) {
        const devData = (await devRes.json()) as { devices?: ConnectedDevice[] };
        if (Array.isArray(devData.devices)) {
          setDevices(devData.devices);
        }
      }
    } catch {
      // Silent background poll retry
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [projRes, buildsRes, sysRes, devRes] = await Promise.all([
        fetch("/api/projects", { cache: "no-store" }),
        fetch("/api/builds", { cache: "no-store" }),
        fetch("/api/system", { cache: "no-store" }),
        fetch("/api/devices", { cache: "no-store" }),
      ]);
      if (projRes.ok) {
        const projData = (await projRes.json()) as { projects?: ProjectInfo[] };
        if (Array.isArray(projData.projects)) setProjects(projData.projects);
      }
      if (buildsRes.ok) {
        const buildData = (await buildsRes.json()) as {
          builds?: BuildRecord[];
        };
        if (Array.isArray(buildData.builds)) setBuilds(buildData.builds);
      }
      if (sysRes.ok) {
        const sysData = (await sysRes.json()) as SystemTelemetry;
        setTelemetry(sysData);
      }
      if (devRes.ok) {
        const devData = (await devRes.json()) as { devices?: ConnectedDevice[] };
        if (Array.isArray(devData.devices)) setDevices(devData.devices);
      }
    } catch {
      showNotice("Veriler yenilenirken hata oluştu.", true);
    } finally {
      setIsRefreshing(false);
    }
  }, [showNotice]);

  const hasLiveBuild = useMemo(
    () => builds.some((b) => b.status === "building" || b.status === "queued"),
    [builds]
  );

  useEffect(() => {
    void fetchBuildsAndTelemetry();

    const intervalMs = hasLiveBuild ? 4000 : 12000;
    const id = setInterval(() => {
      void fetchBuildsAndTelemetry();
    }, intervalMs);
    return () => clearInterval(id);
  }, [hasLiveBuild, fetchBuildsAndTelemetry]);

  const handleEmergencyClean = async () => {
    setIsCleaning(true);
    try {
      const res = await fetch("/api/system/clean", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        telemetry?: SystemTelemetry;
        error?: string;
      };
      if (res.ok && data.telemetry) {
        setTelemetry(data.telemetry);
        showNotice("Gradle/Kotlin daemonları ve /tmp temizlendi.");
      } else {
        showNotice(data.error ?? "Temizleme başarısız oldu.", true);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "Temizleme isteği başarısız.",
        true
      );
    } finally {
      setIsCleaning(false);
    }
  };

  const handleCleanupArtifacts = async (keepCount = 5) => {
    setIsCleaningArtifacts(true);
    try {
      const res = await fetch("/api/artifacts/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepCount }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        deletedCount?: number;
        freedMb?: string;
        error?: string;
      };
      if (res.ok && data.ok) {
        showNotice(
          `${data.deletedCount} eski artifact silindi, ${data.freedMb} MB disk alanı kazanıldı.`
        );
        await refreshAll();
      } else {
        showNotice(data.error ?? "Artifact temizliği başarısız.", true);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "Temizlik isteği başarısız.",
        true
      );
    } finally {
      setIsCleaningArtifacts(false);
    }
  };

  const handleConnectWirelessDevice = async (host: string) => {
    try {
      const res = await fetch("/api/devices/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        output?: string;
        error?: string;
      };
      if (res.ok && data.ok) {
        showNotice(`ADB bağlandı: ${host}`);
        await refreshAll();
      } else {
        showNotice(data.output || data.error || "Bağlantı başarısız.", true);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "Bağlantı isteği başarısız.",
        true
      );
    }
  };

  const handleInstallToDevice = async (filename: string, deviceId?: string) => {
    try {
      const res = await fetch(
        `/api/artifacts/${encodeURIComponent(filename)}/install`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId }),
        }
      );
      const data = (await res.json()) as { ok?: boolean; output?: string };
      if (res.ok && data.ok) {
        showNotice(`APK cihaza başarıyla yüklendi! (${filename})`);
      } else {
        showNotice(data.output || "Cihaza yüklenemedi.", true);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "ADB yükleme isteği başarısız.",
        true
      );
    }
  };

  const handleDeleteBuild = async (buildId: string) => {
    try {
      const res = await fetch(`/api/builds/${encodeURIComponent(buildId)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setBuilds((prev) => prev.filter((b) => b.id !== buildId));
        if (selectedBuildId === buildId) {
          setSelectedBuildId(null);
        }
        showNotice("Build kaydı ve dosyaları silindi.");
      } else {
        showNotice(data.error ?? "Build silinemedi.", true);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "Silme isteği başarısız.",
        true
      );
    }
  };

  const handleCloneProject = async () => {
    if (!cloneUrl.trim()) return;
    setIsCloning(true);
    try {
      const res = await fetch("/api/projects/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: cloneUrl.trim(),
          branch: cloneBranch.trim() || undefined,
          folderName: cloneFolderName.trim() || undefined,
          installDeps: cloneInstallDeps,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        folderName?: string;
        error?: string;
      };
      if (res.ok && data.ok) {
        showNotice(
          `'${data.folderName}' başarıyla klonlandı ve listeye eklendi!`
        );
        setIsCloneOpen(false);
        setCloneUrl("");
        setCloneBranch("");
        setCloneFolderName("");
        await refreshAll();
      } else {
        showNotice(data.error ?? "Klonlama işlemi başarısız.", true);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "Klonlama isteği başarısız.",
        true
      );
    } finally {
      setIsCloning(false);
    }
  };

  const handleStartBuild = async (params: {
    projectSlug: string;
    profile: string;
    architecture: TargetArchitecture;
    autoCommit: boolean;
  }) => {
    setIsStartingBuild(true);
    try {
      const res = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params,
          cleanTemp: true,
        }),
      });
      const data = (await res.json()) as {
        build?: BuildRecord;
        error?: string;
      };
      if (!res.ok || !data.build) {
        showNotice(data.error ?? "Build başlatılamadı.", true);
        return;
      }

      setBuilds((prev) => [data.build!, ...prev]);
      setSelectedBuildId(data.build.id);
      setActiveNav("terminal");
      showNotice(`${data.build.projectName} (${data.build.profile}) kuyruğa alındı.`);
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "Build isteği başarısız.",
        true
      );
    } finally {
      setIsStartingBuild(false);
    }
  };

  const handleBuildUpdated = useCallback((updated: BuildRecord) => {
    setBuilds((prev) => {
      const idx = prev.findIndex((b) => b.id === updated.id);
      if (idx < 0) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const handleCancelBuild = async (buildId: string) => {
    try {
      const res = await fetch(`/api/builds/${buildId}/cancel`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        build?: BuildRecord;
        error?: string;
      };
      if (res.ok && data.build) {
        handleBuildUpdated(data.build);
        showNotice("Build iptal edildi.");
      } else {
        showNotice(data.error ?? "Build iptal edilemedi.", true);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "İptal isteği başarısız.",
        true
      );
    }
  };

  const selectedBuild = useMemo(
    () => builds.find((b) => b.id === selectedBuildId) ?? null,
    [builds, selectedBuildId]
  );

  const currentProject = useMemo(() => {
    if (!selectedBuild) return null;
    return projects.find((p) => p.slug === selectedBuild.projectSlug) ?? null;
  }, [projects, selectedBuild]);

  const activeBuildCount = useMemo(
    () => builds.filter((b) => b.status === "building").length,
    [builds]
  );
  const queuedCount = useMemo(
    () => builds.filter((b) => b.status === "queued").length,
    [builds]
  );

  // Filter projects by selected slug if focused
  const visibleProjects = useMemo(() => {
    if (!selectedProjectSlug) return projects;
    return projects.filter((p) => p.slug === selectedProjectSlug);
  }, [projects, selectedProjectSlug]);

  // Filter builds by selected project if focused
  const visibleBuilds = useMemo(() => {
    if (!selectedProjectSlug) return builds;
    return builds.filter((b) => b.projectSlug === selectedProjectSlug);
  }, [builds, selectedProjectSlug]);

  const viewTitle = useMemo(() => {
    if (selectedProjectSlug) {
      const p = projects.find((item) => item.slug === selectedProjectSlug);
      return p ? p.name : selectedProjectSlug;
    }
    switch (activeNav) {
      case "overview":
        return "Genel Bakış (HUD)";
      case "projects":
        return "Expo Projeleri";
      case "terminal":
        return "Canlı Terminal";
      case "history":
        return "Build Geçmişi & Çıktılar";
    }
  }, [selectedProjectSlug, activeNav, projects]);

  const sidebarComponent = (
    <AppSidebar
      projects={projects}
      selectedProjectSlug={selectedProjectSlug}
      onSelectProjectSlug={(slug) => {
        setSelectedProjectSlug(slug);
        setIsMobileMenuOpen(false);
      }}
      activeNav={activeNav}
      onSelectNav={(nav) => {
        setActiveNav(nav);
        setIsMobileMenuOpen(false);
      }}
      telemetry={telemetry}
      devices={devices}
      activeBuildCount={activeBuildCount}
      queuedCount={queuedCount}
      onOpenCloneModal={() => {
        setIsCloneOpen(true);
        setIsMobileMenuOpen(false);
      }}
      onEmergencyClean={handleEmergencyClean}
      onCleanupArtifacts={handleCleanupArtifacts}
      isCleaning={isCleaning}
      isCleaningArtifacts={isCleaningArtifacts}
    />
  );

  const projectsListView = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-200">
            {selectedProjectSlug ? "Odaklanılan Proje" : "Tüm Projeler"}
          </h3>
          <Badge variant="secondary" className="font-mono text-[11px]">
            {visibleProjects.length} proje
          </Badge>
        </div>

        <Button
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
          onClick={() => setIsCloneOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Proje Ekle
        </Button>
      </div>

      {visibleProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <PackageX className="h-8 w-8 text-zinc-600" />
          <div>
            <p className="text-sm font-medium text-zinc-300">
              Gösterilecek proje bulunamadı
            </p>
            <p className="max-w-xs text-xs text-zinc-500 mt-1">
              Filtreyi temizleyebilir veya yeni bir Git deposu klonlayabilirsiniz.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => setSelectedProjectSlug(null)}
          >
            Tüm Projeleri Göster
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {visibleProjects.map((project) => (
            <ProjectCard
              key={project.slug}
              project={project}
              onStartBuild={handleStartBuild}
              onActionComplete={refreshAll}
              isStartingBuild={isStartingBuild}
            />
          ))}
        </div>
      )}
    </div>
  );

  const terminalComponent = (
    <LiveTerminal
      selectedBuild={selectedBuild}
      project={currentProject}
      onBuildUpdated={handleBuildUpdated}
      onCancelBuild={handleCancelBuild}
    />
  );

  const historyComponent = (
    <BuildHistory
      builds={visibleBuilds}
      devices={devices}
      selectedBuildId={selectedBuildId}
      lanHost={lanHost}
      onSelectBuild={(build) => {
        setSelectedBuildId(build.id);
        setActiveNav("terminal");
      }}
      onOpenExplorerFeedback={showNotice}
      onInstallToDevice={handleInstallToDevice}
      onDeleteBuild={handleDeleteBuild}
    />
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 font-sans text-zinc-50 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Desktop Fixed Sidebar */}
      <div className="hidden lg:block h-full shrink-0">
        {sidebarComponent}
      </div>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-zinc-950 border-zinc-800">
          {sidebarComponent}
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col h-full overflow-hidden">
        <AppHeader
          title={viewTitle}
          subtitle={
            selectedProjectSlug
              ? "Tek Proje Görünümü"
              : `${projects.length} Proje • ${builds.length} Build`
          }
          devices={devices}
          lanHost={lanHost}
          onLanHostChange={handleLanHostChange}
          onRefresh={refreshAll}
          onConnectWirelessDevice={handleConnectWirelessDevice}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          isRefreshing={isRefreshing}
        />

        {/* Scrollable View Container */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 terminal-scrollbar pb-20 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            {activeNav === "overview" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
                <section className="lg:col-span-5 space-y-4">
                  {projectsListView}
                </section>
                <section className="lg:col-span-7 space-y-6">
                  {terminalComponent}
                  {historyComponent}
                </section>
              </div>
            )}

            {activeNav === "projects" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-100">
                      Expo Projeleri ({visibleProjects.length})
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Projelerinizin mimari ve EAS derleme profillerini yönetin.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5"
                    onClick={() => setIsCloneOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" /> Yeni Proje Klonla
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visibleProjects.map((project) => (
                    <ProjectCard
                      key={project.slug}
                      project={project}
                      onStartBuild={handleStartBuild}
                      onActionComplete={refreshAll}
                      isStartingBuild={isStartingBuild}
                    />
                  ))}
                </div>
              </div>
            )}

            {activeNav === "terminal" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-100">
                      Canlı Build Terminali
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Aktif ve geçmiş build loglarını gerçek zamanlı izleyin.
                    </p>
                  </div>
                </div>
                {terminalComponent}
              </div>
            )}

            {activeNav === "history" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-100">
                      Build Geçmişi ve Çıktılar
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Üretilen .apk ve .aab dosyalarını indirin, QR kod ile telefona aktarın veya ADB ile kurun.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-zinc-400"
                    onClick={() => handleCleanupArtifacts(5)}
                    disabled={isCleaningArtifacts}
                  >
                    Eski Çıktıları Temizle
                  </Button>
                </div>
                {historyComponent}
              </div>
            )}
          </div>
        </main>

        {/* Minimal Bottom Footer */}
        <footer className="shrink-0 border-t border-zinc-900/80 bg-zinc-950/95 px-4 py-2 text-center text-[11px] text-zinc-500 z-20 mb-14 lg:mb-0">
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
            <span className="flex items-center gap-1.5 font-medium text-zinc-400">
              <img
                src="/assets/ohd_logo.png"
                alt="OrangeHat Digital Logo"
                className="h-3.5 w-3.5 object-contain inline-block rounded-sm"
              />
              Powered by
            </span>
            <a
              href="https://orangehatdigital.com.tr/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-orange-400 hover:text-orange-300 hover:underline transition-colors"
            >
              OrangeHat Digital
            </a>
            <span className="text-zinc-700">•</span>
            <span>Developed by</span>
            <a
              href="https://furkanaslan.orangehatdigital.com.tr/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-300 hover:text-white hover:underline transition-colors"
            >
              Furkan Aslan
            </a>
            <span className="text-zinc-600">&</span>
            <a
              href="https://kubrakara.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-300 hover:text-white hover:underline transition-colors"
            >
              Kübra Kara
            </a>
            <span className="text-zinc-700">•</span>
            <a
              href="mailto:hello@orangehatdigital.com.tr"
              className="text-zinc-400 hover:text-orange-300 hover:underline transition-colors"
              title="Mesaj veya bildirim göndermek için tıklayın"
            >
              hello@orangehatdigital.com.tr
            </a>
          </p>
        </footer>

        {/* Mobile Bottom Navigation Bar (< lg) */}
        <div className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-zinc-800 bg-zinc-950/95 px-2 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setActiveNav("overview")}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] ${
              activeNav === "overview" ? "text-indigo-400 font-medium" : "text-zinc-500"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Panel</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("projects")}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] ${
              activeNav === "projects" ? "text-indigo-400 font-medium" : "text-zinc-500"
            }`}
          >
            <FolderKanban className="h-4 w-4" />
            <span>Projeler</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("terminal")}
            className={`relative flex flex-col items-center justify-center gap-1 text-[10px] ${
              activeNav === "terminal" ? "text-indigo-400 font-medium" : "text-zinc-500"
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>Terminal</span>
            {activeBuildCount > 0 && (
              <span className="absolute top-1 right-2 h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("history")}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] ${
              activeNav === "history" ? "text-indigo-400 font-medium" : "text-zinc-500"
            }`}
          >
            <History className="h-4 w-4" />
            <span>Geçmiş</span>
          </button>
        </div>
      </div>

      {/* Clone Project Modal */}
      <Dialog open={isCloneOpen} onOpenChange={setIsCloneOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-indigo-400" />
              Yeni Expo Projesi Klonla
            </DialogTitle>
            <DialogDescription>
              Git deposunu doğrudan <code className="font-mono text-zinc-300">builds/</code>{" "}
              dizinine klonlar ve dashboard&apos;a ekler.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Git Repo URL <span className="text-rose-400">*</span>
              </label>
              <Input
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="https://github.com/kullanici/expo-app.git"
                className="font-mono text-xs"
                disabled={isCloning}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-medium text-zinc-300">
                  <GitBranch className="h-3 w-3 text-zinc-500" /> Branch
                </label>
                <Input
                  value={cloneBranch}
                  onChange={(e) => setCloneBranch(e.target.value)}
                  placeholder="main (opsiyonel)"
                  className="font-mono text-xs"
                  disabled={isCloning}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Klasör Adı
                </label>
                <Input
                  value={cloneFolderName}
                  onChange={(e) => setCloneFolderName(e.target.value)}
                  placeholder="Otomatik türet"
                  className="font-mono text-xs"
                  disabled={isCloning}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-xs text-zinc-300">
              <div>
                <p className="font-medium text-zinc-200">
                  Bağımlılıkları Yükle (npm install)
                </p>
                <p className="text-[11px] text-zinc-500">
                  Klonlama sonrası Expo projesinin paketlerini otomatik kurar.
                </p>
              </div>
              <Switch
                checked={cloneInstallDeps}
                onCheckedChange={setCloneInstallDeps}
                disabled={isCloning}
              />
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCloneOpen(false)}
              disabled={isCloning}
            >
              Vazgeç
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
              onClick={handleCloneProject}
              disabled={isCloning || !cloneUrl.trim()}
            >
              {isCloning ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Klonlanıyor...
                </>
              ) : (
                "Klonla ve Ekle"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightweight Toast Notification */}
      {notice && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-2.5 text-xs shadow-xl backdrop-blur-md ${
            notice.isError
              ? "border-rose-500/40 bg-rose-950/90 text-rose-200"
              : "border-zinc-700 bg-zinc-900/95 text-zinc-100"
          }`}
        >
          {notice.message}
        </div>
      )}
    </div>
  );
}

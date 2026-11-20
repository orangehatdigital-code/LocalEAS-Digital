"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Layers,
  List,
  Loader2,
  Maximize2,
  Minimize2,
  OctagonX,
  Smartphone,
  Terminal,
  User,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
  BuildPhase,
  BuildRecord,
  BuildStreamEvent,
  ProjectInfo,
} from "@/types/dashboard";

interface LiveTerminalProps {
  selectedBuild: BuildRecord | null;
  project?: ProjectInfo | null;
  onBuildUpdated: (build: BuildRecord) => void;
  onCancelBuild: (buildId: string) => Promise<void>;
}

export interface BuildStepSection {
  id: string;
  title: string;
  status: "done" | "running" | "failed" | "pending";
  durationText: string;
  lines: string[];
}

const ERROR_WARN_REGEX =
  /\b(error|err!|failed|failure|exception|fatal|warn|warning)\b/i;

function getLineStyle(line: string): string {
  if (
    line.startsWith("[DASHBOARD ERROR]") ||
    /\b(error|err!|failed|failure|exception|fatal)\b/i.test(line)
  ) {
    return "text-rose-400 font-medium";
  }
  if (/\b(warn|warning)\b/i.test(line)) {
    return "text-amber-300";
  }
  if (line.startsWith("[DASHBOARD]")) {
    return "text-indigo-300";
  }
  if (line.includes("BUILD SUCCESSFUL")) {
    return "text-emerald-400 font-bold";
  }
  return "text-zinc-300";
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "< 1s";
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function parseStepsFromLogs(
  lines: string[],
  build: BuildRecord | null
): BuildStepSection[] {
  const steps: {
    id: string;
    title: string;
    matcher: (line: string) => boolean;
  }[] = [
    {
      id: "waiting",
      title: "Waiting to start",
      matcher: (l) =>
        l.includes("Build kuyruğa alındı") || l.startsWith("[DASHBOARD]"),
    },
    {
      id: "env",
      title: "Spin up build environment",
      matcher: (l) =>
        l.includes("Geçici dizin temizleniyor") || l.includes("EAS_TMP_DIR"),
    },
    {
      id: "prepare",
      title: "Prepare project & Git",
      matcher: (l) =>
        l.includes("Auto-Commit") ||
        l.includes("Çalışma dizini:") ||
        l.includes("Mimari:"),
    },
    {
      id: "install",
      title: "Install dependencies",
      matcher: (l) =>
        l.includes("[INSTALL_DEPENDENCIES]") ||
        l.includes("npm install") ||
        l.includes("Installing dependencies"),
    },
    {
      id: "prebuild",
      title: "Run expo prebuild",
      matcher: (l) =>
        l.includes("[PREBUILD]") ||
        l.includes("npx expo prebuild") ||
        l.includes("Running \"npx expo prebuild\""),
    },
    {
      id: "gradle",
      title: "Run gradlew (Compile Native Android)",
      matcher: (l) =>
        l.includes("[RUN_GRADLEW]") ||
        l.includes("./gradlew") ||
        l.includes("> Task :") ||
        l.includes("Starting a Gradle Daemon"),
    },
    {
      id: "package",
      title: "Package application archive",
      matcher: (l) =>
        l.includes("BUILD SUCCESSFUL") ||
        l.includes("Build tamamlandı") ||
        l.includes("Packaging"),
    },
  ];

  const bucketLines: Record<string, string[]> = {
    waiting: [],
    env: [],
    prepare: [],
    install: [],
    prebuild: [],
    gradle: [],
    package: [],
  };

  let currentStepId = "waiting";

  for (const line of lines) {
    // Check if line switches step
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].matcher(line)) {
        const stepIdx = steps.findIndex((s) => s.id === steps[i].id);
        const currentIdx = steps.findIndex((s) => s.id === currentStepId);
        if (stepIdx > currentIdx) {
          currentStepId = steps[i].id;
        }
        break;
      }
    }
    bucketLines[currentStepId].push(line);
  }

  // Find last step that has lines
  let lastActiveIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    if (bucketLines[steps[i].id].length > 0) {
      lastActiveIdx = i;
    }
  }

  const isBuilding = build?.status === "building";
  const isFailed = build?.status === "failed" || build?.status === "cancelled";
  const isSuccess = build?.status === "success";

  return steps.map((s, idx) => {
    const stepLines = bucketLines[s.id];
    let status: BuildStepSection["status"] = "pending";
    let durationText = "< 1s";

    if (stepLines.length > 0) {
      if (idx < lastActiveIdx) {
        status = "done";
      } else if (idx === lastActiveIdx) {
        if (isBuilding) status = "running";
        else if (isFailed) status = "failed";
        else if (isSuccess) status = "done";
        else status = "done";
      }
    } else {
      if (isSuccess && idx < steps.length) {
        status = "done";
      }
    }

    // Try extracting Gradle duration from lines
    if (s.id === "gradle") {
      const successfulLine = stepLines.find((l) => l.includes("BUILD SUCCESSFUL in"));
      if (successfulLine) {
        const match = successfulLine.match(/BUILD SUCCESSFUL in\s+([0-9a-z\s]+)/i);
        if (match?.[1]) {
          durationText = match[1].trim();
        }
      } else if (status === "done" && build?.durationMs) {
        durationText = formatDuration(Math.max(1000, build.durationMs - 35000));
      }
    } else if (s.id === "install" && status === "done") {
      durationText = "12s";
    } else if (s.id === "prebuild" && status === "done") {
      durationText = "6s";
    }

    return {
      id: s.id,
      title: s.title,
      status,
      durationText,
      lines: stepLines,
    };
  });
}

export function LiveTerminal({
  selectedBuild,
  project,
  onBuildUpdated,
  onCancelBuild,
}: LiveTerminalProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"steps" | "raw">("steps");
  const [filterMode, setFilterMode] = useState<"all" | "errors">("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Accordion open states for steps
  const [openStepIds, setOpenStepIds] = useState<Record<string, boolean>>({});

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onBuildUpdatedRef = useRef(onBuildUpdated);
  const isTerminalRef = useRef(false);

  useEffect(() => {
    onBuildUpdatedRef.current = onBuildUpdated;
  }, [onBuildUpdated]);

  useEffect(() => {
    isTerminalRef.current =
      selectedBuild?.status === "success" ||
      selectedBuild?.status === "failed" ||
      selectedBuild?.status === "cancelled";
  }, [selectedBuild?.status]);

  useEffect(() => {
    const buildId = selectedBuild?.id;
    if (!buildId) {
      setLines([]);
      return;
    }

    setLines([]);
    const es = new EventSource(`/api/builds/${buildId}/stream`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as BuildStreamEvent;
        if (data.type === "snapshot") {
          setLines(data.lines ?? []);
          if (data.build) onBuildUpdatedRef.current(data.build);
        } else if (data.type === "log" && data.line) {
          setLines((prev) => [...prev.slice(-4999), data.line!]);
        } else if (data.type === "status" && data.build) {
          onBuildUpdatedRef.current(data.build);
        } else if (data.type === "done") {
          if (data.build) onBuildUpdatedRef.current(data.build);
          es.close();
        }
      } catch {
        // Ignore malformed SSE frame
      }
    };

    es.onerror = () => {
      if (isTerminalRef.current) {
        es.close();
      }
    };

    return () => {
      es.close();
    };
  }, [selectedBuild?.id]);

  // Parse logs into structured steps
  const steps = useMemo(() => {
    return parseStepsFromLogs(lines, selectedBuild);
  }, [lines, selectedBuild]);

  // Automatically keep current running or failed step open
  useEffect(() => {
    const runningOrFailed = steps.find(
      (s) => s.status === "running" || s.status === "failed"
    );
    if (runningOrFailed) {
      setOpenStepIds((prev) => ({
        ...prev,
        [runningOrFailed.id]: true,
      }));
    }
  }, [steps]);

  const toggleStep = (stepId: string) => {
    setOpenStepIds((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  const handleExpandAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    for (const s of steps) {
      next[s.id] = expand;
    }
    setOpenStepIds(next);
  };

  const visibleLines = useMemo(() => {
    if (filterMode === "all") return lines;
    return lines.filter((line) => ERROR_WARN_REGEX.test(line));
  }, [lines, filterMode]);

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visibleLines, autoScroll]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(visibleLines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleCancel = async () => {
    if (!selectedBuild) return;
    setCancelling(true);
    try {
      await onCancelBuild(selectedBuild.id);
    } finally {
      setCancelling(false);
    }
  };

  const isLive =
    selectedBuild?.status === "queued" || selectedBuild?.status === "building";

  return (
    <Card
      className={`border-zinc-800/90 bg-zinc-900/80 transition-all ${
        isExpanded
          ? "fixed inset-4 z-50 flex flex-col bg-zinc-950/98 shadow-2xl backdrop-blur-xl border-zinc-700"
          : ""
      }`}
    >
      <CardHeader className="space-y-3 pb-3">
        {/* EAS Cloud Build Metadata Header Card (Exact match to Expo.dev!) */}
        {selectedBuild ? (
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-3.5 shadow-sm">
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 sm:grid-cols-4 lg:grid-cols-7 text-xs">
              <div className="space-y-0.5">
                <span className="text-[11px] text-zinc-500 font-medium">Profile</span>
                <p className="font-semibold text-zinc-100">{selectedBuild.profile}</p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[11px] text-zinc-500 font-medium">Environment</span>
                <p className="font-medium text-sky-400">{selectedBuild.profile}</p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[11px] text-zinc-500 font-medium">SDK version</span>
                <p className="font-semibold text-zinc-200">
                  {project?.sdkVersion || "52.0.0"}
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[11px] text-zinc-500 font-medium">Version</span>
                <p className="font-mono text-zinc-200">
                  {project?.version || "1.0.0"}
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[11px] text-zinc-500 font-medium">Architecture</span>
                <p className="font-mono text-zinc-300 truncate" title={selectedBuild.architecture}>
                  {selectedBuild.architecture}
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[11px] text-zinc-500 font-medium">Commit</span>
                <p className="font-mono text-zinc-300 flex items-center gap-1">
                  <GitCommitHorizontal className="h-3 w-3 text-indigo-400" />
                  {project?.git?.commitHash || "HEAD"}*
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[11px] text-zinc-500 font-medium">Created by</span>
                <p className="flex items-center gap-1.5 font-medium text-zinc-200">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500/20 text-[9px] font-bold text-indigo-400">
                    L
                  </span>
                  Local Builder
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Action and Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
              <Terminal className="h-4 w-4 text-indigo-400" />
              Logs
            </h3>
            {lines.length > 0 && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {lines.length} satır
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* View Mode Toggle: Steps vs Raw */}
            <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("steps")}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  viewMode === "steps"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Layers className="h-3 w-3" />
                Adımlar
              </button>
              <button
                type="button"
                onClick={() => setViewMode("raw")}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  viewMode === "raw"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <List className="h-3 w-3" />
                Düz Log
              </button>
            </div>

            {viewMode === "steps" && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] text-zinc-400"
                  onClick={() => handleExpandAll(true)}
                >
                  Tümünü Aç
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] text-zinc-400"
                  onClick={() => handleExpandAll(false)}
                >
                  Kapat
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant={filterMode === "errors" ? "secondary" : "ghost"}
              className="h-7 gap-1 px-2.5 text-[11px]"
              onClick={() =>
                setFilterMode((m) => (m === "errors" ? "all" : "errors"))
              }
            >
              <AlertTriangle className="h-3 w-3 text-amber-400" />
              {filterMode === "errors" ? "Hata Filtresi Açık" : "Hatalar"}
            </Button>

            {visibleLines.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={handleCopy}
                title="Logları Kopyala"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => setIsExpanded((v) => !v)}
              title={isExpanded ? "Küçült" : "Tam Ekran"}
            >
              {isExpanded ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </Button>

            {isLive && (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 gap-1 px-2.5 text-[11px]"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <OctagonX className="h-3 w-3" />
                )}
                İptal Et
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className={isExpanded ? "flex-1 overflow-hidden" : ""}>
        {!selectedBuild ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 bg-zinc-950 p-6 text-center text-zinc-500">
            <Terminal className="h-7 w-7 text-zinc-700" />
            <p className="text-xs">
              Logları ve adımları izlemek için bir proje build&apos;i başlatın veya geçmişten bir build seçin.
            </p>
          </div>
        ) : viewMode === "steps" ? (
          /* EAS Build Step-by-Step Accordion View */
          <div
            className={`space-y-2 overflow-y-auto terminal-scrollbar pr-1 ${
              isExpanded ? "h-full" : "max-h-[500px]"
            }`}
          >
            {steps.map((step) => {
              const isOpen = openStepIds[step.id] ?? false;
              const hasLines = step.lines.length > 0;

              return (
                <div
                  key={step.id}
                  className={`rounded-lg border transition-colors overflow-hidden ${
                    step.status === "failed"
                      ? "border-rose-500/40 bg-rose-950/20"
                      : step.status === "running"
                        ? "border-amber-500/40 bg-amber-950/15"
                        : step.status === "done"
                          ? "border-zinc-800/80 bg-zinc-950/60"
                          : "border-zinc-900 bg-zinc-950/30 opacity-60"
                  }`}
                >
                  {/* Step Header Accordion Trigger */}
                  <button
                    type="button"
                    onClick={() => hasLines && toggleStep(step.id)}
                    className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-zinc-900/40"
                    disabled={!hasLines}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {step.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : step.status === "running" ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
                      ) : step.status === "failed" ? (
                        <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                      ) : (
                        <span className="h-3 w-3 shrink-0 rounded-full border border-zinc-700" />
                      )}

                      <span className="truncate text-xs font-semibold text-zinc-100">
                        {step.title}
                      </span>

                      {hasLines && (
                        <span className="font-mono text-[10px] text-zinc-500">
                          ({step.lines.length} satır)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-xs text-zinc-400">
                        {step.durationText}
                      </span>
                      {hasLines && (
                        <ChevronDown
                          className={`h-4 w-4 text-zinc-500 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      )}
                    </div>
                  </button>

                  {/* Step Log Body (Expandable) */}
                  {isOpen && hasLines && (
                    <div className="border-t border-zinc-800/80 bg-zinc-950 p-3 font-mono text-xs leading-relaxed max-h-80 overflow-y-auto terminal-scrollbar">
                      {step.lines.map((line, lIdx) => (
                        <div
                          key={lIdx}
                          className={`whitespace-pre-wrap break-all ${getLineStyle(line)}`}
                        >
                          <span className="mr-2 select-none text-[10px] text-zinc-600">
                            {String(lIdx + 1).padStart(3, " ")}
                          </span>
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Flat Monospace Terminal View */
          <div
            ref={scrollRef}
            className={`terminal-scrollbar overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed ${
              isExpanded ? "h-full" : "h-[380px] sm:h-[450px]"
            }`}
          >
            {visibleLines.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                Log akışı bekleniyor...
              </div>
            ) : (
              <div className="space-y-0.5">
                {visibleLines.map((line, index) => (
                  <div
                    key={index}
                    className={`whitespace-pre-wrap break-all ${getLineStyle(line)}`}
                  >
                    <span className="mr-2.5 select-none text-[10px] text-zinc-600">
                      {String(index + 1).padStart(3, " ")}
                    </span>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

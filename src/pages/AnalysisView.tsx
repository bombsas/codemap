/**
 * AnalysisView — the visualization workspace.
 *
 * Three data-source paths (in priority order):
 *  1. **Fresh analysis** — data arrives via `location.state` (set by
 *     NewAnalysisPage when the pipeline completes but save failed).
 *  2. **Local analysis** — `projectId` starts with `local-`; data is loaded
 *     from IndexedDB (used when Supabase save fails).
 *  3. **Saved analysis** — a real Supabase UUID; data is loaded from Supabase
 *     via `useLoadAnalysis`.
 */
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  Compass,
  Loader2,
  RefreshCw,
  Trash2,
  Pencil,
  Download,
  AlertTriangle,
} from "lucide-react";
import PageLayout from "../components/layout/PageLayout";
import GraphCanvas from "../components/visualization/GraphCanvas";
import DetailPanel from "../components/inspector/DetailPanel";
import { useVisualizationStore } from "../store/visualizationStore";
import { useLoadAnalysis } from "../hooks/useLoadAnalysis";
import { loadFromLocalStore, downloadAsJson } from "../lib/localStore";
import type { LocalAnalysis } from "../lib/localStore";
import { supabase } from "../lib/supabase";
import type { ParsedProject } from "../types";
import type { FunctionExplanation } from "../types/analysis";
import type { UseExplanationResult } from "../hooks/useExplanation";

/* ── Location state (fresh-pipeline fallback) ───────────────────────── */

interface AnalysisViewLocationState {
  project: ParsedProject;
  explanations: Record<string, FunctionExplanation>;
  failedIds?: string[];
  name?: string;
}

/**
 * SessionStorage cache for fresh analyses.
 *
 * Fresh (save-failed) analyses arrive via `location.state`, which is lost
 * when the user navigates away and comes back. We mirror them into
 * sessionStorage so they survive in‑tab navigation within the same session.
 */
const SESSION_CACHE_PREFIX = "codemap-fresh:";

function cacheFreshData(
  projectId: string,
  data: AnalysisViewLocationState,
): void {
  try {
    sessionStorage.setItem(
      SESSION_CACHE_PREFIX + projectId,
      JSON.stringify(data),
    );
  } catch {
    /* storage full — non‑critical */
  }
}

function loadCachedFreshData(
  projectId: string,
): AnalysisViewLocationState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + projectId);
    return raw ? (JSON.parse(raw) as AnalysisViewLocationState) : null;
  } catch {
    return null;
  }
}

/** Adapter: plain Record from router state → Map for the hooks/components. */
function recordToMap(
  record?: Record<string, FunctionExplanation>,
): Map<string, FunctionExplanation> {
  return new Map(Object.entries(record ?? {}));
}

/* ── Inline Rename ──────────────────────────────────────────────────── */

interface RenameInputProps {
  value: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

function RenameInput({ value, onSave, onCancel }: RenameInputProps) {
  const [name, setName] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      type="text"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") onCancel();
      }}
      onClick={(e) => e.stopPropagation()}
      className="bg-background border border-accent/50 rounded px-1.5 py-0.5 text-sm text-foreground font-heading tracking-wide focus:outline-none focus:ring-1 focus:ring-accent/30 w-full"
    />
  );
}

/* ── Delete confirmation modal ──────────────────────────────────────── */

function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  loading = false,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <h3 className="font-heading text-foreground text-lg tracking-wide">{title}</h3>
        </div>
        <p className="text-sm text-muted mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-muted hover:text-foreground border border-border rounded-md transition-colors duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-destructive rounded-md hover:opacity-90 transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded border-2 border-white/30 border-t-white animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function AnalysisView() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const resetViz = useVisualizationStore((s) => s.reset);
  const panelOpen = useVisualizationStore((s) => s.panelOpen);

  const loader = useLoadAnalysis();
  const [localData, setLocalData] = useState<LocalAnalysis | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

  const state = location.state as AnalysisViewLocationState | null;

  // ── Determine data source ─────────────────────────────────────────
  //
  // Priority 1: location.state (fresh analysis from pipeline fallback)
  // Priority 2: IndexedDB (local-* IDs, survives browser restarts)
  // Priority 3: sessionStorage cache (session-* IDs, ephemeral)
  // Priority 4: loader from Supabase DB (real UUIDs)

  const isLocalId = projectId?.startsWith("local-") ?? false;
  const isSessionId = projectId?.startsWith("session-") ?? false;

  // Try to restore from sessionStorage (priority 3 — before we decide
  // whether hasLocationState, because location.state might be missing)
  const restoredState = useMemo(
    () => {
      if (!state?.project && isSessionId) {
        return loadCachedFreshData(projectId!);
      }
      return null;
    },
    [state?.project, projectId, isSessionId],
  );

  // Determine whether we have location state (priorities 1 & 3)
  const effectiveState = state ?? restoredState;
  const freshProject: ParsedProject | null = effectiveState?.project ?? null;
  const freshExplanations: Map<string, FunctionExplanation> = recordToMap(
    effectiveState?.explanations,
  );
  const hasLocationState = !!effectiveState?.project;

  // Priority 2: load from IndexedDB when navigating to a local-* ID
  useEffect(() => {
    if (!hasLocationState && isLocalId && projectId) {
      setLocalLoading(true);
      loadFromLocalStore(projectId)
        .then((data) => setLocalData(data))
        .catch(() => setLocalData(null))
        .finally(() => setLocalLoading(false));
    }
  }, [projectId, isLocalId, hasLocationState]);

  // Mirror location.state into sessionStorage so it survives navigation
  useEffect(() => {
    if (state?.project && isSessionId) {
      cacheFreshData(projectId!, state);
    }
  }, [state, projectId, isSessionId]);

  // ── Rename state ──────────────────────────────────────────────────
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");

  // ── Delete state ──────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Priority 4: load from DB when navigating from dashboard / direct URL
  useEffect(() => {
    if (!hasLocationState && isSessionId) return;
    if (!hasLocationState && isLocalId) return;
    if (!hasLocationState && projectId) {
      loader.load(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, hasLocationState, isSessionId, isLocalId]);

  // Reset visualization state when leaving / project changes
  useEffect(() => {
    resetViz();
    return () => resetViz();
  }, [resetViz, projectId, hasLocationState]);

  // ── Determine what to render ──────────────────────────────────────

  const project = hasLocationState
    ? freshProject
    : localData
      ? (localData.project as ParsedProject)
      : (loader.analysis?.project ?? null);
  const explanations = hasLocationState
    ? freshExplanations
    : localData
      ? new Map(localData.explanations as Array<[string, FunctionExplanation]>)
      : (loader.analysis?.explanations ?? new Map());
  const displayName = hasLocationState
    ? (effectiveState?.name ?? "Analysis")
    : localData
      ? localData.name
      : (loader.analysis?.name ?? "Analysis");
  const fileCount = hasLocationState
    ? project?.files.length ?? 0
    : localData
      ? localData.fileCount
      : (loader.analysis?.fileCount ?? 0);
  const fnCount = explanations.size;
  const isSavedAnalysis = !hasLocationState && !!projectId && !isSessionId;

  // Sync renameName when displayName changes
  useEffect(() => {
    setRenameName(displayName);
  }, [displayName]);

  const explainer: UseExplanationResult = {
    status: project ? "done" : "idle",
    explanations,
    failedIds: hasLocationState ? (effectiveState?.failedIds ?? []) : localData ? localData.failedIds : (loader.analysis?.failedIds ?? []),
    progress: { explained: fnCount, totalFunctions: fnCount },
    error: null,
    run: () => {},
    retry: () => {},
    reset: () => {},
  };

  // ── Download handler (local analyses) ───────────────────────────

  const handleDownload = useCallback(() => {
    if (!localData || !projectId) return;
    downloadAsJson(localData);
  }, [localData, projectId]);

  // ── Local delete handler ──────────────────────────────────────────

  const handleLocalDelete = useCallback(async () => {
    if (!projectId || !isLocalId) return;
    setDeleting(true);
    try {
      const { deleteFromLocalStore } = await import("../lib/localStore");
      await deleteFromLocalStore(projectId);
      navigate("/dashboard", { replace: true });
    } catch {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [projectId, isLocalId, navigate]);

  // ── Rename handler ────────────────────────────────────────────────

  const handleRename = useCallback(
    async (newName: string) => {
      if (!projectId || !isSavedAnalysis) return;

      // Optimistically update the loader's analysis name
      if (loader.analysis) {
        loader.analysis.name = newName;
      }

      setRenaming(false);

      await supabase
        .from("projects")
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq("id", projectId);
    },
    [projectId, isSavedAnalysis, loader],
  );

  // ── Delete handler ────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!projectId || !isSavedAnalysis) return;
    setDeleting(true);

    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId);

      if (error) throw new Error(error.message);

      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Delete failed:", err);
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [projectId, isSavedAnalysis, navigate]);

  // ── Loading state (DB or IndexedDB) ───────────────────────────────

  if ((loader.status === "loading" || localLoading) && !hasLocationState) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-muted">Loading analysis…</p>
        </div>
      </PageLayout>
    );
  }

  // ── Not found / error (DB, skip local- & session- IDs) ──────────

  if (loader.status === "not-found" && !hasLocationState && !isLocalId && !isSessionId) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/20">
            <Compass className="h-7 w-7 text-muted" />
          </div>
          <h1 className="mb-2 font-heading text-2xl text-foreground tracking-wide">
            Analysis not found
          </h1>
          <p className="mb-2 max-w-md text-center text-sm text-muted">
            This analysis doesn't exist or you may not have access to it.
          </p>
          <p className="mb-6 text-xs text-muted/60">
            Project id: <code className="text-accent">{projectId}</code>
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
          >
            Back to dashboard
          </button>
        </div>
      </PageLayout>
    );
  }

  if (loader.status === "error" && !hasLocationState && !isLocalId && !isSessionId) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10">
            <RefreshCw className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="mb-2 font-heading text-2xl text-foreground tracking-wide">
            Couldn't load analysis
          </h1>
          <p className="mb-6 max-w-md text-center text-sm text-muted">
            {loader.error || "An unexpected error occurred while loading."}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => projectId && loader.load(projectId)}
              className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
            >
              Retry
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-all duration-150 hover:text-foreground active:scale-[0.97]"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  // ── Empty / no data (fresh state fallback or invalid) ─────────────

  if (!project && !hasLocationState && loader.status === "idle") {
    return null;
  }

  if (!project) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/20">
            <Compass className="h-7 w-7 text-muted" />
          </div>
          <h1 className="mb-2 font-heading text-2xl text-foreground tracking-wide">
            No analysis loaded
          </h1>
          <p className="mb-2 max-w-md text-center text-sm text-muted">
            Run a new analysis to visualize its structure.
          </p>
          <p className="mb-6 text-xs text-muted/60">
            Project id: <code className="text-accent">{projectId}</code>
          </p>
          <button
            onClick={() => navigate("/new")}
            className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
          >
            New analysis
          </button>
        </div>
      </PageLayout>
    );
  }

  // ── Full workspace ────────────────────────────────────────────────

  // Edge case: project loaded from DB but has no files (orphan record)
  if (project && project.files.length === 0) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/20">
            <RefreshCw className="h-7 w-7 text-muted" />
          </div>
          <h1 className="mb-2 font-heading text-2xl text-foreground tracking-wide">
            Analysis data not found
          </h1>
          <p className="mb-2 max-w-md text-center text-sm text-muted">
            The analysis record exists but the code data could not be loaded.
            This can happen if the save process was interrupted.
          </p>
          <p className="mb-6 text-xs text-muted/60">
            Try running the analysis again.
          </p>
          <button
            onClick={() => navigate("/new")}
            className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
          >
            New analysis
          </button>
        </div>
      </PageLayout>
    );
  }

  // ── Full workspace ────────────────────────────────────────────────

  return (
    <PageLayout fullHeight>
      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete this analysis?"
          message={`This will permanently delete "${displayName}" and all its data. This cannot be undone.`}
          loading={deleting}
          onConfirm={isLocalId ? handleLocalDelete : handleDelete}
          onCancel={() => { setShowDeleteConfirm(false); setDeleting(false); }}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border/60 bg-surface/60 px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate("/new")}
              className="flex cursor-pointer items-center gap-1.5 text-xs text-muted transition-colors duration-150 hover:text-foreground"
              aria-label="Back to new analysis"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">New analysis</span>
            </button>
            <div className="h-4 w-px bg-border/60" />
            <div className="min-w-0 flex items-center gap-2">
              {renaming ? (
                <div className="w-48">
                  <RenameInput
                    value={renameName}
                    onSave={handleRename}
                    onCancel={() => setRenaming(false)}
                  />
                </div>
              ) : (
                <span className="truncate font-heading text-sm text-foreground">
                  {displayName}
                </span>
              )}
              <span className="hidden text-[10px] text-muted md:inline">
                {fileCount} files · {fnCount} explained
              </span>

              {/* Rename button — only for saved analyses */}
              {isSavedAnalysis && !renaming && (
                <button
                  onClick={() => {
                    setRenameName(displayName);
                    setRenaming(true);
                  }}
                  className="p-1 rounded text-muted hover:text-foreground hover:bg-muted/20 transition-colors duration-150 cursor-pointer"
                  aria-label="Rename analysis"
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Download button — for local analyses only */}
            {isLocalId && !!localData && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted hover:text-accent hover:bg-accent/10 border border-transparent hover:border-accent/20 transition-all duration-150 cursor-pointer"
                aria-label="Download analysis as JSON"
              >
                <Download size={11} />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}
            {/* Delete button — for saved & local analyses */}
            {isSavedAnalysis && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all duration-150 cursor-pointer"
                aria-label="Delete analysis"
              >
                <Trash2 size={11} />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
            <span className="flex items-center gap-1.5 text-[10px] text-accent">
              <Loader2 size={11} className="hidden" />
              {isLocalId ? "Saved locally" : "Ready"}
            </span>
          </div>
        </div>

        {/* Workspace: canvas + inspector */}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            {project && <GraphCanvas project={project} explanations={explanations} />}
          </div>
          {/* Inspector panel — animates to 0 width when closed */}
          <div
            className={`flex h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
              panelOpen ? "w-[380px] max-sm:w-[300px]" : "w-0"
            }`}
            aria-hidden={!panelOpen}
          >
            {project && <DetailPanel project={project} explanations={explainer} />}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
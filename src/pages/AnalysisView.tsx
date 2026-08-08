/**
 * AnalysisView — the visualization workspace.
 *
 * Two entry paths:
 *  1. **Fresh analysis** — data arrives via `location.state` (set by
 *     NewAnalysisPage when the pipeline completes but save failed).
 *  2. **Saved analysis** — `projectId` param from the URL; data is loaded
 *     from Supabase via `useLoadAnalysis`.
 */
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, Compass, Loader2, RefreshCw } from "lucide-react";
import PageLayout from "../components/layout/PageLayout";
import GraphCanvas from "../components/visualization/GraphCanvas";
import DetailPanel from "../components/inspector/DetailPanel";
import { useVisualizationStore } from "../store/visualizationStore";
import { useLoadAnalysis } from "../hooks/useLoadAnalysis";
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

/** Adapter: plain Record from router state → Map for the hooks/components. */
function recordToMap(
  record?: Record<string, FunctionExplanation>,
): Map<string, FunctionExplanation> {
  return new Map(Object.entries(record ?? {}));
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function AnalysisView() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const resetViz = useVisualizationStore((s) => s.reset);
  const panelOpen = useVisualizationStore((s) => s.panelOpen);

  const loader = useLoadAnalysis();

  const state = location.state as AnalysisViewLocationState | null;

  // ── Determine data source ─────────────────────────────────────────

  // Priority 1: location.state (fresh analysis from pipeline fallback)
  const freshProject: ParsedProject | null = state?.project ?? null;
  const freshExplanations: Map<string, FunctionExplanation> = recordToMap(
    state?.explanations,
  );
  const hasLocationState = !!state?.project;

  // Priority 2: load from DB when navigating from dashboard / direct URL
  useEffect(() => {
    if (!hasLocationState && projectId && projectId.startsWith("session-")) {
      // session-* IDs are ephemeral-only (save failed). Skip DB load.
      return;
    }
    if (!hasLocationState && projectId) {
      loader.load(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, hasLocationState]);

  // Reset visualization state when leaving / project changes
  useEffect(() => {
    resetViz();
    return () => resetViz();
  }, [resetViz, projectId, hasLocationState]);

  // ── Determine what to render ──────────────────────────────────────

  const project = hasLocationState ? freshProject : loader.analysis?.project ?? null;
  const explanations = hasLocationState
    ? freshExplanations
    : loader.analysis?.explanations ?? new Map();
  const displayName = hasLocationState
    ? (state?.name ?? "Analysis")
    : (loader.analysis?.name ?? "Analysis");
  const fileCount = project?.files.length ?? loader.analysis?.fileCount ?? 0;
  const fnCount = explanations.size;

  const explainer: UseExplanationResult = {
    status: project ? "done" : "idle",
    explanations,
    failedIds: hasLocationState ? (state?.failedIds ?? []) : (loader.analysis?.failedIds ?? []),
    progress: { explained: fnCount, totalFunctions: fnCount },
    error: null,
    run: () => {},
    retry: () => {},
    reset: () => {},
  };

  // ── Loading state (DB) ────────────────────────────────────────────

  if (loader.status === "loading") {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-muted">Loading analysis…</p>
        </div>
      </PageLayout>
    );
  }

  // ── Not found / error (DB) ────────────────────────────────────────

  if (loader.status === "not-found" && !hasLocationState) {
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

  if (loader.status === "error" && !hasLocationState) {
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
    // Still loading from DB — show nothing yet
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

  return (
    <PageLayout fullHeight>
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
            <div className="min-w-0">
              <span className="truncate font-heading text-sm text-foreground">
                {displayName}
              </span>
              <span className="ml-2 hidden text-[10px] text-muted md:inline">
                {fileCount} files · {fnCount} explained
              </span>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] text-accent">
            <Loader2 size={11} className="hidden" />
            Ready
          </span>
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
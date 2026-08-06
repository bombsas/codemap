/**
 * AnalysisView — the visualization workspace.
 *
 * Renders the three-mode canvas (block / dependency / mind-map) with the
 * collapsible detail inspector on the right. The parsed project + AI
 * explanations arrive via router `location.state` (set by NewAnalysisPage
 * when the pipeline completes).
 */
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, Compass, Loader2 } from "lucide-react";
import PageLayout from "../components/layout/PageLayout";
import GraphCanvas from "../components/visualization/GraphCanvas";
import DetailPanel from "../components/inspector/DetailPanel";
import { useVisualizationStore } from "../store/visualizationStore";
import type { ParsedProject } from "../types";
import type { FunctionExplanation } from "../types/analysis";
import type { UseExplanationResult } from "../hooks/useExplanation";

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

export default function AnalysisView() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const resetViz = useVisualizationStore((s) => s.reset);
  const panelOpen = useVisualizationStore((s) => s.panelOpen);

  const state = location.state as AnalysisViewLocationState | null;
  const project = state?.project ?? null;
  const explanations = recordToMap(state?.explanations);

  // Reset visualization state when leaving / project changes
  useEffect(() => {
    resetViz();
    return () => resetViz();
  }, [resetViz, projectId]);

  // Fake explanation hook shape (project not yet persisted — Task 8 wires save/load)
  const explainer: UseExplanationResult = {
    status: project ? "done" : "idle",
    explanations,
    failedIds: state?.failedIds ?? [],
    progress: {
      explained: explanations.size,
      totalFunctions: explanations.size,
    },
    error: null,
    run: () => {},
    retry: () => {},
    reset: () => {},
  };

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
            This workspace expects the result of a completed analysis pipeline.
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

  return (
    <PageLayout fullHeight>
      <div className="flex h-full flex-col">
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
                {state?.name ?? "Analysis"}
              </span>
              <span className="ml-2 hidden text-[10px] text-muted md:inline">
                {project.files.length} files · {explanations.size} explained
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
            <GraphCanvas project={project} explanations={explanations} />
          </div>
          {/* Inspector panel — animates to 0 width when closed */}
          <div
            className={`flex h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
              panelOpen ? "w-[380px] max-sm:w-[300px]" : "w-0"
            }`}
            aria-hidden={!panelOpen}
          >
            <DetailPanel project={project} explanations={explainer} />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
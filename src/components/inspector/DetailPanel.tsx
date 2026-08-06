/**
 * DetailPanel — collapsible right-side inspector panel.
 *
 * - Clicking a function node → shows AI explanation (purpose, inputs, outputs,
 *   logic) + source code toggle + retry option on failure.
 * - Clicking a file node → shows file path + list of functions + full file source.
 */
import { memo, useState, useEffect } from "react";
import { X, RefreshCw, Braces, ChevronDown, ChevronRight } from "lucide-react";
import { useVisualizationStore } from "../../store/visualizationStore";
import SourceCodeView from "./SourceCodeView";
import type { ParsedProject } from "../../types";
import type { UseExplanationResult } from "../../hooks/useExplanation";

interface DetailPanelProps {
  project: ParsedProject | null;
  explanations: UseExplanationResult;
}

function DetailPanelComponent({ project, explanations }: DetailPanelProps) {
  const selectedNodeId = useVisualizationStore((s) => s.selectedNodeId);
  const panelOpen = useVisualizationStore((s) => s.panelOpen);
  const closePanel = useVisualizationStore((s) => s.closePanel);
  const [showSource, setShowSource] = useState(false);

  // Reset the source toggle whenever a different node is inspected
  useEffect(() => {
    setShowSource(false);
  }, [selectedNodeId]);

  if (!panelOpen || !project || !selectedNodeId) return null;

  // Parse node id prefix
  const isFuncNode = selectedNodeId.startsWith("func:");
  const isFileNode =
    selectedNodeId.startsWith("file:") ||
    selectedNodeId.startsWith("dep:") ||
    selectedNodeId.startsWith("mm:");

  // ── Function details ──
  if (isFuncNode) {
    const functionId = selectedNodeId.slice("func:".length);
    const fn = project.files
      .flatMap((f) => f.functions)
      .find((f) => f.id === functionId);
    const file = project.files.find((f) =>
      f.functions.some((fn) => fn.id === functionId),
    );
    const explanation = explanations.explanations.get(functionId);
    const failed = explanations.failedIds.includes(functionId);

    if (!fn) return null;

    const SourceToggle = (
      <button
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-border/60 px-3 py-1.5 text-[10px] text-muted transition-colors duration-150 hover:border-accent/50 hover:text-foreground active:scale-[0.98]"
        onClick={() => setShowSource((v) => !v)}
        aria-expanded={showSource}
      >
        {showSource ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Braces size={11} />
        {showSource ? "Hide source" : "View source"}
      </button>
    );

    return (
      <div className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-surface/90 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="truncate font-heading text-xs text-foreground">
            {fn.qualifiedName ?? fn.name}
          </span>
          <button
            className="cursor-pointer rounded p-1 text-muted transition-colors duration-150 hover:text-foreground active:scale-95"
            onClick={closePanel}
            aria-label="Close inspector"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-3 p-3">
          {/* Kind + location */}
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <span className="rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 uppercase">
              {fn.kind}
            </span>
            <span className="truncate">{file?.path}</span>
            <span>L{fn.startLine}–{fn.endLine}</span>
          </div>

          {/* Purpose */}
          {explanation?.purpose && (
            <section>
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Purpose
              </h3>
              <p className="text-[11px] leading-relaxed text-foreground/90">
                {explanation.purpose}
              </p>
            </section>
          )}

          {/* Inputs */}
          {(explanation?.inputs.length ?? 0) > 0 && (
            <section>
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Inputs
              </h3>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-border/30 text-muted">
                    <th className="pb-0.5 pr-2 text-left font-medium">Name</th>
                    <th className="pb-0.5 pr-2 text-left font-medium">Type</th>
                    <th className="pb-0.5 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {explanation!.inputs.map((inp) => (
                    <tr key={inp.name} className="border-b border-border/10 text-foreground/80">
                      <td className="py-0.5 pr-2 text-accent">{inp.name}</td>
                      <td className="py-0.5 pr-2 text-muted">{inp.type}</td>
                      <td className="py-0.5 text-muted/70">{inp.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Outputs */}
          {(explanation?.outputs.length ?? 0) > 0 && (
            <section>
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Outputs
              </h3>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-border/30 text-muted">
                    <th className="pb-0.5 pr-2 text-left font-medium">Name</th>
                    <th className="pb-0.5 pr-2 text-left font-medium">Type</th>
                    <th className="pb-0.5 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {explanation!.outputs.map((out) => (
                    <tr key={out.name} className="border-b border-border/10 text-foreground/80">
                      <td className="py-0.5 pr-2 text-accent">{out.name}</td>
                      <td className="py-0.5 pr-2 text-muted">{out.type}</td>
                      <td className="py-0.5 text-muted/70">{out.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Logic */}
          {explanation?.logic && (
            <section>
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Logic
              </h3>
              <div className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
                {explanation.logic}
              </div>
            </section>
          )}

          {/* Retry on failure */}
          {failed && (
            <button
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-[11px] text-destructive transition-colors duration-150 hover:bg-destructive/10 active:scale-[0.98]"
              onClick={() => explanations.retry()}
            >
              <RefreshCw size={12} />
              Retry explanation
            </button>
          )}

          {/* No explanation yet */}
          {!explanation && !failed && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center text-[10px] text-muted">
              <p>No AI explanation yet.</p>
              <p className="mt-1">
                The explanation pipeline runs after parsing completes.
              </p>
            </div>
          )}

          {/* Source code — collapsed by default, toggle to view */}
          {file && (
            <section className="space-y-1.5">
              {SourceToggle}
              {showSource && (
                <SourceCodeView
                  code={fn.codeSnippet}
                  language={file.language}
                  maxHeight={500}
                />
              )}
            </section>
          )}
        </div>
      </div>
    );
  }

  // ── File details ──
  if (isFileNode) {
    const filePath = selectedNodeId
      .replace(/^(file:|dep:|mm:)/, "")
      .trim();
    const file = project.files.find((f) => f.path === filePath);
    if (!file) return null;

    const fileFunctions = file.functions.filter((f) => f.kind !== "class");

    return (
      <div className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-surface/90 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="truncate font-heading text-xs text-foreground">
            {file.path.split("/").pop()}
          </span>
          <button
            className="cursor-pointer rounded p-1 text-muted transition-colors duration-150 hover:text-foreground active:scale-95"
            onClick={closePanel}
            aria-label="Close inspector"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-3 p-3">
          {/* File info */}
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
            <span className="rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 uppercase">
              {file.language}
            </span>
            <span className="truncate">{file.path}</span>
            <span>{fileFunctions.length} function{fileFunctions.length === 1 ? "" : "s"}</span>
          </div>

          {/* Functions list */}
          {fileFunctions.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Functions
              </h3>
              <ul className="space-y-1">
                {fileFunctions.map((fn) => {
                  const fnId = `func:${fn.id}`;
                  const isSelected = useVisualizationStore.getState().selectedNodeId === fnId;
                  const exp = explanations.explanations.get(fn.id);
                  return (
                    <li key={fn.id}>
                      <button
                        className={`w-full cursor-pointer rounded border px-2.5 py-1.5 text-left text-[10px] transition-all duration-150 active:scale-[0.98] ${
                          isSelected
                            ? "border-accent/60 bg-accent/10"
                            : "border-border bg-muted/20 hover:border-accent/40 hover:bg-muted/30"
                        }`}
                        onClick={() => {
                          useVisualizationStore.getState().openPanel(fnId);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-heading text-[11px] text-foreground">
                            {fn.qualifiedName ?? fn.name}
                          </span>
                          <span className={`shrink-0 rounded px-1 text-[9px] uppercase ${
                            fn.kind === "class" ? "text-purple-300" : "text-accent"
                          }`}>
                            {fn.kind}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[9px] text-muted">
                          L{fn.startLine}–{fn.endLine}
                        </div>
                        {exp?.purpose && (
                          <div className="mt-0.5 line-clamp-1 text-[9px] text-muted/70">
                            {exp.purpose}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Full source */}
          <section>
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Full file source
            </h3>
            <SourceCodeView code={file.content} language={file.language} maxHeight={600} />
          </section>
        </div>
      </div>
    );
  }

  return null;
}

export default memo(DetailPanelComponent);
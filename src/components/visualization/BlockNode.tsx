/**
 * BlockNode — renders a file header or a function card in block view.
 * - File header: path + language badge + function count
 * - Function card: name, kind badge, one-line AI purpose, status badge;
 *   expands to show inputs/outputs/logic/code when toggled.
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Braces,
} from "lucide-react";
import type { ExtractedFunction } from "../../types";
import type { FunctionExplanation } from "../../types/analysis";
import { useVisualizationStore } from "../../store/visualizationStore";
import { LANGUAGE_BADGE_COLORS } from "./languageBadges";

export interface BlockNodeData {
  kind: "file-header" | "function";
  filePath?: string;
  language?: string;
  functionCount?: number;
  fn?: ExtractedFunction;
  explanation?: FunctionExplanation | null;
  expanded?: boolean;
}

function statusBadge(explanation: FunctionExplanation | null | undefined) {
  if (!explanation) {
    return (
      <span
        className="flex items-center gap-1 text-[10px] text-muted"
        title="Waiting for AI explanation"
      >
        <Loader2 size={12} className="animate-spin" />
        <span>analyzing</span>
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1 text-[10px] text-accent"
      title="Explained by AI"
    >
      <CheckCircle2 size={12} />
      <span>explained</span>
    </span>
  );
}

function BlockNodeComponent({ data: rawData, selected }: NodeProps) {
  const data = rawData as unknown as BlockNodeData;
  const toggleExpand = useVisualizationStore((s) => s.toggleExpand);
  const openPanel = useVisualizationStore((s) => s.openPanel);

  if (data.kind === "file-header") {
    const langColor = data.language
      ? LANGUAGE_BADGE_COLORS[data.language] ?? "bg-muted text-foreground"
      : "bg-muted text-foreground";
    return (
      <div
        className={`rounded-lg border px-3 py-2 transition-colors duration-200 ${
          selected
            ? "border-accent/60 bg-muted/60"
            : "border-border bg-muted/40 hover:border-accent/40"
        }`}
        onClick={() => data.filePath && openPanel(`file:${data.filePath}`)}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading text-xs text-foreground truncate">
            {data.filePath}
          </span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${langColor}`}>
            {data.language}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-muted">
          {data.functionCount} function{data.functionCount === 1 ? "" : "s"}
        </div>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
    );
  }

  const fn = data.fn;
  if (!fn) return null;

  const expanded = !!data.expanded;
  const exp = data.explanation;

  return (
    <div
      className={`rounded-lg border bg-surface transition-colors duration-200 ${
        selected
          ? "border-accent/70 shadow-[0_0_0_1px_var(--color-accent)]"
          : "border-border hover:border-accent/40"
      }`}
    >
      {/* Header row */}
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2"
        onClick={() => toggleExpand(fn.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpand(fn.id);
          }
        }}
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-muted" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-xs text-foreground">
            {fn.qualifiedName ?? fn.name}
          </div>
          <div className="truncate text-[10px] text-muted">{fn.signature}</div>
        </div>
        {statusBadge(exp)}
      </div>

      {/* Purpose line (collapsed) */}
      {!expanded && (
        <div className="px-3 pb-2">
          <p className="line-clamp-1 text-[10px] leading-relaxed text-muted/80">
            {exp?.purpose ?? "No explanation yet — expanding shows full details."}
          </p>
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border/60 px-3 py-2 space-y-2">
          {exp?.purpose && (
            <p className="text-[11px] leading-relaxed text-foreground/90">
              {exp.purpose}
            </p>
          )}

          {(exp?.inputs.length ?? 0) > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Inputs
              </div>
              <ul className="space-y-0.5">
                {exp!.inputs.map((inp) => (
                  <li key={inp.name} className="text-[10px] text-muted">
                    <span className="text-accent">{inp.type}</span>{" "}
                    <span className="text-foreground/90">{inp.name}</span>
                    {inp.description && (
                      <span className="text-muted/60"> — {inp.description}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(exp?.outputs.length ?? 0) > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Outputs
              </div>
              <ul className="space-y-0.5">
                {exp!.outputs.map((out) => (
                  <li key={out.name} className="text-[10px] text-muted">
                    <span className="text-accent">{out.type}</span>{" "}
                    <span className="text-foreground/90">{out.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {exp?.logic && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Logic
              </div>
              <p className="text-[10px] leading-relaxed text-muted line-clamp-6">
                {exp.logic}
              </p>
            </div>
          )}

          {!exp && (
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <AlertTriangle size={12} className="text-destructive" />
              <span>Explanation pending or failed — open inspector to retry.</span>
            </div>
          )}

          {/* View source in inspector */}
          <button
            className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-border/60 px-2 py-1 text-[10px] text-muted transition-colors duration-150 hover:border-accent/50 hover:text-foreground active:scale-[0.98]"
            onClick={(e) => {
              e.stopPropagation();
              openPanel(`func:${fn.id}`);
            }}
          >
            <Braces size={11} />
            View source &amp; details
          </button>
        </div>
      )}

      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(BlockNodeComponent);
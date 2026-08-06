/**
 * DepNode — a file node in the dependency graph view.
 * Shows short path, language badge and function count.
 * Clicking opens the file inspector; selected nodes get a highlight ring.
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileCode2 } from "lucide-react";
import { useVisualizationStore } from "../../store/visualizationStore";
import { LANGUAGE_BADGE_COLORS } from "./languageBadges";

export interface DepNodeData {
  filePath: string;
  label: string;
  language?: string;
  functionCount?: number;
  /** Symbol kind when rendering a function-level node ("function" | "method" | "class"). */
  kind?: string;
  /** Function id when rendering a function-level node — opens the function inspector. */
  functionId?: string;
}

function DepNodeComponent({ data: rawData, selected }: NodeProps) {
  const data = rawData as unknown as DepNodeData;
  const openPanel = useVisualizationStore((s) => s.openPanel);
  const langColor = data.language
    ? LANGUAGE_BADGE_COLORS[data.language] ?? "bg-muted text-foreground"
    : undefined;
  const isFunctionNode = !!data.kind;
  const targetId = isFunctionNode && data.functionId
    ? `func:${data.functionId}`
    : `file:${data.filePath}`;

  return (
    <div
      className={`flex h-full w-full cursor-pointer flex-col justify-between rounded-lg border bg-surface px-3 py-2 transition-all duration-150 hover:border-accent/50 active:scale-[0.98] ${
        selected
          ? "border-accent/70 shadow-[0_0_0_1px_var(--color-accent)]"
          : "border-border"
      }`}
      onClick={() => openPanel(targetId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPanel(targetId);
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {isFunctionNode ? (
            <span
              className={`shrink-0 rounded px-1 py-0.5 text-[8px] uppercase tracking-wide ${
                data.kind === "class"
                  ? "bg-purple-500/15 text-purple-300"
                  : data.kind === "method"
                    ? "bg-cyan-500/15 text-cyan-300"
                    : "bg-blue-500/15 text-blue-300"
              }`}
            >
              {data.kind}
            </span>
          ) : (
            <FileCode2 size={13} className="shrink-0 text-accent" />
          )}
          {langColor && !isFunctionNode && (
            <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] uppercase tracking-wide ${langColor}`}>
              {data.language}
            </span>
          )}
        </span>
        {langColor && isFunctionNode && (
          <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] uppercase tracking-wide ${langColor}`}>
            {data.language}
          </span>
        )}
      </div>
      <div className="truncate font-heading text-[11px] text-foreground">
        {data.label}
      </div>
      <div className="truncate text-[9px] text-muted" title={data.filePath}>
        {isFunctionNode ? data.filePath : `${data.functionCount ?? 0} function${(data.functionCount ?? 0) === 1 ? "" : "s"}`}
      </div>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(DepNodeComponent);
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
}

function DepNodeComponent({ data: rawData, selected }: NodeProps) {
  const data = rawData as unknown as DepNodeData;
  const openPanel = useVisualizationStore((s) => s.openPanel);
  const langColor = data.language
    ? LANGUAGE_BADGE_COLORS[data.language] ?? "bg-muted text-foreground"
    : undefined;

  return (
    <div
      className={`flex h-full w-full cursor-pointer flex-col justify-between rounded-lg border bg-surface px-3 py-2 transition-all duration-150 hover:border-accent/50 active:scale-[0.98] ${
        selected
          ? "border-accent/70 shadow-[0_0_0_1px_var(--color-accent)]"
          : "border-border"
      }`}
      onClick={() => openPanel(`file:${data.filePath}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPanel(`file:${data.filePath}`);
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <FileCode2 size={13} className="shrink-0 text-accent" />
        {langColor && (
          <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] uppercase tracking-wide ${langColor}`}>
            {data.language}
          </span>
        )}
      </div>
      <div className="truncate font-heading text-[11px] text-foreground">
        {data.label}
      </div>
      <div className="text-[9px] text-muted">
        {data.functionCount ?? 0} function{(data.functionCount ?? 0) === 1 ? "" : "s"}
      </div>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(DepNodeComponent);
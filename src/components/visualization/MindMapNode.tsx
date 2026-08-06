/**
 * MindMapNode — compact node in mind-map view: function/file name + path.
 * Clicking opens the file inspector.
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useVisualizationStore } from "../../store/visualizationStore";

export interface MindMapNodeData {
  filePath: string;
  label: string;
}

function MindMapNodeComponent({ data: rawData, selected }: NodeProps) {
  const data = rawData as unknown as MindMapNodeData;
  const openPanel = useVisualizationStore((s) => s.openPanel);

  return (
    <div
      className={`flex h-full w-full cursor-pointer flex-col justify-center rounded-md border px-2.5 py-1.5 bg-surface transition-all duration-150 hover:border-accent/50 active:scale-[0.98] ${
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
      <span className="truncate font-heading text-[11px] text-foreground">
        {data.label}
      </span>
      <span className="truncate text-[9px] text-muted">{data.filePath}</span>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(MindMapNodeComponent);
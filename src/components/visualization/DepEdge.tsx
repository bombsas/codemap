/**
 * DepEdge — custom edge that colors and labels itself by dependency type:
 * imports (green), calls (blue), extends (purple), implements (amber).
 */
import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export interface DepEdgeData {
  edgeType: "imports" | "calls" | "extends" | "implements" | string;
}

const EDGE_COLORS: Record<string, string> = {
  imports: "var(--color-accent)",
  calls: "#60A5FA",
  extends: "#A78BFA",
  implements: "#F59E0B",
};

const EDGE_LABELS: Record<string, string> = {
  imports: "imports",
  calls: "calls",
  extends: "extends",
  implements: "implements",
};

function DepEdgeComponent(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    style,
    markerEnd,
  } = props;

  const edgeData = data as unknown as DepEdgeData | undefined;
  const edgeType: string = edgeData?.edgeType ?? "imports";
  const color = EDGE_COLORS[edgeType] ?? "var(--color-border)";
  const label = EDGE_LABELS[edgeType] ?? edgeType;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: color, strokeWidth: 1.75, ...style }}
      />
      <EdgeLabelRenderer>
        <div
          className="pointer-events-none absolute rounded border border-border/70 bg-background/90 px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            color,
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(DepEdgeComponent);
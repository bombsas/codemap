/**
 * GraphCanvas — the core React Flow canvas wrapping all three view modes.
 *
 * Responsibilities:
 *  - Renders nodes/edges for the active view (block / dependency / mind-map)
 *  - Custom node + edge registrations
 *  - Node click → select + open inspector panel
 *  - First-degree connection highlight on node click (dependency view)
 *  - Edge type filter chips toolbar (dependency / mind-map views)
 */
import { memo, useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import BlockNode from "./BlockNode";
import DepNode from "./DepNode";
import MindMapNode from "./MindMapNode";
import DepEdge from "./DepEdge";
import ViewToggle from "./ViewToggle";
import { useVisualizationStore, type EdgeTypeFilter } from "../../store/visualizationStore";
import { useGraphLayout, useMindMapLayout } from "../../hooks/useGraphLayout";
import type { ParsedProject } from "../../types";
import type { FunctionExplanation } from "../../types/analysis";

const nodeTypes: NodeTypes = {
  blockNode: BlockNode,
  depNode: DepNode,
  mindMapNode: MindMapNode,
};

const edgeTypes: EdgeTypes = {
  depEdge: DepEdge,
};

const EDGE_FILTERS: { type: EdgeTypeFilter; label: string; color: string }[] = [
  { type: "imports", label: "imports", color: "var(--color-accent)" },
  { type: "calls", label: "calls", color: "#60A5FA" },
  { type: "extends", label: "extends", color: "#A78BFA" },
  { type: "implements", label: "implements", color: "#F59E0B" },
];

interface GraphCanvasProps {
  project: ParsedProject | null;
  explanations: Map<string, FunctionExplanation>;
}

function GraphCanvasComponent({ project, explanations }: GraphCanvasProps) {
  const viewMode = useVisualizationStore((s) => s.viewMode);
  const expandedFunctionIds = useVisualizationStore((s) => s.expandedFunctionIds);
  const activeEdgeTypes = useVisualizationStore((s) => s.activeEdgeTypes);
  const mindMapRootFile = useVisualizationStore((s) => s.mindMapRootFile);
  const openPanel = useVisualizationStore((s) => s.openPanel);
  const selectNode = useVisualizationStore((s) => s.selectNode);
  const toggleEdgeType = useVisualizationStore((s) => s.toggleEdgeType);

  // Synchronous layouts (block, dependency)
  const { nodes: syncNodes, edges: syncEdges } = useGraphLayout(
    project,
    viewMode,
    expandedFunctionIds,
    explanations,
    activeEdgeTypes,
  );

  // Async mind-map layout
  const mindMapLayout = useMindMapLayout(project, activeEdgeTypes, mindMapRootFile);

  const { nodes: baseNodes, edges: baseEdges } =
    viewMode === "mindmap" ? mindMapLayout : { nodes: syncNodes, edges: syncEdges };

  const [nodes, setNodes, onNodesChange] = useNodesState(baseNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);

  // Keep React Flow state in sync when layout input changes
  const layoutKey = `${viewMode}:${baseNodes.length}:${baseEdges.length}`;
  const lastKey = useRef(layoutKey);
  if (lastKey.current !== layoutKey) {
    lastKey.current = layoutKey;
    setNodes(baseNodes);
    setEdges(baseEdges);
  }

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      selectNode(node.id);
      openPanel(node.id);
      // First-degree highlight in dependency view: dim everything else.
      if (viewMode === "dependency") {
        setNodes((nds) =>
          nds.map((n) => {
            const connected =
              n.id === node.id ||
              baseEdges.some(
                (e) =>
                  (e.source === node.id && e.target === n.id) ||
                  (e.target === node.id && e.source === n.id),
              );
            return { ...n, hidden: !connected };
          }),
        );
      }
    },
    [viewMode, baseEdges, setNodes, selectNode, openPanel],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const showEdgeFilters = viewMode === "dependency" || viewMode === "mindmap";

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-surface/60 px-3 py-2">
        <ViewToggle />
        {showEdgeFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {EDGE_FILTERS.map((f) => {
              const active = activeEdgeTypes.includes(f.type);
              return (
                <button
                  key={f.type}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-[10px] transition-all duration-150 active:scale-[0.96] ${
                    active
                      ? "border-transparent bg-muted text-foreground"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                  style={active ? { color: f.color } : undefined}
                  onClick={() => toggleEdgeType(f.type)}
                  aria-pressed={active}
                >
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full"
                    style={{ background: f.color, opacity: active ? 1 : 0.35 }}
                  />
                  {f.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={true}
          panOnScroll
          zoomOnDoubleClick={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--color-border)" />
          <Controls position="bottom-left" />
          {nodes.length > 0 && (
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={() => "var(--color-muted)"}
              maskColor="rgba(15, 23, 42, 0.7)"
            />
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

export default memo(GraphCanvasComponent);
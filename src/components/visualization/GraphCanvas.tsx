/**
 * GraphCanvas — the core React Flow canvas wrapping all three view modes.
 *
 * Responsibilities:
 *  - Renders nodes/edges for the active view (block / dependency / mind-map)
 *  - Custom node + edge registrations
 *  - Node click → select + open inspector panel
 *  - First-degree connection highlight on node click (dependency view)
 *  - Edge type filter chips toolbar (dependency / mind-map views)
 *  - File/function detail toggle (dependency view) + mind-map root picker
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
  const dependencyDetail = useVisualizationStore((s) => s.dependencyDetail);
  const mindMapRootFile = useVisualizationStore((s) => s.mindMapRootFile);
  const openPanel = useVisualizationStore((s) => s.openPanel);
  const selectNode = useVisualizationStore((s) => s.selectNode);
  const toggleEdgeType = useVisualizationStore((s) => s.toggleEdgeType);
  const setDependencyDetail = useVisualizationStore((s) => s.setDependencyDetail);
  const setMindMapRoot = useVisualizationStore((s) => s.setMindMapRoot);

  // Synchronous layouts (block, dependency)
  const { nodes: syncNodes, edges: syncEdges } = useGraphLayout(
    project,
    viewMode,
    expandedFunctionIds,
    explanations,
    activeEdgeTypes,
    dependencyDetail,
  );

  // Async mind-map layout
  const mindMapLayout = useMindMapLayout(project, activeEdgeTypes, mindMapRootFile);

  const { nodes: baseNodes, edges: baseEdges } =
    viewMode === "mindmap" ? mindMapLayout : { nodes: syncNodes, edges: syncEdges };

  const [nodes, setNodes, onNodesChange] = useNodesState(baseNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);

  // Keep React Flow state in sync when layout input changes
  const layoutKey = `${viewMode}:${dependencyDetail}:${mindMapRootFile}:${baseNodes.length}:${baseEdges.length}`;
  const lastKey = useRef(layoutKey);
  if (lastKey.current !== layoutKey) {
    lastKey.current = layoutKey;
    setNodes(baseNodes);
    setEdges(baseEdges);
  }

  /** Reset any first-degree highlight applied by a previous node click. */
  const resetHighlight = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => ({ ...n, style: { ...n.style, opacity: undefined } })),
    );
  }, [setNodes]);

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
            return {
              ...n,
              style: { ...n.style, opacity: connected ? 1 : 0.15 },
            };
          }),
        );
      }
    },
    [viewMode, baseEdges, setNodes, selectNode, openPanel],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    resetHighlight();
  }, [selectNode, resetHighlight]);

  // Toggling views resets any stale highlight
  const onViewChange = useCallback(() => {
    resetHighlight();
  }, [resetHighlight]);

  const showEdgeFilters = viewMode === "dependency" || viewMode === "mindmap";
  const rootCandidates = project?.files.map((f) => f.path) ?? [];
  const activeRoot =
    mindMapRootFile && rootCandidates.includes(mindMapRootFile)
      ? mindMapRootFile
      : rootCandidates[0] ?? "";

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-surface/60 px-3 py-2">
        <ViewToggle onViewChange={onViewChange} />
        <div className="flex flex-wrap items-center gap-2">
          {/* Dependency detail toggle: file vs function level */}
          {viewMode === "dependency" && (
            <div
              className="flex items-center overflow-hidden rounded-lg border border-border bg-surface"
              role="group"
              aria-label="Dependency graph detail level"
            >
              {(["file", "function"] as const).map((detail) => (
                <button
                  key={detail}
                  className={`cursor-pointer px-2.5 py-1 text-[10px] transition-all duration-150 active:scale-[0.96] ${
                    dependencyDetail === detail
                      ? "bg-accent font-semibold text-background"
                      : "text-muted hover:bg-muted/30 hover:text-foreground"
                  }`}
                  onClick={() => setDependencyDetail(detail)}
                  aria-pressed={dependencyDetail === detail}
                >
                  {detail === "file" ? "Files" : "Functions"}
                </button>
              ))}
            </div>
          )}

          {/* Mind-map root picker */}
          {viewMode === "mindmap" && rootCandidates.length > 0 && (
            <label className="flex items-center gap-1.5 text-[10px] text-muted">
              <span>Root</span>
              <select
                className="max-w-[180px] cursor-pointer rounded border border-border bg-surface px-2 py-1 text-[10px] text-foreground outline-none transition-colors duration-150 hover:border-accent/50 focus-visible:border-accent/50"
                value={activeRoot}
                onChange={(e) => setMindMapRoot(e.target.value || null)}
                aria-label="Mind-map root file"
              >
                {rootCandidates.map((fp) => (
                  <option key={fp} value={fp}>
                    {fp}
                  </option>
                ))}
              </select>
            </label>
          )}

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

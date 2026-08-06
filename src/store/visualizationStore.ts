/**
 * Visualization UI state — view mode, selection, expansion and edge filters.
 * Kept separate from analysis data so the canvas can be re-rendered cheaply.
 */
import { create } from "zustand";

export type ViewMode = "block" | "dependency" | "mindmap";

export type EdgeTypeFilter = "imports" | "calls" | "extends" | "implements";

export interface VisualizationState {
  /** Active canvas mode. */
  viewMode: ViewMode;
  /** Node id currently inspected in the detail panel, or null. */
  selectedNodeId: string | null;
  /** Function ids expanded in block view (collapsed by default). */
  expandedFunctionIds: Record<string, boolean>;
  /** Edge types currently visible in dependency/mindmap views. */
  activeEdgeTypes: EdgeTypeFilter[];
  /** Level of graph detail in dependency view: "file" or "function". */
  dependencyDetail: "file" | "function";
  /** Id of the file the mind-map is rooted at. */
  mindMapRootFile: string | null;
  /** True while the inspector panel is open. */
  panelOpen: boolean;

  setViewMode: (mode: ViewMode) => void;
  selectNode: (nodeId: string | null) => void;
  openPanel: (nodeId: string) => void;
  closePanel: () => void;
  toggleExpand: (functionId: string) => void;
  setExpanded: (functionId: string, expanded: boolean) => void;
  collapseAll: () => void;
  toggleEdgeType: (type: EdgeTypeFilter) => void;
  setEdgeTypes: (types: EdgeTypeFilter[]) => void;
  setDependencyDetail: (detail: "file" | "function") => void;
  setMindMapRoot: (filePath: string | null) => void;
  reset: () => void;
}

const DEFAULT_EDGE_TYPES: EdgeTypeFilter[] = [
  "imports",
  "calls",
  "extends",
  "implements",
];

export const useVisualizationStore = create<VisualizationState>((set) => ({
  viewMode: "block",
  selectedNodeId: null,
  expandedFunctionIds: {},
  activeEdgeTypes: [...DEFAULT_EDGE_TYPES],
  dependencyDetail: "file",
  mindMapRootFile: null,
  panelOpen: false,

  setViewMode: (mode) =>
    set((s) => ({
      viewMode: mode,
      // Switching views clears the selection so stale ids don't linger.
      selectedNodeId: null,
      panelOpen: false,
      expandedFunctionIds: mode === "block" ? s.expandedFunctionIds : {},
    })),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  openPanel: (nodeId) =>
    set({ selectedNodeId: nodeId, panelOpen: true }),

  closePanel: () => set({ panelOpen: false, selectedNodeId: null }),

  toggleExpand: (functionId) =>
    set((s) => ({
      expandedFunctionIds: {
        ...s.expandedFunctionIds,
        [functionId]: !s.expandedFunctionIds[functionId],
      },
    })),

  setExpanded: (functionId, expanded) =>
    set((s) => ({
      expandedFunctionIds: {
        ...s.expandedFunctionIds,
        [functionId]: expanded,
      },
    })),

  collapseAll: () => set({ expandedFunctionIds: {} }),

  toggleEdgeType: (type) =>
    set((s) => {
      const has = s.activeEdgeTypes.includes(type);
      const next = has
        ? s.activeEdgeTypes.filter((t) => t !== type)
        : [...s.activeEdgeTypes, type];
      return { activeEdgeTypes: next };
    }),

  setEdgeTypes: (types) => set({ activeEdgeTypes: types }),

  setDependencyDetail: (detail) =>
    set({ dependencyDetail: detail, selectedNodeId: null, panelOpen: false }),

  setMindMapRoot: (filePath) => set({ mindMapRootFile: filePath }),

  reset: () =>
    set({
      viewMode: "block",
      selectedNodeId: null,
      expandedFunctionIds: {},
      activeEdgeTypes: [...DEFAULT_EDGE_TYPES],
      dependencyDetail: "file",
      mindMapRootFile: null,
      panelOpen: false,
    }),
}));

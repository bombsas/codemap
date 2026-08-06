/**
 * Graph layout computation for all three view modes.
 *
 *  - **Block view**: static vertical stacks within file groups, left-to-right
 *  - **Dependency graph**: dagre layered layout
 *  - **Mind-map**: elkjs stress / radial layout
 */
import { useMemo, useEffect, useState } from "react";
import dagre from "dagre";
import ELK from "elkjs/lib/elk.bundled.js";
import type {
  ParsedProject,
  ParsedFile,
  ExtractedFunction,
} from "../types";
import type { ViewMode, EdgeTypeFilter } from "../store/visualizationStore";
import type { FunctionExplanation } from "../types/analysis";
import type { Node, Edge } from "@xyflow/react";

/* ── View-mode union type for the return ─────────────────────────────── */

export interface GraphNodesEdges {
  nodes: Node[];
  edges: Edge[];
}

/* ── Sizing constants ────────────────────────────────────────────────── */

const FUNC_CARD_W = 280;
const FUNC_CARD_H = 80;
const FUNC_CARD_H_EXTRA = 200;
const FILE_GROUP_PAD = 16;
const FILE_GROUP_GAP = 40;
const FUNC_GAP = 12;
const FILE_HEADER_H = 36;
const DEP_NODE_W = 200;
const DEP_NODE_H = 60;
const MIND_NODE_W = 180;
const MIND_NODE_H = 52;

/* ── Helpers ─────────────────────────────────────────────────────────── */

function funcCardHeight(fn: ExtractedFunction, expanded: boolean): number {
  if (!expanded) return FUNC_CARD_H;
  const codeLines = fn.codeSnippet.split("\n").length;
  const extra = Math.min(codeLines * 4, FUNC_CARD_H_EXTRA);
  return FUNC_CARD_H + extra;
}

function depNodeLabel(pf: ParsedFile): string {
  const parts = pf.path.split("/");
  return parts.length > 2 ? parts.slice(-2).join("/") : pf.path;
}

function depColor(type: string): string {
  switch (type) {
    case "imports":
      return "var(--color-accent)";
    case "calls":
      return "#60A5FA";
    case "extends":
      return "#A78BFA";
    case "implements":
      return "#F59E0B";
    default:
      return "var(--color-border)";
  }
}

function depLabel(type: string): string {
  switch (type) {
    case "imports":
      return "imports";
    case "calls":
      return "calls";
    case "extends":
      return "extends";
    case "implements":
      return "implements";
    default:
      return type;
  }
}

/* ── Block view layout (synchronous) ─────────────────────────────── */

function buildBlockLayout(
  project: ParsedProject,
  expanded: Record<string, boolean>,
  explanations: Map<string, FunctionExplanation>,
): GraphNodesEdges {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  let groupX = 0;

  for (const file of project.files) {
    const fns = file.functions.filter((f) => f.kind !== "class");
    if (fns.length === 0) continue;

    const gw = FUNC_CARD_W + FILE_GROUP_PAD * 2;

    // Compute group height
    let gh = FILE_HEADER_H + FILE_GROUP_PAD;
    for (const fn of fns) {
      gh += funcCardHeight(fn, !!expanded[fn.id]) + FUNC_GAP;
    }
    gh += FILE_GROUP_PAD;

    const groupId = `group:${file.path}`;
    nodes.push({
      id: groupId,
      type: "group",
      position: { x: groupX, y: 0 },
      data: { label: "" },
      style: { width: gw, height: gh },
    });

    const headerId = `file:${file.path}`;
    nodes.push({
      id: headerId,
      type: "blockNode",
      position: { x: 0, y: 0 },
      parentId: groupId,
      data: {
        kind: "file-header",
        filePath: file.path,
        language: file.language,
        functionCount: fns.length,
      },
      style: { width: FUNC_CARD_W },
    });

    // Function nodes
    let yAcc = FILE_HEADER_H + FILE_GROUP_PAD;
    for (const fn of fns) {
      const id = `func:${fn.id}`;
      const explanation = explanations.get(fn.id);
      const h = funcCardHeight(fn, !!expanded[fn.id]);
      nodes.push({
        id,
        type: "blockNode",
        position: { x: FILE_GROUP_PAD, y: yAcc },
        parentId: groupId,
        data: {
          kind: "function",
          fn,
          explanation: explanation ?? null,
          expanded: !!expanded[fn.id],
        },
        style: { width: FUNC_CARD_W, height: h },
      });
      yAcc += h + FUNC_GAP;
    }

    // Edges: header → each function (light containment indicators)
    for (const fn of fns) {
      edges.push({
        id: `e:contains:${file.path}:${fn.id}`,
        source: headerId,
        target: `func:${fn.id}`,
        type: "smoothstep",
        animated: false,
        style: { stroke: "var(--color-border)", strokeWidth: 1, opacity: 0.25 },
      });
    }

    groupX += gw + FILE_GROUP_GAP;
  }

  return { nodes, edges };
}

/* ── Dependency graph (dagre, synchronous) ────────────────────────── */

function buildDependencyLayout(
  project: ParsedProject,
  activeEdgeTypes: EdgeTypeFilter[],
): GraphNodesEdges {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  const fileNodes = new Set(project.files.map((f) => f.path));

  for (const file of project.files) {
    g.setNode(file.path, {
      width: DEP_NODE_W,
      height: DEP_NODE_H,
    });
  }

  const relevant = project.dependencies.filter((d) =>
    activeEdgeTypes.includes(d.type),
  );
  for (const dep of relevant) {
    const sf = dep.sourceFile;
    const tf = dep.targetFile;
    if (!sf || !tf) continue;
    if (!fileNodes.has(sf) || !fileNodes.has(tf)) continue;
    g.setEdge(sf, tf, { edgeType: dep.type });
  }

  dagre.layout(g);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const v of g.nodes()) {
    const { x, y } = g.node(v);
    const file = project.files.find((f) => f.path === v);
    nodes.push({
      id: `dep:${v}`,
      type: "depNode",
      position: { x: x - DEP_NODE_W / 2, y: y - DEP_NODE_H / 2 },
      data: {
        filePath: v,
        label: file ? depNodeLabel(file) : v,
        functionCount: file?.functions.filter((f) => f.kind !== "class").length ?? 0,
      },
      style: { width: DEP_NODE_W, height: DEP_NODE_H },
    });
  }

  for (const e of g.edges()) {
    const edgeType: string = g.edge(e).edgeType ?? "imports";
    edges.push({
      id: `e:dep:${e.v}:${e.w}`,
      source: `dep:${e.v}`,
      target: `dep:${e.w}`,
      type: "depEdge",
      data: { edgeType },
      style: { stroke: depColor(edgeType), strokeWidth: 2 },
      label: depLabel(edgeType),
    });
  }

  return { nodes, edges };
}

/* ── Mind-map (elkjs, async) ─────────────────────────────────────── */

async function buildMindMapLayout(
  project: ParsedProject,
  rootFile: string | null,
  activeEdgeTypes: EdgeTypeFilter[],
): Promise<GraphNodesEdges> {
  const elk = new ELK();

  const root = rootFile ?? project.files[0]?.path;
  if (!root) return { nodes: [], edges: [] };

  const relevant = project.dependencies.filter((d) =>
    activeEdgeTypes.includes(d.type),
  );

  // BFS from root
  const visited = new Set<string>();
  const queue = [root];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const d of relevant) {
      if (d.sourceFile === cur && d.targetFile && !visited.has(d.targetFile))
        queue.push(d.targetFile);
      if (d.targetFile === cur && d.sourceFile && !visited.has(d.sourceFile))
        queue.push(d.sourceFile);
    }
  }

  const elkChildren: { id: string; width: number; height: number }[] = [];
  const elkEdges: { id: string; sources: string[]; targets: string[] }[] = [];

  for (const fp of visited) {
    elkChildren.push({
      id: `mm:${fp}`,
      width: MIND_NODE_W,
      height: MIND_NODE_H,
    });
  }

  for (const d of relevant) {
    if (!d.sourceFile || !d.targetFile) continue;
    if (!visited.has(d.sourceFile) || !visited.has(d.targetFile)) continue;
    elkEdges.push({
      id: `emm:${d.sourceFile}:${d.targetFile}`,
      sources: [`mm:${d.sourceFile}`],
      targets: [`mm:${d.targetFile}`],
    });
  }

  try {
    const graph = await elk.layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "stress",
        "elk.stress.desired-edge-length": "120",
        "elk.spacing.nodeNode": "30",
      },
      children: elkChildren,
      edges: elkEdges,
    });

    const nodes: Node[] = [];
    for (const c of graph.children ?? []) {
      const fp = c.id.replace(/^mm:/, "");
      nodes.push({
        id: c.id,
        type: "mindMapNode",
        position: { x: c.x ?? 0, y: c.y ?? 0 },
        data: {
          filePath: fp,
          label: fp.split("/").pop() ?? fp,
        },
        style: { width: MIND_NODE_W, height: MIND_NODE_H },
      });
    }

    const edges: Edge[] = [];
    for (const e of graph.edges ?? []) {
      const sourceId = e.sources?.[0] ?? "";
      const targetId = e.targets?.[0] ?? "";
      const dep = relevant.find(
        (d) =>
          `mm:${d.sourceFile}` === sourceId && `mm:${d.targetFile}` === targetId,
      );
      const edgeType = dep?.type ?? "imports";
      edges.push({
        id: e.id,
        source: sourceId,
        target: targetId,
        type: "depEdge",
        data: { edgeType },
        style: { stroke: depColor(edgeType), strokeWidth: 2 },
        label: depLabel(edgeType),
      });
    }

    return { nodes, edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}

/* ── Main hook (synchronous layouts) ─────────────────────────────── */

export function useGraphLayout(
  project: ParsedProject | null,
  viewMode: ViewMode,
  expanded: Record<string, boolean>,
  explanations: Map<string, FunctionExplanation>,
  activeEdgeTypes: EdgeTypeFilter[],
): GraphNodesEdges {
  return useMemo<GraphNodesEdges>(() => {
    if (!project) return { nodes: [], edges: [] };
    switch (viewMode) {
      case "block":
        return buildBlockLayout(project, expanded, explanations);
      case "dependency":
        return buildDependencyLayout(project, activeEdgeTypes);
      default:
        return { nodes: [], edges: [] };
    }
  }, [project, viewMode, expanded, explanations, activeEdgeTypes]);
}

/* ── Async hook (mind-map via elkjs) ─────────────────────────────── */

export function useMindMapLayout(
  project: ParsedProject | null,
  activeEdgeTypes: EdgeTypeFilter[],
  mindMapRoot: string | null,
): GraphNodesEdges {
  const [layout, setLayout] = useState<GraphNodesEdges>({
    nodes: [],
    edges: [],
  });

  useEffect(() => {
    if (!project) {
      setLayout({ nodes: [], edges: [] });
      return;
    }
    let cancelled = false;
    buildMindMapLayout(project, mindMapRoot, activeEdgeTypes).then((l) => {
      if (!cancelled) setLayout(l);
    });
    return () => {
      cancelled = true;
    };
  }, [project, activeEdgeTypes, mindMapRoot]);

  return layout;
}
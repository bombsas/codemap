export interface AnalysisFile {
  path: string;
  content: string;
  /** Language id, e.g. "javascript", "typescript", "python" — or "unsupported". */
  language: string;
}

export interface FunctionExplanation {
  functionId: string;
  purpose: string;
  inputs: { name: string; type: string; description: string }[];
  outputs: { name: string; type: string; description: string }[];
  logic: string;
}

export interface AnalysisPipelineState {
  files: AnalysisFile[];
  step: "idle" | "parsing" | "analyzing" | "explaining" | "building" | "complete" | "error";
  error?: string;
  progress: {
    parsed: number;
    total: number;
    explained?: number;
    totalFunctions?: number;
  };
  explanations?: Record<string, FunctionExplanation>;
  failedExplanationIds?: string[];
}
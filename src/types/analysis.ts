export interface AnalysisFile {
  path: string;
  content: string;
}

export interface AnalysisPipelineState {
  files: AnalysisFile[];
  step: "idle" | "parsing" | "analyzing" | "explaining" | "building" | "complete" | "error";
  error?: string;
  progress: {
    parsed: number;
    total: number;
  };
}
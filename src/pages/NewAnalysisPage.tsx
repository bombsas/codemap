import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SiGithub } from "react-icons/si";
import {
  Upload,
  FileCode,
  Terminal,
  ArrowLeft,
  Save,
  CheckCircle,
} from "lucide-react";
import PageLayout from "../components/layout/PageLayout";
import GitHubForm from "../components/analysis/GitHubForm";
import ZipUpload from "../components/analysis/ZipUpload";
import PasteFiles from "../components/analysis/PasteFiles";
import ProgressStepper from "../components/analysis/ProgressStepper";
import { useParser } from "../hooks/useParser";
import { useExplanation } from "../hooks/useExplanation";
import { saveAnalysis } from "../hooks/useSaveAnalysis";
import type { AnalysisFile } from "../types/analysis";
import { detectLanguage, SUPPORTED_LANGUAGES } from "../lib/languages";

/** Group languages by category for the supported-languages display. */
const LANG_GROUPS = SUPPORTED_LANGUAGES.reduce<
  Record<string, { id: string; display: string }[]>
>((acc, l) => {
  (acc[l.category] ??= []).push({ id: l.id, display: l.display });
  return acc;
}, {} as Record<string, { id: string; display: string }[]>);

type InputMethod = "github" | "zip" | "paste";

const METHODS: {
  id: InputMethod;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "github",
    label: "GitHub",
    description: "From a public repository",
    icon: <SiGithub className="w-4 h-4" />,
  },
  {
    id: "zip",
    label: "ZIP Upload",
    description: "Upload a .zip archive",
    icon: <Upload className="w-4 h-4" />,
  },
  {
    id: "paste",
    label: "Paste Files",
    description: "Manually enter files",
    icon: <FileCode className="w-4 h-4" />,
  },
];

type PipelineStep =
  | "idle"
  | "parsing"
  | "analyzing"
  | "explaining"
  | "building"
  | "complete"
  | "error";

export default function NewAnalysisPage() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<InputMethod>("github");
  const [collectedFiles, setCollectedFiles] = useState<AnalysisFile[] | null>(
    null,
  );
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>("idle");
  const [saveProgress, setSaveProgress] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedProjectIdRef = useRef<string | null>(null);

  const parser = useParser();
  const explainer = useExplanation();

  /* ── Start pipeline when files are ready ─────────────────────────── */

  const handleFilesReady = useCallback(
    (files: Array<{ path: string; content: string }>) => {
      const analysisFiles: AnalysisFile[] = files
        .filter((f) => f.path && f.content)
        .map((f) => ({
          path: f.path,
          content: f.content,
          language: detectLanguage(f.path),
        }));

      setCollectedFiles(analysisFiles);
      setPipelineStep("parsing");
      parser.run(analysisFiles);
    },
    [parser],
  );

  /* ── Chain: parsing → analyzing → explaining ─────────────────────── */

  // When parser finishes → move to "analyzing" (brief UI pause before
  // explanations start). Kept as a pure state transition: calling
  // setPipelineStep here in an effect whose deps include pipelineStep would
  // re-run the effect, execute its cleanup, and cancel the timeout below.
  useEffect(() => {
    if (pipelineStep !== "parsing") return;
    if (parser.status === "done" && parser.project) {
      setPipelineStep("analyzing");
    }
    if (parser.status === "error") {
      setPipelineStep("error");
    }
  }, [parser.status, pipelineStep]);

  // Short delay to show "Analyzing" (building the dependency graph happens
  // inside parseProject and is fast for most projects), then kick off the
  // explanation pipeline. Note: `explainer` is a fresh object every render,
  // so it is deliberately excluded from the deps — `explainer.run` itself is
  // stable (useCallback), and including the object would cancel this timeout
  // on every render, stranding the pipeline at "analyzing".
  useEffect(() => {
    if (pipelineStep !== "analyzing") return;
    const project = parser.project;
    if (!project) return;
    const t = setTimeout(() => {
      setPipelineStep("explaining");
      explainer.run(project);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineStep, parser.project]);

  // When explainer finishes → move to building step, save to Supabase,
  // then navigate to the real project-based URL.
  useEffect(() => {
    if (pipelineStep !== "explaining") return;
    if (explainer.status === "done") {
      setPipelineStep("building");
      setSaveProgress("");
      setSaveError(null);

      if (!parser.project || !collectedFiles) return;

      const doSave = async () => {
        const project = parser.project!;
        const files = collectedFiles!;
        const name =
          files[0]?.path
            ? `${files.length} file${files.length !== 1 ? "s" : ""}`
            : "Analysis";

        const result = await saveAnalysis(
          {
            files,
            project,
            explanations: explainer.explanations,
            failedIds: explainer.failedIds,
            name,
            sourceType: method,
          },
          (step) => {
            setSaveProgress(step.replace("saving-", ""));
          },
        );

        if (result.saved && result.projectId) {
          savedProjectIdRef.current = result.projectId;
          setPipelineStep("complete");
        } else {
          setSaveError(result.error ?? "Failed to save analysis.");
          // Still allow navigation — data lives in memory for this session
          savedProjectIdRef.current = null;
          setPipelineStep("complete");
        }
      };

      doSave();
    }
    if (explainer.status === "error") {
      setPipelineStep("error");
    }
  }, [
    explainer.status,
    explainer.explanations,
    explainer.failedIds,
    parser.project,
    pipelineStep,
    navigate,
    collectedFiles,
    method,
  ]);

  /* ── Navigate to the saved analysis view ──────────────────────────── */

  const handleViewAnalysis = useCallback(() => {
    const projectId = savedProjectIdRef.current;
    if (projectId) {
      navigate(`/analysis/${projectId}`);
    } else if (parser.project) {
      // Fallback: navigate with in-memory state (save failed)
      const explanations = Object.fromEntries(explainer.explanations);
      navigate(`/analysis/session-${Date.now()}`, {
        state: {
          project: parser.project,
          explanations,
          failedIds: explainer.failedIds,
          name: collectedFiles?.[0]?.path
            ? `${collectedFiles.length} files`
            : "Analysis",
        },
      });
    }
  }, [navigate, parser.project, explainer.explanations, explainer.failedIds, collectedFiles]);

  /* ── Navigate back / reset ───────────────────────────────────────── */

  const handleBack = () => {
    if (collectedFiles && pipelineStep !== "complete") {
      parser.reset();
      explainer.reset();
      setCollectedFiles(null);
      setPipelineStep("idle");
    } else {
      navigate("/dashboard");
    }
  };

  const unsupportedFiles = collectedFiles
    ? collectedFiles.filter((f) => detectLanguage(f.path) === "unsupported")
    : [];

  /* ── Derived progress values ─────────────────────────────────────── */

  const parseProgress = parser.progress;
  const explainProgress = explainer.progress;
  const totalFunctions = explainProgress.totalFunctions;

  // Lookup map: functionId → { filePath, functionName }
  const fnLookup = useMemo(() => {
    const map = new Map<string, { filePath: string; functionName: string }>();
    if (parser.project) {
      for (const f of parser.project.files) {
        for (const fn of f.functions) {
          map.set(fn.id, { filePath: f.path, functionName: fn.qualifiedName ?? fn.name });
        }
      }
    }
    return map;
  }, [parser.project]);

  // Resolve current function being explained to a human-readable string
  const currentExplainInfo = useMemo(() => {
    const id = explainProgress.currentFunctionId;
    if (!id) return null;
    const info = fnLookup.get(id);
    return info ?? null;
  }, [explainProgress.currentFunctionId, fnLookup]);

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <button
          onClick={handleBack}
          className={`
            inline-flex items-center gap-1.5 text-xs
            transition-colors duration-150 mb-6 cursor-pointer
            ${
              pipelineStep === "complete"
                ? "text-accent hover:text-accent/80"
                : "text-muted hover:text-foreground"
            }
          `}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {collectedFiles && pipelineStep !== "complete"
            ? "Back to import"
            : "Back to dashboard"}
        </button>

        {!collectedFiles ? (
          <>
            {/* ── Input selection ─────────────────────────────────────── */}
            <div className="mb-8">
              <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
                <Terminal className="w-6 h-6 text-accent" />
              </div>
              <h1 className="font-heading text-2xl text-foreground tracking-wide mb-2">
                New Analysis
              </h1>
              <p className="text-sm text-muted max-w-lg">
                Import your codebase to visualize its structure, dependencies,
                and get AI-powered explanations.
              </p>
            </div>

            {/* Supported languages banner */}
            <div className="mb-6 bg-surface border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="text-xs font-heading text-foreground tracking-wide">
                  We can analyze these languages
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {(["Programming", "Web", "Config"] as const).map(
                  (category) => (
                    <div key={category} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-muted uppercase tracking-wider mr-0.5">
                        {category}:
                      </span>
                      {LANG_GROUPS[category]?.map((lang) => (
                        <span
                          key={lang.id}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-accent/8 text-accent/90 border border-accent/15 font-mono"
                        >
                          {lang.display}
                        </span>
                      ))}
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="flex gap-2 mb-6">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`
                    flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg text-xs
                    transition-all duration-150 cursor-pointer
                    ${
                      method === m.id
                        ? "bg-accent/10 border border-accent/30 text-accent"
                        : "bg-surface border border-border text-muted hover:border-accent/20 hover:text-foreground"
                    }
                  `}
                >
                  {m.icon}
                  <span className="font-heading tracking-wider">{m.label}</span>
                  <span className="text-[10px] opacity-60 hidden sm:block">
                    {m.description}
                  </span>
                </button>
              ))}
            </div>

            <div className="bg-surface border border-border rounded-lg p-5">
              {method === "github" && (
                <GitHubForm onFilesReady={handleFilesReady} />
              )}
              {method === "zip" && (
                <ZipUpload onFilesReady={handleFilesReady} />
              )}
              {method === "paste" && (
                <PasteFiles onFilesReady={handleFilesReady} />
              )}
            </div>
          </>
        ) : (
          /* ── Pipeline progress view ────────────────────────────────── */
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-xl text-foreground tracking-wide mb-2">
                {pipelineStep === "complete"
                  ? "Analysis Complete"
                  : "Analyzing Codebase"}
              </h2>
              <p className="text-sm text-muted">
                {collectedFiles.length} file
                {collectedFiles.length !== 1 ? "s" : ""} collected
                {unsupportedFiles.length > 0 &&
                  ` · ${unsupportedFiles.length} unsupported`}
                {totalFunctions > 0 && ` · ${totalFunctions} functions`}
              </p>
            </div>

            {/* Stepper */}
            <div className="bg-surface border border-border rounded-lg p-6">
              <ProgressStepper currentStep={pipelineStep} />

              {/* Live progress details */}
              {pipelineStep === "parsing" && parseProgress.total > 0 && (
                <div className="mt-4 text-center space-y-2">
                  <p className="text-xs text-muted">
                    Parsed {parseProgress.parsed} of {parseProgress.total} files
                  </p>
                  {parseProgress.currentFile && (
                    <p className="text-[11px] font-mono text-accent/80 truncate max-w-full px-4">
                      Parsing: {parseProgress.currentFile}
                    </p>
                  )}
                </div>
              )}
              {pipelineStep === "analyzing" && (
                <div className="mt-4 text-center space-y-2">
                  <p className="text-xs text-muted">
                    Building dependency graph…
                  </p>
                  <p className="text-[11px] font-mono text-accent/80">
                    Resolving cross-file references
                  </p>
                </div>
              )}
              {pipelineStep === "explaining" && totalFunctions > 0 && (
                <div className="mt-4 text-center space-y-2">
                  <p className="text-xs text-muted">
                    Explaining {explainProgress.explained} of {totalFunctions}{" "}
                    functions
                    {explainer.failedIds.length > 0 &&
                      ` · ${explainer.failedIds.length} failed`}
                    {totalFunctions >= 200 &&
                      " (capped at 200)"}
                  </p>
                  {currentExplainInfo && (
                    <p className="text-[11px] font-mono text-accent/80 truncate max-w-full px-4">
                      Explaining: {currentExplainInfo.functionName} from{" "}
                      {currentExplainInfo.filePath}
                    </p>
                  )}
                </div>
              )}
              {pipelineStep === "building" && (
                <div className="mt-4 text-center">
                  <p className="text-xs text-muted">
                    {saveProgress
                      ? `Saving: ${saveProgress}…`
                      : "Saving analysis…"}
                  </p>
                  <div className="mt-2 flex justify-center">
                    <div className="h-1 w-48 rounded-full bg-border overflow-hidden">
                      <div className="h-full w-1/2 rounded-full bg-accent animate-pulse" />
                    </div>
                  </div>
                  {saveError && (
                    <p className="text-xs text-amber-400 mt-2">
                      Save issue: {saveError} (analysis still available this session)
                    </p>
                  )}
                </div>
              )}

              {/* Error state */}
              {pipelineStep === "error" && (
                <div className="mt-4 text-center">
                  <p className="text-xs text-destructive mb-3">
                    {parser.error ||
                      explainer.error ||
                      "Analysis encountered an error. Please try again."}
                  </p>
                  <button
                    onClick={() => {
                      parser.reset();
                      explainer.reset();
                      setCollectedFiles(null);
                      setPipelineStep("idle");
                    }}
                    className="text-xs text-accent hover:text-accent/80 transition-colors cursor-pointer"
                  >
                    Start over
                  </button>
                </div>
              )}

              {/* Success summary */}
              {pipelineStep === "complete" && (
                <div className="mt-5 pt-5 border-t border-border text-center">
                  <p className="text-sm text-foreground font-heading tracking-wide mb-1">
                    {explainer.explanations.size} function
                    {explainer.explanations.size !== 1 ? "s" : ""} explained
                  </p>
                  <p className="text-xs text-muted mb-4">
                    {saveError
                      ? "Analysis completed but couldn't be saved to your account."
                      : "Analysis saved to your account."}
                  </p>
                  <button
                    onClick={handleViewAnalysis}
                    className="inline-flex items-center gap-2 bg-accent text-background rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-150 hover:opacity-90 active:scale-[0.97] cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    View Analysis
                  </button>
                </div>
              )}

              {/* Partial failure warning */}
              {pipelineStep === "complete" && explainer.failedIds.length > 0 && (
                <p className="text-xs text-amber-400 text-center mt-4">
                  {explainer.failedIds.length} function
                  {explainer.failedIds.length !== 1 ? "s" : ""} could not be
                  explained —{" "}
                  <button
                    onClick={() => {
                      setPipelineStep("explaining");
                      explainer.retry();
                    }}
                    className="underline cursor-pointer"
                  >
                    retry
                  </button>{" "}
                  now.
                </p>
              )}
            </div>

            {/* File summary */}
            <details className="bg-surface border border-border rounded-lg">
              <summary className="px-4 py-3 text-sm text-muted hover:text-foreground cursor-pointer transition-colors duration-150 font-heading tracking-wide">
                View collected files
              </summary>
              <div className="px-4 pb-3 max-h-64 overflow-y-auto space-y-1">
                {collectedFiles.map((f, i) => {
                  const lang = detectLanguage(f.path);
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs py-1"
                    >
                      <span className="text-foreground font-mono truncate pr-2">
                        {f.path}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                          lang === "unsupported"
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-accent/10 text-accent"
                        }`}
                      >
                        {lang}
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
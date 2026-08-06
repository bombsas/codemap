import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SiGithub } from "react-icons/si";
import { Upload, FileCode, Terminal, ArrowLeft } from "lucide-react";
import PageLayout from "../components/layout/PageLayout";
import GitHubForm from "../components/analysis/GitHubForm";
import ZipUpload from "../components/analysis/ZipUpload";
import PasteFiles from "../components/analysis/PasteFiles";
import ProgressStepper from "../components/analysis/ProgressStepper";
import { useParser } from "../hooks/useParser";
import { useExplanation } from "../hooks/useExplanation";
import type { AnalysisFile } from "../types/analysis";
import { detectLanguage } from "../lib/languages";

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

  // When parser finishes → move to explaining step
  useEffect(() => {
    if (pipelineStep !== "parsing") return;
    if (parser.status === "done" && parser.project) {
      const project = parser.project; // capture for closure
      // Short delay to show "Analyzing" (building dependency graph happens
      // inside parseProject and is fast for most projects)
      setPipelineStep("analyzing");
      const t = setTimeout(() => {
        setPipelineStep("explaining");
        explainer.run(project);
      }, 600);
      return () => clearTimeout(t);
    }
    if (parser.status === "error") {
      setPipelineStep("error");
    }
  }, [parser.status, parser.project, pipelineStep, explainer]);

  // When explainer finishes → move to building step (stub for now)
  useEffect(() => {
    if (pipelineStep !== "explaining") return;
    if (explainer.status === "done") {
      setPipelineStep("building");
      // Stub: simulate visualization build
      const t = setTimeout(() => {
        setPipelineStep("complete");
      }, 800);
      return () => clearTimeout(t);
    }
    if (explainer.status === "error") {
      setPipelineStep("error");
    }
  }, [explainer.status, pipelineStep]);

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
                <p className="text-xs text-muted text-center mt-4">
                  Parsed {parseProgress.parsed} of {parseProgress.total} files
                </p>
              )}
              {pipelineStep === "explaining" && totalFunctions > 0 && (
                <p className="text-xs text-muted text-center mt-4">
                  Explaining {explainProgress.explained} of {totalFunctions}{" "}
                  functions
                  {explainer.failedIds.length > 0 &&
                    ` · ${explainer.failedIds.length} failed`}
                </p>
              )}
              {pipelineStep === "building" && (
                <p className="text-xs text-muted text-center mt-4">
                  Building visualization...
                </p>
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
                  <p className="text-xs text-muted">
                    Explanations are ready for the visualization view.
                  </p>
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
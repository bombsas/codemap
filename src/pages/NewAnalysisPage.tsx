import { useState, useCallback } from "react";
import PageLayout from "../components/layout/PageLayout";
import GitHubForm from "../components/analysis/GitHubForm";
import ZipUpload from "../components/analysis/ZipUpload";
import PasteFiles from "../components/analysis/PasteFiles";
import ProgressStepper from "../components/analysis/ProgressStepper";
import type { AnalysisFile } from "../types/analysis";
import { detectLanguage } from "../lib/languages";
import { SiGithub } from "react-icons/si";
import { Upload, FileCode, Terminal, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

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

export default function NewAnalysisPage() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<InputMethod>("github");
  const [collectedFiles, setCollectedFiles] = useState<AnalysisFile[] | null>(
    null,
  );
  const [pipelineStep, setPipelineStep] = useState<
    "idle" | "parsing" | "analyzing" | "explaining" | "building" | "complete" | "error"
  >("idle");

  const handleFilesReady = useCallback(
    (files: Array<{ path: string; content: string }>) => {
      // Normalize to AnalysisFile[] with language detection
      const analysisFiles: AnalysisFile[] = files
        .filter((f) => f.path && f.content)
        .map((f) => ({
          path: f.path,
          content: f.content,
        }));

      setCollectedFiles(analysisFiles);

      // Kick off pipeline (stub — will be wired to Tasks 5-8)
      setPipelineStep("parsing");
      console.log(
        `[Pipeline] Collected ${analysisFiles.length} files, starting analysis...`,
      );

      // Stub: simulate pipeline progression for UI demo
      const steps: ("parsing" | "analyzing" | "explaining" | "building" | "complete")[] = [
        "parsing",
        "analyzing",
        "explaining",
        "building",
        "complete",
      ];
      let i = 0;
      const interval = setInterval(() => {
        i++;
        if (i < steps.length) {
          setPipelineStep(steps[i]);
        } else {
          clearInterval(interval);
        }
      }, 2000);
    },
    [],
  );

  const handleBack = () => {
    if (collectedFiles) {
      setCollectedFiles(null);
      setPipelineStep("idle");
    } else {
      navigate("/dashboard");
    }
  };

  const unsupportedFiles = collectedFiles
    ? collectedFiles.filter((f) => detectLanguage(f.path) === "unsupported")
    : [];

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors duration-150 mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {collectedFiles ? "Back to import" : "Back to dashboard"}
        </button>

        {!collectedFiles ? (
          <>
            {/* Header */}
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

            {/* Method tabs */}
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

            {/* Form panels */}
            <div className="bg-surface border border-border rounded-lg p-5">
              {method === "github" && <GitHubForm onFilesReady={handleFilesReady} />}
              {method === "zip" && <ZipUpload onFilesReady={handleFilesReady} />}
              {method === "paste" && (
                <PasteFiles onFilesReady={handleFilesReady} />
              )}
            </div>
          </>
        ) : (
          /* Pipeline progress view */
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-xl text-foreground tracking-wide mb-2">
                Analyzing Codebase
              </h2>
              <p className="text-sm text-muted">
                {collectedFiles.length} file
                {collectedFiles.length !== 1 ? "s" : ""} collected
                {unsupportedFiles.length > 0 &&
                  ` · ${unsupportedFiles.length} unsupported`}
              </p>
            </div>

            <div className="bg-surface border border-border rounded-lg p-6">
              <ProgressStepper currentStep={pipelineStep} />
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
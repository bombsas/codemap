import { Check } from "lucide-react";

export type PipelineStep = "parsing" | "analyzing" | "explaining" | "building";

interface ProgressStepperProps {
  currentStep: PipelineStep | "idle" | "complete" | "error";
}

const STEPS: { id: PipelineStep; label: string; description: string }[] = [
  { id: "parsing", label: "Parsing", description: "Processing each file" },
  {
    id: "analyzing",
    label: "Analyzing",
    description: "Building dependency graph",
  },
  {
    id: "explaining",
    label: "Explaining",
    description: "Generating AI explanations",
  },
  {
    id: "building",
    label: "Building",
    description: "Creating visualization",
  },
];

export default function ProgressStepper({
  currentStep,
}: ProgressStepperProps) {
  const getStepState = (
    stepId: PipelineStep,
  ): "completed" | "active" | "pending" => {
    if (currentStep === "complete") return "completed";
    if (currentStep === "error") {
      // Show parsing as active during error state
      if (stepId === "parsing") return "active";
      return "pending";
    }

    const stepIndex = STEPS.findIndex((s) => s.id === stepId);
    const activeIndex = STEPS.findIndex((s) => s.id === currentStep);

    if (stepIndex < activeIndex) return "completed";
    if (stepId === currentStep) return "active";
    return "pending";
  };

  if (currentStep === "idle") return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const state = getStepState(step.id);

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
                    transition-all duration-300
                    ${
                      state === "completed"
                        ? "bg-accent text-background"
                        : state === "active"
                          ? "bg-accent/20 border-2 border-accent text-accent"
                          : "bg-muted/20 border border-border text-muted"
                    }
                  `}
                >
                  {state === "completed" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`
                    text-[10px] mt-1.5 font-heading tracking-wider whitespace-nowrap
                    ${
                      state === "completed"
                        ? "text-accent"
                        : state === "active"
                          ? "text-foreground"
                          : "text-muted"
                    }
                  `}
                >
                  {step.label}
                </span>
                <span
                  className={`
                    text-[8px] mt-0.5 whitespace-nowrap
                    ${state === "active" ? "text-muted" : "text-muted/40"}
                  `}
                >
                  {step.description}
                </span>
              </div>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className={`
                    flex-1 h-[1px] mx-3 mt-[-1.5rem]
                    transition-all duration-300
                    ${
                      getStepState(step.id) === "completed"
                        ? "bg-accent/50"
                        : "bg-border"
                    }
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      {currentStep === "error" && (
        <p className="text-xs text-destructive text-center mt-4">
          Analysis encountered an error. Please try again.
        </p>
      )}
    </div>
  );
}
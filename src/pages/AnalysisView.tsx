import { useParams } from "react-router-dom";
import PageLayout from "../components/layout/PageLayout";

export default function AnalysisView() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-full bg-muted/20 border border-border flex items-center justify-center mb-4">
          <span className="text-muted text-2xl font-heading">◉</span>
        </div>
        <h1 className="font-heading text-2xl text-foreground tracking-wide mb-2">
          Analysis
        </h1>
        <p className="text-sm text-muted mb-2">
          Viewing analysis <code className="text-accent text-xs bg-accent/10 px-1.5 py-0.5 rounded">{projectId}</code>
        </p>
        <p className="text-xs text-muted/50">
          Visualization modes coming soon.
        </p>
      </div>
    </PageLayout>
  );
}
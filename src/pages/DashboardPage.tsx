import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import PageLayout from "../components/layout/PageLayout";
import { FileCode, Upload } from "lucide-react";
import { SiGithub } from "react-icons/si";

type Project = Database["public"]["Tables"]["projects"]["Row"];

function SourceIcon({ type }: { type: string }) {
  switch (type) {
    case "github":
      return <SiGithub className="w-3.5 h-3.5" />;
    case "zip":
      return <Upload className="w-3.5 h-3.5" />;
    default:
      return <FileCode className="w-3.5 h-3.5" />;
  }
}

function SourceBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    github: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    zip: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    paste: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
        colors[type] || "bg-muted/20 text-muted border-border"
      }`}
    >
      <SourceIcon type={type} />
      {type === "github" ? "GitHub" : type === "zip" ? "ZIP" : "Paste"}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setUserEmail(user.email);

      const { data } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) setProjects(data);
      setLoading(false);
    };

    init();
  }, []);

  return (
    <PageLayout userEmail={userEmail}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl text-foreground tracking-wide">
            Your Analyses
          </h1>
          <p className="text-sm text-muted mt-1">
            {projects.length === 0
              ? "No analyses yet"
              : `${projects.length} ${projects.length === 1 ? "analysis" : "analyses"}`}
          </p>
        </div>
        <button
          onClick={() => navigate("/new")}
          className="inline-flex items-center gap-2 bg-primary text-on-primary rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-all duration-150 active:scale-[0.98]"
        >
          <FileCode className="w-4 h-4" />
          New Analysis
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 rounded border-2 border-accent/30 border-t-accent animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-lg bg-surface/30">
          <div className="w-16 h-16 rounded-full bg-muted/20 border border-border flex items-center justify-center mb-4">
            <FileCode className="w-8 h-8 text-muted" />
          </div>
          <h3 className="font-heading text-foreground text-lg mb-2">
            No analyses yet
          </h3>
          <p className="text-sm text-muted mb-6 max-w-sm text-center">
            Start by uploading a codebase — paste a GitHub URL, upload a ZIP, or
            paste files directly.
          </p>
          <button
            onClick={() => navigate("/new")}
            className="inline-flex items-center gap-2 bg-primary text-on-primary rounded-md px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-all duration-150 active:scale-[0.98]"
          >
            New Analysis
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => navigate(`/analysis/${project.id}`)}
              className="bg-surface border border-border rounded-lg p-5 text-left hover:border-accent/30 hover:bg-surface/80 transition-all duration-150 group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-heading text-foreground text-sm tracking-wide truncate group-hover:text-accent transition-colors">
                  {project.name}
                </h3>
                <SourceBadge type={project.source_type} />
              </div>

              <div className="flex items-center gap-4 text-xs text-muted">
                <span>{project.file_count ?? 0} files</span>
                <span>{project.function_count ?? 0} functions</span>
              </div>

              <p className="text-[10px] text-muted/50 mt-3">
                {formatDate(project.created_at)}
              </p>
            </button>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
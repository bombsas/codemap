import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import PageLayout from "../components/layout/PageLayout";
import {
  FileCode,
  Upload,
  MoreHorizontal,
  Pencil,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { SiGithub } from "react-icons/si";

type Project = Database["public"]["Tables"]["projects"]["Row"];

/* ── Small helpers ──────────────────────────────────────────────────── */

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

/* ── Confirmation Modal ─────────────────────────────────────────────── */

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

function ConfirmModal({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <h3 className="font-heading text-foreground text-lg tracking-wide">{title}</h3>
        </div>
        <p className="text-sm text-muted mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-muted hover:text-foreground border border-border rounded-md transition-colors duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-destructive rounded-md hover:opacity-90 transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded border-2 border-white/30 border-t-white animate-spin" />
                Deleting…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Dropdown Menu ──────────────────────────────────────────────────── */

interface CardMenuProps {
  onRename: () => void;
  onReAnalyze: () => void;
  onDelete: () => void;
}

function CardMenu({ onRename, onReAnalyze, onDelete }: CardMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded-md text-muted hover:text-foreground hover:bg-muted/20 transition-colors duration-150 cursor-pointer"
        aria-label="Card actions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-44 bg-background border border-border rounded-lg shadow-lg py-1 animate-in fade-in duration-100">
          <button
            onClick={() => {
              setOpen(false);
              onRename();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/20 transition-colors duration-150 cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 text-muted" />
            Rename
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onReAnalyze();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/20 transition-colors duration-150 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted" />
            Re-analyze
          </button>
          <hr className="border-border my-1" />
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors duration-150 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Rename Input ───────────────────────────────────────────────────── */

interface InlineRenameProps {
  value: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

function InlineRename({ value, onSave, onCancel }: InlineRenameProps) {
  const [name, setName] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = name.trim();
      if (trimmed && trimmed !== value) {
        onSave(trimmed);
      } else {
        onCancel();
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== value) {
          onSave(trimmed);
        } else {
          onCancel();
        }
      }}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-surface border border-accent/50 rounded px-1.5 py-0.5 text-sm text-foreground font-heading tracking-wide focus:outline-none focus:ring-1 focus:ring-accent/30"
    />
  );
}

/* ── Main Dashboard ─────────────────────────────────────────────────── */

export default function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setProjects(data);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setUserEmail(user.email);
      await fetchProjects();
      setLoading(false);
    };
    init();
  }, [fetchProjects]);

  /* ── Rename handler ──────────────────────────────────────────────────── */

  const handleRename = useCallback(
    async (projectId: string, newName: string) => {
      // Optimistic update
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, name: newName } : p)),
      );
      setRenamingId(null);

      await supabase
        .from("projects")
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq("id", projectId);
    },
    [],
  );

  /* ── Delete handler ──────────────────────────────────────────────────── */

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw new Error(error.message);

      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  /* ── Re-analyze handler ──────────────────────────────────────────────── */

  const handleReAnalyze = useCallback(
    (project: Project) => {
      if (project.source_type === "github" && project.source_url) {
        navigate("/new", {
          state: { prefillMethod: "github", prefillUrl: project.source_url },
        });
      } else {
        navigate("/new");
      }
    },
    [navigate],
  );

  return (
    <PageLayout userEmail={userEmail}>
      {/* ── Delete confirmation modal ──────────────────────────────── */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete analysis?"
          message={`This will permanently delete "${deleteTarget.name}" and all its files, symbols, and dependency data. This cannot be undone.`}
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

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
            <div
              key={project.id}
              onClick={() => navigate(`/analysis/${project.id}`)}
              className="bg-surface border border-border rounded-lg p-5 text-left hover:border-accent/30 hover:bg-surface/80 transition-all duration-150 group cursor-pointer relative"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1 pr-2" onClick={(e) => e.stopPropagation()}>
                  {renamingId === project.id ? (
                    <InlineRename
                      value={project.name}
                      onSave={(name) => handleRename(project.id, name)}
                      onCancel={() => setRenamingId(null)}
                    />
                  ) : (
                    <h3
                      className="font-heading text-foreground text-sm tracking-wide truncate group-hover:text-accent transition-colors"
                      title={project.name}
                    >
                      {project.name}
                    </h3>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <SourceBadge type={project.source_type} />
                  <CardMenu
                    onRename={() => setRenamingId(project.id)}
                    onReAnalyze={() => handleReAnalyze(project)}
                    onDelete={() => setDeleteTarget(project)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted">
                <span>{project.file_count ?? 0} files</span>
                <span>{project.function_count ?? 0} functions</span>
              </div>

              <p className="text-[10px] text-muted/50 mt-3">
                {formatDate(project.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
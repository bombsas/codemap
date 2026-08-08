import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { SiGithub } from "react-icons/si";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface GitHubFormProps {
  onFilesReady: (files: Array<{ path: string; content: string }>) => void;
  initialUrl?: string;
}

const GITHUB_URL_REGEX = /^https:\/\/github\.com\/[^/]+\/[^/]+/;

export default function GitHubForm({ onFilesReady, initialUrl }: GitHubFormProps) {
  const [repoUrl, setRepoUrl] = useState(initialUrl ?? "");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ fileCount: number } | null>(null);

  const isValidUrl = GITHUB_URL_REGEX.test(repoUrl.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUrl) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "fetch-repo",
        {
          body: { repoUrl: repoUrl.trim(), branch: branch.trim() || undefined },
          timeout: 120000, // Allow up to 120s — GitHub Trees API + file fetches
        },
      );

      if (fnError) {
        // The supabase-js error is generic; detect common patterns
        const msg = fnError.message || "";
        if (msg.includes("504") || msg.includes("timeout") || msg.includes("timed out")) {
          throw new Error(
            "The request timed out. The repository may be too large — try a smaller repo or use ZIP upload.",
          );
        }
        throw new Error(msg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const files = data?.files;
      if (!files || !Array.isArray(files) || files.length === 0) {
        throw new Error("No files found in the repository");
      }

      if (data.truncated) {
        // Show a warning but proceed — better UX than blocking
        setError(
          `Showing the first ${files.length} files (repo has more). Analysis will be partial.`,
        );
      }

      setSuccess({ fileCount: files.length });
      onFilesReady(files);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.includes("401")
            ? "Private repo? Configure a GitHub token in Settings"
            : err.message.includes("404")
              ? "Repository not found — check the URL"
              : err.message
          : "Failed to fetch repository";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="repo-url"
          className="block text-xs text-muted font-heading tracking-wider uppercase mb-1.5"
        >
          GitHub Repository URL
        </label>
        <input
          id="repo-url"
          type="text"
          value={repoUrl}
          onChange={(e) => {
            setRepoUrl(e.target.value);
            setSuccess(null);
            setError(null);
          }}
          placeholder="https://github.com/owner/repo"
          className="w-full bg-surface border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 font-mono focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-150"
          disabled={loading}
        />
        {repoUrl && !isValidUrl && (
          <p className="text-xs text-destructive mt-1">
            Enter a valid GitHub URL (e.g. https://github.com/owner/repo)
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="branch"
          className="block text-xs text-muted font-heading tracking-wider uppercase mb-1.5"
        >
          Branch <span className="text-muted/50 font-normal normal-case">(optional)</span>
        </label>
        <input
          id="branch"
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="main"
          className="w-full bg-surface border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 font-mono focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-150"
          disabled={loading}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-md px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
          <p className="text-xs text-accent">
            {success.fileCount} file{success.fileCount !== 1 ? "s" : ""} fetched successfully
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={!isValidUrl || loading}
        className="w-full inline-flex items-center justify-center gap-2 bg-accent text-background rounded-md px-4 py-2.5 text-sm font-medium font-heading tracking-wider hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.98]"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 rounded border-2 border-background/30 border-t-background animate-spin" />
            Fetching repository...
          </>
        ) : (
          <>
            <SiGithub className="w-4 h-4" />
            Fetch Repository
          </>
        )}
      </button>
    </form>
  );
}
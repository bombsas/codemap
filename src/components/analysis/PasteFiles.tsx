import { useState } from "react";
import { Plus, Trash2, FileCode, AlertCircle, CheckCircle2 } from "lucide-react";

interface FileEntry {
  id: string;
  path: string;
  content: string;
}

interface PasteFilesProps {
  onFilesReady: (files: Array<{ path: string; content: string }>) => void;
}

let fileIdCounter = 0;
function nextFileId(): string {
  fileIdCounter += 1;
  return `file-${fileIdCounter}-${Date.now()}`;
}

export default function PasteFiles({ onFilesReady }: PasteFilesProps) {
  const [entries, setEntries] = useState<FileEntry[]>([
    { id: nextFileId(), path: "", content: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const updateEntry = (
    id: string,
    field: "path" | "content",
    value: string,
  ) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
    setError(null);
    setShowSuccess(false);
  };

  const addFile = () => {
    setEntries((prev) => [
      ...prev,
      { id: nextFileId(), path: "", content: "" },
    ]);
  };

  const removeFile = (id: string) => {
    setEntries((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((e) => e.id !== id);
    });
    setError(null);
    setShowSuccess(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    for (const entry of entries) {
      if (!entry.path.trim()) {
        setError("All files must have a path");
        return;
      }
      if (!entry.content.trim()) {
        setError("All files must have content");
        return;
      }
    }

    const files = entries.map((e) => ({
      path: e.path.trim(),
      content: e.content,
    }));

    setShowSuccess(true);
    setError(null);
    onFilesReady(files);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            className="bg-surface border border-border rounded-lg p-3 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted font-heading tracking-wider uppercase">
                File {index + 1}
              </span>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeFile(entry.id)}
                  className="text-muted hover:text-destructive transition-colors duration-150 p-1"
                  title="Remove file"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div>
              <label
                htmlFor={`path-${entry.id}`}
                className="block text-[10px] text-muted mb-1 font-heading tracking-wider"
              >
                File Path
              </label>
              <input
                id={`path-${entry.id}`}
                type="text"
                value={entry.path}
                onChange={(e) => updateEntry(entry.id, "path", e.target.value)}
                placeholder="src/components/Button.tsx"
                className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-xs text-foreground placeholder:text-muted/50 font-mono focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-150"
              />
            </div>

            <div>
              <label
                htmlFor={`content-${entry.id}`}
                className="block text-[10px] text-muted mb-1 font-heading tracking-wider"
              >
                File Content
              </label>
              <textarea
                id={`content-${entry.id}`}
                value={entry.content}
                onChange={(e) =>
                  updateEntry(entry.id, "content", e.target.value)
                }
                placeholder="Paste your code here..."
                rows={6}
                className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-xs text-foreground placeholder:text-muted/50 font-mono focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-150 resize-y"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addFile}
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent transition-colors duration-150 font-medium"
      >
        <Plus className="w-3.5 h-3.5" />
        Add file
      </button>

      {error && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {showSuccess && (
        <div className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-md px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
          <p className="text-xs text-accent">
            {entries.length} file{entries.length !== 1 ? "s" : ""} ready for
            analysis
          </p>
        </div>
      )}

      <button
        type="submit"
        className="w-full inline-flex items-center justify-center gap-2 bg-accent text-background rounded-md px-4 py-2.5 text-sm font-medium font-heading tracking-wider hover:opacity-90 transition-all duration-150 active:scale-[0.98]"
      >
        <FileCode className="w-4 h-4" />
        Start Analysis
      </button>
    </form>
  );
}
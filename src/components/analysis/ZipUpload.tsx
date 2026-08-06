import { useState, useRef, useCallback } from "react";
import { unzip } from "fflate";
import { Upload, AlertCircle, CheckCircle2, X } from "lucide-react";
import { shouldSkipFile } from "../../lib/languages";

interface ZipUploadProps {
  onFilesReady: (files: Array<{ path: string; content: string }>) => void;
}

export default function ZipUpload({ onFilesReady }: ZipUploadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processZip = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".zip")) {
        setError("Please upload a .zip file");
        return;
      }

      setLoading(true);
      setError(null);
      setFileCount(null);
      setFileName(file.name);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        const result = await new Promise<Record<string, Uint8Array>>(
          (resolve, reject) => {
            unzip(uint8, (err, data) => {
              if (err) reject(new Error("Failed to unzip file"));
              else resolve(data);
            });
          },
        );

        const files: Array<{ path: string; content: string }> = [];
        const entries = Object.entries(result);

        for (const [rawPath, bytes] of entries) {
          // Skip directories (zero-length entries ending with /)
          if (bytes.length === 0 && rawPath.endsWith("/")) continue;

          // Strip top-level folder if present (like GitHub archives)
          let relativePath = rawPath;
          const parts = rawPath.split("/");
          if (parts.length > 1) {
            // Check if the top folder contains files directly underneath
            const topFolder = parts[0];
            if (topFolder && parts.length > 1) {
              relativePath = parts.slice(1).join("/");
            }
          }

          if (!relativePath) continue;

          // Check if file should be skipped
          if (shouldSkipFile(relativePath)) continue;

          // Decode to text
          try {
            const decoder = new TextDecoder("utf-8", { fatal: false });
            const content = decoder.decode(bytes);

            // Skip if content is mostly non-UTF8 friendly
            if (content.includes("\uFFFD") && content.length > 0) continue;

            files.push({ path: relativePath, content });
          } catch {
            // Skip files that can't be decoded as text
            continue;
          }
        }

        if (files.length === 0) {
          setError(
            "No supported files found in the archive. Supported: code, config, markup, and text files.",
          );
          setLoading(false);
          return;
        }

        setFileCount(files.length);
        onFilesReady(files);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to process ZIP file",
        );
      } finally {
        setLoading(false);
      }
    },
    [onFilesReady],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processZip(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processZip(file);
    },
    [processZip],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleReset = () => {
    setError(null);
    setFileCount(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-all duration-150
          ${
            dragOver
              ? "border-accent bg-accent/5"
              : "border-border hover:border-accent/40 hover:bg-surface/50"
          }
          ${loading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          className="hidden"
          disabled={loading}
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
            <div>
              <p className="text-sm text-foreground font-medium">
                Extracting files...
              </p>
              <p className="text-xs text-muted mt-1">This may take a moment</p>
            </div>
          </div>
        ) : fileName && fileCount ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-foreground font-medium">{fileName}</p>
              <p className="text-xs text-muted mt-0.5">
                {fileCount} file{fileCount !== 1 ? "s" : ""} extracted
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted/20 border border-border flex items-center justify-center">
              <Upload className="w-5 h-5 text-muted" />
            </div>
            <div>
              <p className="text-sm text-foreground font-medium">
                Drop a ZIP file here, or click to browse
              </p>
              <p className="text-xs text-muted mt-1">
                Supports .zip archives with code files
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="shrink-0 text-destructive/60 hover:text-destructive transition-colors duration-150"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {fileCount && !error && (
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-muted hover:text-foreground transition-colors duration-150 underline underline-offset-2"
        >
          Upload a different file
        </button>
      )}
    </div>
  );
}
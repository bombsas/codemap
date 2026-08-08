/**
 * SourceCodeView — monospaced code block with line numbers.
 * Read-only, with optional line highlighting.
 * No syntax highlighter dependency — uses <pre><code> with Tailwind styling.
 */
import { memo, useMemo, useRef, useEffect } from "react";

interface SourceCodeViewProps {
  code: string;
  highlightStartLine?: number;
  highlightEndLine?: number;
  language?: string;
  maxHeight?: number;
}

function SourceCodeViewComponent({
  code,
  highlightStartLine,
  highlightEndLine,
  language,
  maxHeight = 400,
}: SourceCodeViewProps) {
  const lines = useMemo(() => code.split("\n"), [code]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to highlighted region
  useEffect(() => {
    if (!highlightStartLine || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-line="${highlightStartLine}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightStartLine]);

  return (
    <div
      ref={containerRef}
      className="overflow-auto rounded-lg border border-border bg-black/40 font-mono text-[11px] leading-[1.5]"
      style={{ maxHeight }}
    >
      {language && (
        <div className="sticky top-0 z-10 border-b border-border/50 bg-background/80 px-3 py-1 text-[9px] uppercase tracking-wide text-foreground/60 backdrop-blur-sm">
          {language}
        </div>
      )}
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const isHighlighted =
              highlightStartLine !== undefined &&
              highlightEndLine !== undefined &&
              lineNum >= highlightStartLine &&
              lineNum <= highlightEndLine;

            return (
              <tr
                key={idx}
                data-line={lineNum}
                className={isHighlighted ? "bg-accent/10" : ""}
              >
                <td className="select-none border-r border-border/30 px-3 text-right text-[10px] text-foreground/40">
                  {lineNum}
                </td>
                <td className="px-3 text-foreground/90">
                  <code>{line || "\u00A0"}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default memo(SourceCodeViewComponent);
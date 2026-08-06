/**
 * AI explanation pipeline — batches parsed function snippets, calls the
 * `explain-code` Edge Function with retry logic, and returns accumulated
 * explanations keyed by function ID.
 */
import { useCallback, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { FunctionExplanation } from "../types/analysis";
import type { ParsedProject } from "../types";

/* ── Edge Function batch config ─────────────────────────────────────── */

const BATCH_SIZE = 15;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1500;

/* ── Response shape from the Edge Function ──────────────────────────── */

interface ExplainCodeResponse {
  explanations: FunctionExplanation[];
  remaining: number;
}

/* ── Public interface ───────────────────────────────────────────────── */

export interface UseExplanationResult {
  status: "idle" | "explaining" | "done" | "error";
  explanations: Map<string, FunctionExplanation>;
  /** IDs of functions whose explanation failed after all retries. */
  failedIds: string[];
  progress: { explained: number; totalFunctions: number };
  error: string | null;
  run: (project: ParsedProject) => void;
  /** Retry only the functions that previously failed. */
  retry: () => void;
  reset: () => void;
}

/* ── Hook ───────────────────────────────────────────────────────────── */

export function useExplanation(): UseExplanationResult {
  const [status, setStatus] = useState<"idle" | "explaining" | "done" | "error">(
    "idle",
  );
  const [explanations, setExplanations] = useState<Map<string, FunctionExplanation>>(
    new Map(),
  );
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<{
    explained: number;
    totalFunctions: number;
  }>({ explained: 0, totalFunctions: 0 });
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const failedRef = useRef<string[]>([]);
  const snippetsRef = useRef<Map<string, string>>(new Map());

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setStatus("idle");
    setExplanations(new Map());
    setFailedIds([]);
    failedRef.current = [];
    snippetsRef.current = new Map();
    setProgress({ explained: 0, totalFunctions: 0 });
    setError(null);
  }, []);

  /** Core processing: explain the given snippets in batches with retries. */
  const processSnippets = useCallback(
    async (myId: number, snippets: { functionId: string; code: string }[]) => {
      setStatus("explaining");
      setError(null);

      if (snippets.length === 0) {
        if (runIdRef.current !== myId) return;
        setStatus("done");
        setProgress({ explained: 0, totalFunctions: 0 });
        return;
      }

      setProgress({ explained: 0, totalFunctions: snippets.length });

      // Chunk into batches of BATCH_SIZE
      const batches: { functionId: string; code: string }[][] = [];
      for (let i = 0; i < snippets.length; i += BATCH_SIZE) {
        batches.push(snippets.slice(i, i + BATCH_SIZE));
      }

      const accumulated = new Map<string, FunctionExplanation>();
      const failed: string[] = [];
      let explainedSoFar = 0;

      for (let b = 0; b < batches.length; b++) {
        if (runIdRef.current !== myId) return; // cancelled

        const batch = batches[b];
        let lastError: string | null = null;

        // Retry loop for this batch
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (runIdRef.current !== myId) return;

          try {
            const { data, error: invokeError } =
              await supabase.functions.invoke<ExplainCodeResponse>(
                "explain-code",
                {
                  body: {
                    projectId: "pipeline", // ephemeral — the Edge Function validates it exists
                    snippets: batch,
                  },
                },
              );

            if (invokeError) {
              lastError =
                invokeError instanceof Error
                  ? invokeError.message
                  : String(invokeError);
              if (attempt < MAX_RETRIES) {
                await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
              }
              continue;
            }

            if (!data?.explanations || !Array.isArray(data.explanations)) {
              lastError = "Unexpected response shape from explain-code";
              if (attempt < MAX_RETRIES) {
                await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
              }
              continue;
            }

            // Store explanations
            for (const exp of data.explanations) {
              accumulated.set(exp.functionId, exp);
            }

            explainedSoFar += batch.length;
            lastError = null; // success
            break; // exit retry loop
          } catch (e: unknown) {
            lastError = e instanceof Error ? e.message : "Unknown error";
            if (attempt < MAX_RETRIES) {
              await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
            }
          }
        }

        // If all retries exhausted, record failed IDs
        if (lastError !== null) {
          setError(lastError);
          for (const s of batch) {
            failed.push(s.functionId);
          }
          explainedSoFar += batch.length; // count as processed (failed)
        }

        // Update progress on every batch completion
        if (runIdRef.current === myId) {
          setProgress({
            explained: explainedSoFar,
            totalFunctions: snippets.length,
          });
        }

        // Short delay between batches to avoid overwhelming the Edge Function
        if (b < batches.length - 1) {
          await sleep(300);
        }
      }

      if (runIdRef.current !== myId) return;

      failedRef.current = failed;
      setExplanations((prev) => {
        const next = new Map(prev);
        for (const [k, v] of accumulated) next.set(k, v);
        return next;
      });
      setFailedIds(failed);
      setStatus(failed.length > 0 && accumulated.size === 0 ? "error" : "done");
    },
    [],
  );

  const run = useCallback(
    async (project: ParsedProject) => {
      const myId = ++runIdRef.current;
      setExplanations(new Map());
      setFailedIds([]);
      failedRef.current = [];

      // Collect all function snippets (skip class-level — too large, not meaningful)
      const allSnippets: { functionId: string; code: string }[] = [];
      const snippetMap = new Map<string, string>();
      for (const file of project.files) {
        for (const fn of file.functions) {
          if (fn.kind === "class") continue;
          allSnippets.push({ functionId: fn.id, code: fn.codeSnippet });
          snippetMap.set(fn.id, fn.codeSnippet);
        }
      }
      snippetsRef.current = snippetMap;

      await processSnippets(myId, allSnippets);
    },
    [processSnippets],
  );

  /** Retry only the functions that previously failed. */
  const retry = useCallback(() => {
    const myId = ++runIdRef.current;
    const failed = failedRef.current;
    if (failed.length === 0) return;

    // Rebuild snippets for the failed IDs from the stored map
    const failedSnippets: { functionId: string; code: string }[] = [];
    const snippetMap = snippetsRef.current;
    for (const id of failed) {
      const code = snippetMap.get(id);
      if (code !== undefined) failedSnippets.push({ functionId: id, code });
    }
    if (failedSnippets.length === 0) return;

    setFailedIds([]); // clear while retrying
    processSnippets(myId, failedSnippets);
  }, [processSnippets]);

  return { status, explanations, failedIds, progress, error, run, retry, reset };
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
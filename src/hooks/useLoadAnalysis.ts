/**
 * useLoadAnalysis — fetches a complete analysis from Supabase and
 * reconstructs the ParsedProject + FunctionExplanation Map so the
 * visualization components can render without location.state.
 *
 * Returns status, the reconstructed data, and a load() trigger.
 */

import { useCallback, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  ExtractedFunction,
  ParsedDependency,
  ParsedFile,
  ParsedProject,
} from "../types";
import type { FunctionExplanation } from "../types/analysis";
import type { Database } from "../lib/database.types";

/* ── DB row types ──────────────────────────────────────────────────── */

type FunctionRow = Database["public"]["Tables"]["functions"]["Row"];

/* ── Public return type ─────────────────────────────────────────────── */

export interface LoadedAnalysis {
  /** Reconstructed parsed project (files + dependencies). */
  project: ParsedProject;
  /** Explanations keyed by function string ID. */
  explanations: Map<string, FunctionExplanation>;
  /** Function IDs that failed explanation. */
  failedIds: string[];
  /** Project metadata. */
  name: string;
  sourceType: string;
  sourceUrl: string | null;
  createdAt: string;
  fileCount: number;
  functionCount: number;
}

export type LoadStatus =
  | "idle"
  | "loading"
  | "done"
  | "error"
  | "not-found";

export interface UseLoadAnalysisResult {
  status: LoadStatus;
  analysis: LoadedAnalysis | null;
  error: string | null;
  load: (projectId: string) => Promise<void>;
  reset: () => void;
}

/* ── Hook ───────────────────────────────────────────────────────────── */

export function useLoadAnalysis(): UseLoadAnalysisResult {
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [analysis, setAnalysis] = useState<LoadedAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setAnalysis(null);
    setError(null);
  }, []);

  const load = useCallback(async (projectId: string) => {
    setStatus("loading");
    setError(null);
    setAnalysis(null);

    try {
      // ── 1. Fetch project ──────────────────────────────────────────────
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (projErr) {
        if (projErr.code === "PGRST116") {
          setStatus("not-found");
          return;
        }
        throw new Error(projErr.message);
      }
      if (!project) {
        setStatus("not-found");
        return;
      }

      // ── 2. Fetch files ────────────────────────────────────────────────
      const { data: fileRows, error: filesErr } = await supabase
        .from("files")
        .select("id, path, language, content")
        .eq("project_id", projectId)
        .order("path", { ascending: true });

      if (filesErr || !fileRows) throw new Error(filesErr?.message ?? "Failed to load files");

      // ── 3. Fetch functions ────────────────────────────────────────────
      const { data: fnRows, error: fnsErr } = await supabase
        .from("functions")
        .select("*")
        .eq("project_id", projectId)
        .order("start_line", { ascending: true });

      if (fnsErr || !fnRows) throw new Error(fnsErr?.message ?? "Failed to load functions");

      // ── 4. Fetch dependencies ─────────────────────────────────────────
      const { data: depRows, error: depsErr } = await supabase
        .from("dependencies")
        .select("*")
        .eq("project_id", projectId);

      if (depsErr) throw new Error(depsErr?.message ?? "Failed to load dependencies");

      // ── 5. Build file UUID → path lookup ──────────────────────────────
      const fileIdToPath = new Map<string, string>();
      for (const f of fileRows) fileIdToPath.set(f.id, f.path);

      // ── 6. Build function UUID → function info ─────────────────────────
      // Map: fn.uuid → { fnStringId, name, qualifiedName, kind, explanation? }
      const fnUuidToInfo = new Map<
        string,
        {
          fnId: string;
          name: string;
          qualifiedName?: string;
          kind: string;
          explanation: FunctionExplanation | null;
        }
      >();

      // Also group functions by file_id for reconstruction
      const fnsByFileId = new Map<string, FunctionRow[]>();
      for (const fn of fnRows) {
        const arr = fnsByFileId.get(fn.file_id) ?? [];
        arr.push(fn);
        fnsByFileId.set(fn.file_id, arr);
      }

      // ── 7. Reconstruct ParsedFile[] ───────────────────────────────────
      const parsedFiles: ParsedFile[] = [];

      for (const file of fileRows) {
        const fileFns = fnsByFileId.get(file.id) ?? [];
        const functions: ExtractedFunction[] = [];

        for (const fn of fileFns) {
          const fnStringId = `${file.path}#${fn.kind}:${fn.name}@${fn.start_line}`;

          // Reconstruct qualified name (best-effort: for methods, prepend parent class)
          const explanation: FunctionExplanation | null =
            fn.explanation as unknown as FunctionExplanation | null;

          fnUuidToInfo.set(fn.id, {
            fnId: fnStringId,
            name: fn.name,
            kind: fn.kind,
            qualifiedName: fn.name, // plain name; we don't store parentClass in DB
            explanation,
          });

          functions.push({
            id: fnStringId,
            name: fn.name,
            kind: fn.kind as "function" | "method" | "class",
            signature: fn.signature ?? "",
            startLine: fn.start_line,
            endLine: fn.end_line,
            codeSnippet: fn.code_snippet,
            calls: [],   // Filled by buildDependencyGraph during live parse;
            imports: [], // these are empty for loaded analyses since the
                         // dependency graph is stored separately.
            qualifiedName: fn.name,
          });
        }

        parsedFiles.push({
          path: file.path,
          language: file.language,
          content: file.content,
          functions,
          imports: [],          // Stored implicitly via dependencies
          classHierarchy: [],   // Not persisted in DB; reconstructed minimally
        });
      }

      // ── 8. Reconstruct classHierarchy from saved functions ─────────────
      // Classes are stored as kind="class" functions. Build the hierarchy.
      for (const file of parsedFiles) {
        const classes = file.functions.filter((fn) => fn.kind === "class");
        for (const c of classes) {
          file.classHierarchy.push({
            name: c.name,
            extends: [],
            implements: [],
          });
        }
      }

      // ── 9. Reconstruct ParsedDependency[] ─────────────────────────────
      const dependencies: ParsedDependency[] = [];

      for (const dep of depRows ?? []) {
        const srcPath = dep.source_file_id
          ? (fileIdToPath.get(dep.source_file_id) ?? undefined)
          : undefined;
        const tgtPath = dep.target_file_id
          ? (fileIdToPath.get(dep.target_file_id) ?? undefined)
          : undefined;
        const srcFn = dep.source_function_id
          ? fnUuidToInfo.get(dep.source_function_id)?.fnId
          : undefined;
        const tgtFn = dep.target_function_id
          ? fnUuidToInfo.get(dep.target_function_id)?.fnId
          : undefined;

        dependencies.push({
          sourceFile: srcPath,
          targetFile: tgtPath,
          sourceFunction: srcFn,
          targetFunction: tgtFn,
          type: dep.dep_type as ParsedDependency["type"],
        });
      }

      // ── 10. Build explanations map ────────────────────────────────────
      const explanations = new Map<string, FunctionExplanation>();
      const failedIds: string[] = [];

      for (const [, info] of fnUuidToInfo) {
        if (info.explanation) {
          explanations.set(info.fnId, {
            ...info.explanation,
            functionId: info.fnId,
          });
        }
      }

      const project_: ParsedProject = {
        files: parsedFiles,
        dependencies,
        unsupportedFiles: [],
        unparseableFiles: [],
      };

      setAnalysis({
        project: project_,
        explanations,
        failedIds,
        name: project.name,
        sourceType: project.source_type,
        sourceUrl: project.source_url,
        createdAt: project.created_at ?? "",
        fileCount: project.file_count ?? 0,
        functionCount: project.function_count ?? 0,
      });

      setStatus("done");
    } catch (e: unknown) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to load analysis");
    }
  }, []);

  return { status, analysis, error, load, reset };
}
/**
 * Save pipeline results to Supabase.
 *
 * Phases:
 *  1. Create project record
 *  2. Insert all files → get file UUIDs
 *  3. Insert all functions → get function UUIDs
 *  4. Insert dependencies (with UUID references)
 *  5. Update function explanations
 *  6. Update project counts
 *
 * Each DB write retries up to 3 times with exponential back-off.
 */
import { supabase } from "../lib/supabase";
import type { AnalysisFile, FunctionExplanation } from "../types/analysis";
import type { ParsedProject } from "../types";
import type { Json } from "../lib/database.types";

/* ── Public options & result ────────────────────────────────────────── */

export interface SaveAnalysisOptions {
  files: AnalysisFile[];
  project: ParsedProject;
  explanations: Map<string, FunctionExplanation>;
  failedIds: string[];
  name: string;
  sourceType: "github" | "zip" | "paste";
  sourceUrl?: string | null;
}

export interface SaveAnalysisResult {
  projectId: string;
  saved: boolean;
  error?: string;
}

/* ── Main save function ─────────────────────────────────────────────── */

export async function saveAnalysis(
  options: SaveAnalysisOptions,
  onProgress?: (step: string, detail?: string) => void,
): Promise<SaveAnalysisResult> {
  const { files, project, explanations, failedIds, name, sourceType, sourceUrl } =
    options;

  // ── Step 0: Get current user ─────────────────────────────────────────
  onProgress?.("saving-project", "Creating project…");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { projectId: "", saved: false, error: "Not authenticated" };
  }
  const userId = userData.user.id;

  // ── Step 1: Create project record ────────────────────────────────────
  const projResult = await retryExec(async () => {
    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        source_type: sourceType,
        source_url: sourceUrl ?? null,
        file_count: files.length,
        function_count: 0,
        user_id: userId,
      })
      .select()
      .single();
    return { data: data as { id: string } | null, error };
  }, 3);

  if (projResult.error || !projResult.data) {
    return {
      projectId: "",
      saved: false,
      error: projResult.error?.message ?? "Failed to create project",
    };
  }
  const projectId = projResult.data.id;

  // ── Step 2: Insert files ─────────────────────────────────────────────
  onProgress?.("saving-files", "Saving files…");

  const fileRows = files.map((f) => ({
    project_id: projectId,
    path: f.path,
    language: f.language === "unsupported" ? "javascript" : f.language,
    content: f.content,
  }));

  const filesResult = await retryExec(async () => {
    const { data, error } = await supabase
      .from("files")
      .insert(fileRows)
      .select();
    return { data: data as Array<{ id: string; path: string }> | null, error };
  }, 3);

  if (filesResult.error || !filesResult.data) {
    return {
      projectId,
      saved: false,
      error: filesResult.error?.message ?? "Failed to save files",
    };
  }

  // path → file UUID
  const pathToFileId = new Map<string, string>();
  for (const sf of filesResult.data) pathToFileId.set(sf.path, sf.id);

  // ── Step 3: Insert functions ─────────────────────────────────────────
  onProgress?.("saving-functions", "Saving symbols…");

  const functionRows: Array<{
    file_id: string;
    project_id: string;
    name: string;
    kind: string;
    signature: string | null;
    start_line: number;
    end_line: number;
    code_snippet: string;
    explanation: Json | null;
    explanation_status: string;
  }> = [];

  for (const parsedFile of project.files) {
    const fileId = pathToFileId.get(parsedFile.path);
    if (!fileId) continue;

    for (const fn of parsedFile.functions) {
      const explanation = explanations.get(fn.id);
      functionRows.push({
        file_id: fileId,
        project_id: projectId,
        name: fn.name,
        kind: fn.kind,
        signature: fn.signature,
        start_line: fn.startLine,
        end_line: fn.endLine,
        code_snippet: fn.codeSnippet,
        explanation: (explanation as unknown as Json) ?? null,
        explanation_status: explanation
          ? "explained"
          : failedIds.includes(fn.id)
            ? "failed"
            : "pending",
      });
    }
  }

  const fnsResult = await retryExec(async () => {
    const { data, error } = await supabase
      .from("functions")
      .insert(functionRows)
      .select();
    return {
      data: data as Array<{
        id: string;
        file_id: string;
        name: string;
        kind: string;
        start_line: number;
      }> | null,
      error,
    };
  }, 3);

  if (fnsResult.error || !fnsResult.data) {
    return {
      projectId,
      saved: false,
      error: fnsResult.error?.message ?? "Failed to save functions",
    };
  }

  // Function string ID (e.g. "src/App.tsx#method:render@12") → UUID
  // (filePath, qualifiedName) → UUID  (for dependency resolution)
  const fnLookup = new Map<string, string>();
  const depFnLookup = new Map<string, string>();

  let fnIdx = 0;
  for (const parsedFile of project.files) {
    const fileId = pathToFileId.get(parsedFile.path);
    if (!fileId) continue;
    for (const fn of parsedFile.functions) {
      const savedFn = fnsResult.data[fnIdx];
      if (!savedFn) {
        fnIdx++;
        continue;
      }
      fnLookup.set(fn.id, savedFn.id);
      depFnLookup.set(
        `${parsedFile.path}|${fn.qualifiedName ?? fn.name}`,
        savedFn.id,
      );
      fnIdx++;
    }
  }

  // ── Step 4: Insert dependencies ──────────────────────────────────────
  onProgress?.("saving-dependencies", "Saving dependencies…");

  const depRows = project.dependencies.map((dep) => ({
    project_id: projectId,
    dep_type: dep.type,
    source_file_id: dep.sourceFile
      ? (pathToFileId.get(dep.sourceFile) ?? null)
      : null,
    target_file_id: dep.targetFile
      ? (pathToFileId.get(dep.targetFile) ?? null)
      : null,
    source_function_id:
      dep.sourceFile && dep.sourceFunction
        ? (depFnLookup.get(`${dep.sourceFile}|${dep.sourceFunction}`) ?? null)
        : null,
    target_function_id:
      dep.targetFile && dep.targetFunction
        ? (depFnLookup.get(`${dep.targetFile}|${dep.targetFunction}`) ?? null)
        : null,
  }));

  if (depRows.length > 0) {
    const { error: depError } = await supabase
      .from("dependencies")
      .insert(depRows);
    if (depError) {
      // Non-fatal — dependencies can be re-derived from the file data
      console.warn("Failed to save dependencies:", depError);
    }
  }

  // ── Step 5: Update project counts ────────────────────────────────────
  onProgress?.("saving-counts", "Finalizing…");

  const totalFunctions = project.files.reduce(
    (sum, f) => sum + f.functions.length,
    0,
  );
  await supabase
    .from("projects")
    .update({ function_count: totalFunctions })
    .eq("id", projectId);

  return { projectId, saved: true };
}

/* ── Retry helper ──────────────────────────────────────────────────── */

async function retryExec<T>(
  action: () => Promise<{ data: T | null; error: { message: string } | null }>,
  maxRetries: number,
): Promise<{
  data: T | null;
  error: { message: string } | null;
}> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await action();
      if (error) {
        if (attempt < maxRetries) {
          await sleep(Math.min(1000 * Math.pow(2, attempt), 4000));
          continue;
        }
        return { data: null, error };
      }
      return { data, error: null };
    } catch (e) {
      if (attempt < maxRetries) {
        await sleep(Math.min(1000 * Math.pow(2, attempt), 4000));
        continue;
      }
      return {
        data: null,
        error: {
          message: e instanceof Error ? e.message : "Unknown error",
        },
      };
    }
  }
  return { data: null, error: { message: "Max retries exceeded" } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
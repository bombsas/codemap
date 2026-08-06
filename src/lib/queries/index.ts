/**
 * Registry mapping language ids to tree-sitter query sources.
 *
 * Language ids follow `detectLanguage()` in `src/lib/languages.ts`.
 * `tsx` files reuse the TypeScript query source (the tsx grammar is a
 * superset of typescript). The queries are plain template strings so they
 * can be compiled with `Language.query()` at runtime.
 */
import { javascriptQuery } from "./javascript";
import { typescriptQuery } from "./typescript";
import { pythonQuery } from "./python";
import { javaQuery } from "./java";
import { goQuery } from "./go";
import { cQuery } from "./c";
import { cppQuery } from "./cpp";

export const LANGUAGE_QUERIES: Record<string, string> = {
  javascript: javascriptQuery,
  typescript: typescriptQuery,
  tsx: typescriptQuery,
  python: pythonQuery,
  java: javaQuery,
  go: goQuery,
  c: cQuery,
  cpp: cppQuery,
};

/** Languages that have a bundled grammar (v1 scope from the PRD). */
export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_QUERIES);

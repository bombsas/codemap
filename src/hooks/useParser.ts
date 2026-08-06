/**
 * Tree-sitter parsing engine — WASM grammar loading, symbol extraction,
 * dependency graph building, and a React hook.
 *
 *  1. Grammar setup — singleton Parser runtime init, lazy Language cache.
 *  2. Single-file parsing — new Parser → parse → run query → extract
 *     functions, classes, calls, imports.
 *  3. Cross-file resolution — match import specifiers to parsed files,
 *     resolve function calls across the project, build edge lists.
 */
import { useCallback, useRef, useState } from "react";
import Parser from "web-tree-sitter";
import type {
  AnalysisFile,
  CallSite,
  ClassHierarchy,
  ExtractedFunction,
  FunctionKind,
  ParsedDependency,
  ParsedFile,
  ParsedProject,
} from "../types";
import { detectLanguage } from "../lib/languages";
import { LANGUAGE_QUERIES } from "../lib/queries";

/* WASM asset URLs — resolved by Vite at build time */
import wtsWasm from "web-tree-sitter/tree-sitter.wasm?url";
import jsWasm from "tree-sitter-wasms/out/tree-sitter-javascript.wasm?url";
import tsWasm from "tree-sitter-wasms/out/tree-sitter-typescript.wasm?url";
import tsxWasm from "tree-sitter-wasms/out/tree-sitter-tsx.wasm?url";
import pyWasm from "tree-sitter-wasms/out/tree-sitter-python.wasm?url";
import javaWasm from "tree-sitter-wasms/out/tree-sitter-java.wasm?url";
import goWasm from "tree-sitter-wasms/out/tree-sitter-go.wasm?url";
import cWasm from "tree-sitter-wasms/out/tree-sitter-c.wasm?url";
import cppWasm from "tree-sitter-wasms/out/tree-sitter-cpp.wasm?url";

const GRAMMAR_WASM: Record<string, string> = {
  javascript: jsWasm,
  typescript: tsWasm,
  tsx: tsxWasm,
  python: pyWasm,
  java: javaWasm,
  go: goWasm,
  c: cWasm,
  cpp: cppWasm,
};

/* ── Runtime singleton & language cache ────────────────────────────── */

let runtimeInit: Promise<void> | null = null;

async function ensureWts(): Promise<void> {
  if (!runtimeInit) {
    runtimeInit = Parser.init({
      locateFile() {
        return wtsWasm;
      },
    });
  }
  await runtimeInit;
}

const langCache = new Map<string, Parser.Language>();

async function loadLang(key: string): Promise<Parser.Language> {
  const c = langCache.get(key);
  if (c) return c;
  const url = GRAMMAR_WASM[key];
  if (!url) throw new Error(`No WASM bundle for grammar "${key}"`);
  const lang = await Parser.Language.load(url);
  langCache.set(key, lang);
  return lang;
}

/* ── Query helpers ──────────────────────────────────────────────────── */

function cap(match: Parser.QueryMatch, name: string): Parser.SyntaxNode | null {
  for (const c of match.captures) if (c.name === name) return c.node;
  return null;
}

function nLines(n: Parser.SyntaxNode): [number, number] {
  return [n.startPosition.row + 1, n.endPosition.row + 1];
}

/* ── Signature extraction helpers ─────────────────────────────────── */

/** End index of the first matched param capture, or null. */
function paramEnd(
  match: Parser.QueryMatch,
  paramNames: string[],
): number | null {
  for (const pn of paramNames) {
    const p = cap(match, pn);
    if (p) return p.endIndex;
  }
  return null;
}

/**
 * Walk a C/C++ function_declarator chain to find the leaf identifier.
 * Handles pointer/reference/parenthesized wrappers, `Foo::bar` qualified
 * names, `operator+` overloads and `~Foo` destructors.
 */
function walkCDef(
  declNode: Parser.SyntaxNode,
): { name: string; kind: "function" | "method"; paramNode: Parser.SyntaxNode | null } | null {
  const seen = new Set<number>();
  let cur: Parser.SyntaxNode | null = declNode;
  let paramNode: Parser.SyntaxNode | null = null;
  let leaf: Parser.SyntaxNode | null = null;

  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);

    // Remember the first parameter list we encounter
    if (!paramNode) {
      const pl = cur.children.find(
        (c) => c.type === "parameter_list" || c.type === "template_parameter_list",
      );
      if (pl) paramNode = pl;
    }

    // Leaf name nodes
    if (cur.type === "identifier" || cur.type === "field_identifier") {
      leaf = cur;
      break;
    }
    if (cur.type === "operator_name") {
      leaf = cur;
      break;
    }
    if (cur.type === "destructor_name") {
      leaf = cur; // text is "~Foo"
      break;
    }

    // Qualified names: Foo::bar → descend into the `name` field
    if (cur.type === "qualified_identifier") {
      cur = cur.childForFieldName("name") ?? cur.firstNamedChild;
      continue;
    }
    if (cur.type === "namespace_identifier") {
      cur = cur.firstNamedChild;
      continue;
    }

    // Generic walk into the declarator chain
    const child = cur.childForFieldName("declarator") ?? cur.firstNamedChild;
    if (child && !seen.has(child.id)) {
      cur = child;
    } else {
      break;
    }
  }

  const name = leaf?.text ?? declNode.text;
  const kind: "function" | "method" =
    leaf?.type === "field_identifier" ? "method" : "function";
  return { name, kind, paramNode };
}

function buildSignature(
  source: string,
  defNode: Parser.SyntaxNode,
  paramsEnd: number | null,
): string {
  if (paramsEnd !== null) {
    return source.slice(defNode.startIndex, paramsEnd).trim().replace(/\s+/g, " ");
  }
  // Fallback: everything until the body
  const bodyChild = defNode.children.find((c) =>
    ["statement_block", "block", "compound_statement", "field_declaration_list", "constructor_body"].includes(c.type),
  );
  if (bodyChild) {
    return source.slice(defNode.startIndex, bodyChild.startIndex).trim().replace(/\s+/g, " ");
  }
  const line = source.slice(defNode.startIndex, defNode.endIndex);
  return line.trim().replace(/\s+/g, " ").slice(0, 120);
}

function classSignature(source: string, defNode: Parser.SyntaxNode): string {
  const bodyTypes = new Set(["class_body", "field_declaration_list", "interface_body", "declaration_list"]);
  const bodyChild = defNode.children.find((c) => bodyTypes.has(c.type));
  const end = bodyChild ? bodyChild.startIndex : defNode.endIndex;
  return source.slice(defNode.startIndex, end).trim().replace(/\s+/g, " ");
}

function enclosingClassName(node: Parser.SyntaxNode): string | undefined {
  let cur: Parser.SyntaxNode | null = node.parent;
  while (cur) {
    if (["class_body", "field_declaration_list", "interface_body"].includes(cur.type)) {
      const p = cur.parent;
      if (!p) return undefined;
      const nn =
        p.childForFieldName("name") ??
        p.children.find((c) =>
          ["identifier", "type_identifier", "property_identifier"].includes(c.type),
        );
      return nn?.text ?? undefined;
    }
    cur = cur.parent;
  }
  return undefined;
}

function makeId(path: string, name: string, kind: string, line: number): string {
  return `${path}#${kind}:${name}@${line}`;
}

/* ── Function/method extractors per language family ────────────────── */

/**
 * Extract functions & methods from JS/TS/TSX/Python/Go — languages with
 * direct `@function.name` / `@method.name` captures.
 */
function extractDefFunctions(
  source: string,
  filePath: string,
  matches: Parser.QueryMatch[],
): ExtractedFunction[] {
  const out: ExtractedFunction[] = [];
  const handled = new Set<number>(); // prevent duplicate defs

  for (const m of matches) {
    const isMethod = !!cap(m, "method.name") || !!cap(m, "method.definition");
    const defName = isMethod ? "method.definition" : "function.definition";
    const nameName = isMethod ? "method.name" : "function.name";

    const defNode = cap(m, defName);
    const nameNode = cap(m, nameName);
    if (!defNode || !nameNode) continue;

    // Deduplicate: same defNode used by multiple match groups
    const key = defNode.id;
    if (handled.has(key)) continue;
    handled.add(key);

    const name = nameNode.text;
    const lines = nLines(defNode);
    const codeSnippet = source.slice(defNode.startIndex, defNode.endIndex);

    // Python has no separate method pattern — methods are function_definition
    // nodes inside class bodies. Detect them by walking the ancestors.
    let kind: FunctionKind = isMethod ? "method" : "function";
    let parentClass = isMethod ? enclosingClassName(defNode) : undefined;
    if (!isMethod) {
      const cls = enclosingClassName(defNode);
      if (cls) {
        kind = "method";
        parentClass = cls;
      }
    }
    const pEnd = paramEnd(m, ["method.params", "function.params"]);
    const signature = buildSignature(source, defNode, pEnd);
    const qualifiedName = parentClass ? `${parentClass}.${name}` : name;

    out.push({
      id: makeId(filePath, qualifiedName, kind, lines[0]),
      name,
      kind,
      signature,
      startLine: lines[0],
      endLine: lines[1],
      codeSnippet,
      calls: [],   // filled later in step 2
      imports: [], // filled later
      parentClass,
      qualifiedName,
    });
  }

  return out;
}

/**
 * Extract methods from Java (method_declaration & constructor_declaration).
 */
function extractJavaMethods(
  source: string,
  filePath: string,
  matches: Parser.QueryMatch[],
): ExtractedFunction[] {
  const out: ExtractedFunction[] = [];
  const handled = new Set<number>();

  for (const m of matches) {
    const defNode = cap(m, "method.definition");
    const nameNode = cap(m, "method.name");
    if (!defNode || !nameNode) continue;

    const key = defNode.id;
    if (handled.has(key)) continue;
    handled.add(key);

    const name = nameNode.text;
    const lines = nLines(defNode);
    const codeSnippet = source.slice(defNode.startIndex, defNode.endIndex);

    const pEnd = paramEnd(m, ["method.params"]);
    const signature = buildSignature(source, defNode, pEnd);
    const parentClass = enclosingClassName(defNode);
    const qualifiedName = parentClass ? `${parentClass}.${name}` : name;

    out.push({
      id: makeId(filePath, qualifiedName, "method", lines[0]),
      name,
      kind: "method",
      signature,
      startLine: lines[0],
      endLine: lines[1],
      codeSnippet,
      calls: [],
      imports: [],
      parentClass,
      qualifiedName,
    });
  }

  return out;
}

/**
 * Extract functions from C/C++ via declarator-walking.
 */
function extractCFamilyFunctions(
  source: string,
  filePath: string,
  matches: Parser.QueryMatch[],
): ExtractedFunction[] {
  const out: ExtractedFunction[] = [];
  const handled = new Set<number>();

  for (const m of matches) {
    const defNode = cap(m, "function.definition");
    const declNode = cap(m, "function.declarator");
    if (!defNode || !declNode) continue;

    const key = defNode.id;
    if (handled.has(key)) continue;
    handled.add(key);

    const walked = walkCDef(declNode);
    if (!walked) continue;

    const lines = nLines(defNode);
    const codeSnippet = source.slice(defNode.startIndex, defNode.endIndex);
    const pEnd = walked.paramNode ? walked.paramNode.endIndex : null;
    const signature = buildSignature(source, defNode, pEnd);
    const kind: FunctionKind = walked.kind;

    out.push({
      id: makeId(filePath, walked.name, kind, lines[0]),
      name: walked.name,
      kind,
      signature,
      startLine: lines[0],
      endLine: lines[1],
      codeSnippet,
      calls: [],
      imports: [],
      parentClass: undefined,
      qualifiedName: walked.name,
    });
  }

  return out;
}

/* ── Class extractor (all languages) ──────────────────────────────── */

/** Normalize raw superclass/interface text to a list of clean names. */
function normalizeSuper(raw: string): string[] {
  return raw
    .replace(/^\s*(extends|implements|:)\s*/i, "")
    .replace(/^\s*(public|private|protected|virtual)\s+/i, "")
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractClasses(matches: Parser.QueryMatch[]): ClassHierarchy[] {
  const out: ClassHierarchy[] = [];
  const seen = new Set<number>();

  for (const m of matches) {
    const defNode = cap(m, "class.definition");
    const nameNode = cap(m, "class.name");
    if (!defNode || !nameNode) continue;
    if (seen.has(defNode.id)) continue;
    seen.add(defNode.id);

    const ext: string[] = [];
    const impl: string[] = [];
    for (const c of m.captures) {
      if (c.name === "class.super") ext.push(...normalizeSuper(c.node.text));
      else if (c.name === "class.implements" || c.name === "class.interfaces")
        impl.push(...normalizeSuper(c.node.text));
    }

    out.push({ name: nameNode.text, extends: ext, implements: impl });
  }
  return out;
}

/* ── Call-site & import extractors ────────────────────────────────── */

function extractCalls(matches: Parser.QueryMatch[]): CallSite[] {
  const out: CallSite[] = [];

  for (const m of matches) {
    const exprNode = cap(m, "call.expression");
    const nameNode = cap(m, "call.name");
    if (!exprNode || !nameNode) continue;

    const calleeNode = cap(m, "call.callee");
    const argsNode = cap(m, "call.args");

    out.push({
      name: nameNode.text,
      callee: calleeNode ? calleeNode.text : nameNode.text,
      argCount: argsNode ? argsNode.namedChildCount : 0,
      startIndex: exprNode.startIndex,
      endIndex: exprNode.endIndex,
    });
  }

  return out;
}

/** Map `@import.source` text to a normalized module specifier. */
function normalizeImport(raw: string): string {
  let s = raw.trim();
  // Strip surrounding quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  // Strip angle brackets (C/C++ system includes)
  if (s.startsWith("<") && s.endsWith(">")) {
    s = s.slice(1, -1);
  }
  return s;
}

function extractImports(matches: Parser.QueryMatch[]): string[] {
  const mods = new Set<string>();
  for (const m of matches) {
    const node = cap(m, "import.node");
    if (!node) continue;
    const src = cap(m, "import.source");
    if (src) {
      const mod = normalizeImport(src.text);
      if (mod) mods.add(mod);
      continue;
    }
    // Plain import with no source capture (python: `import os`, `import os, sys`)
    if (node.type === "import_statement") {
      const body = node.text.replace(/^import\s+/, "");
      for (const part of body.split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) mods.add(name);
      }
    }
  }
  return [...mods];
}

/* ── Single-file parser ────────────────────────────────────────────── */

async function parseSingleFile(
  file: AnalysisFile,
): Promise<{ parsed: ParsedFile; errors: boolean }> {
  const langId = detectLanguage(file.path);
  const queryStr = LANGUAGE_QUERIES[langId];

  // Determine grammar key (tsx uses same grammar as typescript)
  const grammarKey = langId === "tsx" ? "typescript" : langId;

  await ensureWts();
  const language = await loadLang(grammarKey);
  const parser = new Parser();
  parser.setLanguage(language);

  const tree = parser.parse(file.content);
  const root = tree.rootNode;

  // Compile & run the language query
  const query = language.query(queryStr);
  const m = query.matches(root);

  // Extract symbols
  const callSites = extractCalls(m);
  const fileImports = extractImports(m);
  const classHierarchies = extractClasses(m);

  let functions: ExtractedFunction[];

  if (langId === "c" || langId === "cpp") {
    functions = extractCFamilyFunctions(file.content, file.path, m);
  } else if (langId === "java") {
    functions = extractJavaMethods(file.content, file.path, m);
  } else {
    functions = extractDefFunctions(file.content, file.path, m);
  }

  // Append class symbols (kind "class") to the unified symbol list
  const classSeen = new Set<number>();
  for (const mm of m) {
    const defNode = cap(mm, "class.definition");
    const nameNode = cap(mm, "class.name");
    if (!defNode || !nameNode || classSeen.has(defNode.id)) continue;
    classSeen.add(defNode.id);
    const lines = nLines(defNode);
    functions.push({
      id: makeId(file.path, nameNode.text, "class", lines[0]),
      name: nameNode.text,
      kind: "class",
      signature: classSignature(file.content, defNode),
      startLine: lines[0],
      endLine: lines[1],
      codeSnippet: file.content.slice(defNode.startIndex, defNode.endIndex),
      calls: [],
      imports: [],
      qualifiedName: nameNode.text,
    });
  }

  // Precompute line start offsets (once per file)
  const lineOffsets: number[] = [0];
  for (let i = 0; i < file.content.length; i++) {
    if (file.content[i] === "\n") lineOffsets.push(i + 1);
  }

  // Assign calls to each symbol based on its source range
  for (const fn of functions) {
    const start = lineOffsets[Math.min(fn.startLine - 1, lineOffsets.length - 1)];
    const end =
      fn.endLine < lineOffsets.length
        ? lineOffsets[fn.endLine] - 1
        : file.content.length;
    fn.calls = callSites
      .filter((cs) => cs.startIndex >= start && cs.endIndex <= end)
      .map((cs) => cs.name);
  }

  const hasErrors = root.hasError();

  return {
    parsed: {
      path: file.path,
      language: langId,
      content: file.content,
      functions,
      imports: fileImports,
      classHierarchy: classHierarchies,
    },
    errors: hasErrors,
  };
}

/* ── Cross-file dependency graph ───────────────────────────────────── */

const CANDIDATE_EXTS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".java", ".go", ".c", ".h", ".cpp", ".cc", ".hpp", ".cxx",
];

function tryPath(
  p: string,
  byPath: Map<string, ParsedFile>,
  files: ParsedFile[],
): string | null {
  // Exact match
  if (byPath.has(p)) return p;
  // Try extensions
  for (const ext of CANDIDATE_EXTS) {
    if (byPath.has(p + ext)) return p + ext;
  }
  // Index files
  if (byPath.has(p + "/index.ts")) return p + "/index.ts";
  if (byPath.has(p + "/index.js")) return p + "/index.js";
  if (byPath.has(p + "/index.tsx")) return p + "/index.tsx";
  if (byPath.has(p + "/index.jsx")) return p + "/index.jsx";
  // Basename fallback — match last path segment against any file
  const leaf = p.split("/").pop() ?? p;
  for (const f of files) {
    if (f.path.endsWith("/" + leaf) || f.path === leaf) return f.path;
  }
  return null;
}

function resolveImport(
  fromFile: string,
  spec: string,
  byPath: Map<string, ParsedFile>,
  files: ParsedFile[],
): string | null {
  const clean = spec.split("?")[0].split("#")[0];
  if (!clean) return null;

  if (clean.startsWith(".")) {
    // Relative
    const base = fromFile.lastIndexOf("/");
    const dir = base === -1 ? "" : fromFile.slice(0, base);
    const joined = (dir ? dir + "/" : "") + clean;
    const parts: string[] = [];
    for (const seg of joined.split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return tryPath(parts.join("/"), byPath, files);
  }

  if (clean.startsWith("/")) {
    return tryPath(clean.slice(1), byPath, files);
  }

  // Bare specifier (e.g. "utils/helpers") — try path as-is
  return tryPath(clean, byPath, files);
}

function buildDependencyGraph(files: ParsedFile[]): ParsedDependency[] {
  const edges: ParsedDependency[] = [];
  const seen = new Set<string>();
  const byPath = new Map(files.map((f) => [f.path, f]));

  // Index: function qualified name → location(s)
  const fnIndex = new Map<
    string,
    { file: ParsedFile; fn: ExtractedFunction }[]
  >();
  // Index: class name → file path(s)
  const classIndex = new Map<string, string[]>();
  for (const f of files) {
    for (const fn of f.functions) {
      if (fn.kind === "class") continue;
      const key = fn.qualifiedName ?? fn.name;
      const arr = fnIndex.get(key) ?? [];
      arr.push({ file: f, fn });
      fnIndex.set(key, arr);
    }
    for (const c of f.classHierarchy) {
      const arr = classIndex.get(c.name) ?? [];
      arr.push(f.path);
      classIndex.set(c.name, arr);
    }
  }

  const add = (e: ParsedDependency) => {
    const k = [e.type, e.sourceFile, e.targetFile, e.sourceFunction, e.targetFunction]
      .join("|");
    if (!seen.has(k)) {
      seen.add(k);
      edges.push(e);
    }
  };

  // ── Imports (file → file)
  for (const f of files) {
    for (const spec of f.imports) {
      const target = resolveImport(f.path, spec, byPath, files);
      if (target) add({ type: "imports", sourceFile: f.path, targetFile: target });
    }
  }

  // ── Inheritance (class → class)
  for (const f of files) {
    for (const c of f.classHierarchy) {
      for (const sup of c.extends) {
        const refs = classIndex.get(sup);
        if (refs?.length)
          add({
            type: "extends",
            sourceFile: f.path,
            sourceFunction: c.name,
            targetFile: refs[0],
            targetFunction: sup,
          });
      }
      for (const sup of c.implements) {
        const refs = classIndex.get(sup);
        if (refs?.length)
          add({
            type: "implements",
            sourceFile: f.path,
            sourceFunction: c.name,
            targetFile: refs[0],
            targetFunction: sup,
          });
      }
    }
  }

  // ── Calls (function → function)
  for (const f of files) {
    for (const fn of f.functions) {
      if (fn.kind === "class") continue;
      for (const callName of fn.calls) {
        const sf = fn.qualifiedName ?? fn.name;

        // Same-file match first
        const local = f.functions.find(
          (x) =>
            x.kind !== "class" &&
            x.id !== fn.id &&
            (x.name === callName || x.qualifiedName === callName),
        );
        if (local) {
          add({
            type: "calls",
            sourceFile: f.path,
            sourceFunction: sf,
            targetFile: f.path,
            targetFunction: local.qualifiedName ?? local.name,
          });
          continue;
        }

        // Cross-file match (take first)
        const refs = fnIndex.get(callName);
        if (!refs?.length) continue;
        const match = refs.find((r) => r.file.path !== f.path);
        if (match)
          add({
            type: "calls",
            sourceFile: f.path,
            sourceFunction: sf,
            targetFile: match.file.path,
            targetFunction: match.fn.qualifiedName ?? match.fn.name,
          });
      }
    }
  }

  return edges;
}

/* ── Project-level orchestrator ───────────────────────────────────── */

export async function parseProject(
  files: AnalysisFile[],
  onProgress?: (done: number, total: number, currentFile?: string) => void,
): Promise<ParsedProject> {
  const supported: AnalysisFile[] = [];
  const unsupported: string[] = [];

  for (const f of files) {
    const lang = detectLanguage(f.path);
    if (LANGUAGE_QUERIES[lang]) supported.push(f);
    else unsupported.push(f.path);
  }

  const parsedFiles: ParsedFile[] = [];
  const unparseableFiles: string[] = [];

  for (let i = 0; i < supported.length; i++) {
    try {
      const { parsed, errors } = await parseSingleFile(supported[i]);
      parsedFiles.push(parsed);
      if (errors) unparseableFiles.push(supported[i].path);
    } catch {
      unparseableFiles.push(supported[i].path);
    }
    onProgress?.(i + 1, supported.length, supported[i].path);
  }

  const dependencies = buildDependencyGraph(parsedFiles);

  return {
    files: parsedFiles,
    dependencies,
    unsupportedFiles: unsupported,
    unparseableFiles,
  };
}

/* ── React hook ────────────────────────────────────────────────────── */

export interface UseParserResult {
  status: "idle" | "parsing" | "done" | "error";
  project: ParsedProject | null;
  error: string | null;
  progress: { parsed: number; total: number; currentFile?: string };
  run: (files: AnalysisFile[]) => void;
  reset: () => void;
}

export function useParser(): UseParserResult {
  const [status, setStatus] = useState<"idle" | "parsing" | "done" | "error">("idle");
  const [project, setProject] = useState<ParsedProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ parsed: number; total: number; currentFile?: string }>({
    parsed: 0,
    total: 0,
  });
  const parseIdRef = useRef(0);

  const reset = useCallback(() => {
    parseIdRef.current += 1;
    setStatus("idle");
    setProject(null);
    setError(null);
    setProgress({ parsed: 0, total: 0 });
  }, []);

  const run = useCallback(
    async (files: AnalysisFile[]) => {
      const myId = ++parseIdRef.current;
      setStatus("parsing");
      setError(null);
      setProject(null);
      setProgress({ parsed: 0, total: files.length });
      try {
        const result = await parseProject(files, (parsed, total, currentFile) => {
          if (parseIdRef.current === myId) setProgress({ parsed, total, currentFile });
        });
        if (parseIdRef.current !== myId) return;
        setProject(result);
        setStatus("done");
      } catch (e: unknown) {
        if (parseIdRef.current !== myId) return;
        setError(e instanceof Error ? e.message : "Parsing failed unexpectedly.");
        setStatus("error");
      }
    },
    [],
  );

  return { status, project, error, progress, run, reset };
}
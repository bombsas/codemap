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
  DependencyType,
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

function caps(matches: Parser.QueryMatch[], name: string): Parser.SyntaxNode[] {
  const out: Parser.SyntaxNode[] = [];
  for (const m of matches) for (const c of m.captures) if (c.name === name) out.push(c.node);
  return out;
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

/** Walk a C/C++ function_declarator chain to find the leaf identifier. */
function walkCDef(
  declNode: Parser.SyntaxNode,
): { name: string; kind: "function" | "method"; paramNode: Parser.SyntaxNode | null } | null {
  const seen = new Set<number>();
  let cur: Parser.SyntaxNode | null = declNode;
  let paramNode: Parser.SyntaxNode | null = null;
  let leaf: Parser.SyntaxNode | null = null;

  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);

    // Capture parameter list if we hit one
    if (!paramNode) {
      const pl = cur.children.find(
        (c) =>
          c.type === "parameter_list" || c.type === "template_parameter_list",
      );
      if (pl) paramNode = pl;
    }

    // Found an identifier = leaf name
    if (cur.type === "identifier" || cur.type === "field_identifier") {
      leaf = cur;
      break;
    }

    // Walk child
    const child = cur.childForFieldName("declarator") ?? cur.firstNamedChild;
    if (child && !seen.has(child.id)) {
      cur = child;
    } else {
      // No more children — current node may be the leaf (e.g. parenthesized)
      break;
    }
  }

  // If we found identifier in function_declarator's declarator chain, it's the name
  // If we didn't, fall back to text of the declNode (e.g. operator overload)
  const name = leaf?.text ?? declNode.text;
  const kind: "function" | "method" = leaf?.type === "field_identifier" ? "method" : "function";
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

function enclosingClassName(node: Parser.SyntaxNode): string | null {
  let cur: Parser.SyntaxNode | null = node.parent;
  while (cur) {
    if (["class_body", "field_declaration_list", "interface_body"].includes(cur.type)) {
      const p = cur.parent;
      if (!p) return null;
      const nn =
        p.childForFieldName("name") ??
        p.children.find((c) =>
          ["identifier", "type_identifier", "property_identifier"].includes(c.type),
        );
      return nn?.text ?? null;
    }
    cur = cur.parent;
  }
  return null;
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
    const bodyName = isMethod ? "method.body" : "function.body";

    const defNode = cap(m, defName);
    const nameNode = cap(m, nameName);
    const bodyNode = cap(m, bodyName);
    if (!defNode || !nameNode) continue;

    // Deduplicate: same defNode used by multiple match groups
    const key = defNode.id;
    if (handled.has(key)) continue;
    handled.add(key);

    const name = nameNode.text;
    const lines = nLines(defNode);
    const codeSnippet = source.slice(defNode.startIndex, defNode.endIndex);

    const kind: FunctionKind = isMethod ? "method" : "function";
    const pEnd = paramEnd(m, ["method.params", "function.params"]);
    const signature = buildSignature(source, defNode, pEnd);
    const parentClass = isMethod ? enclosingClassName(defNode) : undefined;
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
    const bodyNode = cap(m, "method.body");
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

function extractClasses(
  source: string,
  filePath: string,
  matches: Parser.QueryMatch[],
): ClassHierarchy[] {
  const out: ClassHierarchy[] = [];
  const seen = new Set<number>();

  for (const m of matches) {
    const defNode = cap(m, "class.definition");
    const nameNode = cap(m, "class.name");
    if (!defNode || !nameNode) continue;
    if (seen.has(defNode.id)) continue;
    seen.add(defNode.id);

    const ext = caps(matches, "class.super").map((n) => n.text);
    const impl = caps(matches, "class.implements").map((n) => n.text);

    out.push({
      name: nameNode.text,
      extends: ext,
      implements: impl,
    });
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

function extractImports(
  matches: Parser.QueryMatch[],
  source: string,
): string[] {
  const sources = caps(matches, "import.source");
  const mods = new Set<string>();
  for (const n of sources) {
    const mod = normalizeImport(n.text);
    if (mod) mods.add(mod);
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
  const fileImports = extractImports(m, file.content);
  const classHierarchies = extractClasses(file.content, file.path, m);

  let functions: ExtractedFunction[];

  if (langId === "c" || langId === "cpp") {
    functions = extractCFamilyFunctions(file.content, file.path, m);
  } else if (langId === "java") {
    functions = extractJavaMethods(file.content, file.path, m);
  } else {
    functions = extractDefFunctions(file.content, file.path, m);
  }

  // Step 2: assign calls & imports to each function based on source range
  for (const fn of functions) {
    const fnStart = fn.startLine; // 1-based — convert to 0-based index
    const fnEnd = fn.endLine;
    // We use startLine/endLine as approximate range; for precision we'd
    // need the original node. Since we don't store it, approximate via
    // line ranges.
    const inRange = (cs: CallSite, start: number, end: number) =>
      cs.startIndex >= start && cs.endIndex <= end;
    // Map lines back to file.content positions
    const lines = file.content.split("\n");
    let charStart = 0;
    for (let i = 0; i < fnStart - 1; i++) charStart += lines[i].length + 1;
    let charEnd = charStart;
    for (let i = fnStart - 1; i < fnEnd && i < lines.length; i++)
      charEnd += lines[i].length + 1;

    fn.calls = callSites
      .filter((cs) => cs.startIndex >= charStart && cs.endIndex <= charEnd)
      .map((cs) => cs.name);

    fn.imports = []; // file-level imports are set on the ParsedFile
  }

  const hasErrors = root.hasError;

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

// ~~~ DEPENDENCY GRAPH ~~~
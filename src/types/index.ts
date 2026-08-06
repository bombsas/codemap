/**
 * Shared types for the code parsing engine (tree-sitter).
 * These describe the shape of parsed output consumed by the AI
 * explanation pipeline and the visualization layer.
 */

/** A single ingested source file, ready for parsing. */
export interface AnalysisFile {
  path: string;
  content: string;
  /** Language id, e.g. "javascript", "typescript", "python" — or "unsupported". */
  language: string;
}

export type FunctionKind = "function" | "method" | "class";

/** One function, method or class extracted from a parsed file. */
export interface ExtractedFunction {
  /** Stable unique id, e.g. "src/App.tsx#method:render@12". */
  id: string;
  name: string;
  kind: FunctionKind;
  /** Signature line(s), e.g. "function hello(a, b)" or "public void run()". */
  signature: string;
  /** 1-based start line in the source file. */
  startLine: number;
  /** 1-based end line in the source file. */
  endLine: number;
  /** Raw source of the definition, sent to the LLM in the explanation step. */
  codeSnippet: string;
  /** Names of callables invoked inside this function/method/class body. */
  calls: string[];
  /** Module specifiers imported inside this function (require()/import()). */
  imports: string[];
  /** For methods: name of the enclosing class. */
  parentClass?: string;
  /** Fully qualified name, e.g. "Car.drive" for methods. */
  qualifiedName?: string;
}

/** Inheritance facts for a class/interface captured during parsing. */
export interface ClassHierarchy {
  name: string;
  /** Superclass / extended interface names (from `extends`). */
  extends: string[];
  /** Implemented interface names (Java `implements`, TS `implements`). */
  implements: string[];
}

export type DependencyType = "imports" | "calls" | "extends" | "implements";

/**
 * A directed edge in the project dependency graph. Either file-level
 * (imports) or function-level (calls / inheritance).
 */
export interface ParsedDependency {
  sourceFile?: string;
  targetFile?: string;
  sourceFunction?: string;
  targetFunction?: string;
  type: DependencyType;
}

/** A parsed source file with all its extracted symbols. */
export interface ParsedFile {
  path: string;
  language: string;
  content: string;
  functions: ExtractedFunction[];
  /** File-level import/require module specifiers. */
  imports: string[];
  classHierarchy: ClassHierarchy[];
}

/** The result of parsing an entire project. */
export interface ParsedProject {
  files: ParsedFile[];
  dependencies: ParsedDependency[];
  /** Files whose extension has no grammar (rendered with a warning badge). */
  unsupportedFiles: string[];
  /** Files whose grammar loaded but the parse produced syntax errors. */
  unparseableFiles: string[];
}

/** Internal record of a single call site found by the queries. */
export interface CallSite {
  /** Leaf callable name, e.g. "drive" in "car.drive()". */
  name: string;
  /** Full callee text, e.g. "car.drive" or "this.accelerate". */
  callee: string;
  argCount: number;
  startIndex: number;
  endIndex: number;
}

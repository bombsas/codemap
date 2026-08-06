/**
 * Map file extensions to language IDs for tree-sitter parsing and syntax highlighting.
 */

const extensionToLanguage: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".d.ts": "typescript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "scala",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".html": "html",
  ".htm": "html",
  ".xml": "xml",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".md": "markdown",
  ".mdx": "markdown",
  ".sql": "sql",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".gradle": "gradle",
  ".svelte": "svelte",
  ".vue": "vue",
  ".astro": "astro",
  ".env": "dotenv",
  ".gitignore": "ignore",
  ".dockerignore": "ignore",
};

/** File extensions that are binary and should be skipped entirely. */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".avif",
  ".bmp",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".pdf",
  ".exe",
  ".dll",
  ".so",
  ".o",
  ".pyc",
  ".class",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".rar",
  ".7z",
  ".wasm",
  ".DS_Store",
]);

/** Directory prefixes that should be skipped. */
const SKIP_DIRECTORIES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".cache",
  "__pycache__",
  ".github",
  ".vscode",
  ".idea",
];

/** Patterns that hint at binary content (we skip these extensions). */
const SKIP_PATTERNS = [
  ".exe",
  ".dll",
  ".so",
  ".o",
  ".pyc",
  ".class",
  ".wasm",
  ".ico",
];

/**
 * Detect the programming language for a given file path.
 * Returns the language ID string or "unsupported" if the extension is unknown.
 */
export function detectLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return "unsupported";
  const ext = lower.slice(dot);
  return extensionToLanguage[ext] || "unsupported";
}

/**
 * Check if a file should be skipped based on its path.
 * Returns true for binary files and files in skipped directories.
 */
export function shouldSkipFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();

  // Check directory skip patterns
  for (const dir of SKIP_DIRECTORIES) {
    if (lower.includes(`/${dir}/`) || lower.startsWith(`${dir}/`) || lower === dir) {
      return true;
    }
  }

  // Check binary extensions
  const dot = lower.lastIndexOf(".");
  if (dot !== -1) {
    const ext = lower.slice(dot);
    if (BINARY_EXTENSIONS.has(ext)) return true;
  }

  // Check skip patterns
  for (const pattern of SKIP_PATTERNS) {
    if (lower.includes(pattern)) return true;
  }

  return false;
}

/**
 * Check if a file has a supported language (not "unsupported").
 */
export function isLanguageSupported(filePath: string): boolean {
  return detectLanguage(filePath) !== "unsupported";
}
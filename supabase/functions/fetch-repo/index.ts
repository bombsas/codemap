import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Text file extensions we want to include
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
  ".py", ".java", ".go", ".c", ".cpp", ".h", ".hpp",
  ".rs", ".rb", ".php", ".swift", ".kt", ".kts", ".scala",
  ".css", ".scss", ".sass", ".less", ".styl",
  ".html", ".htm", ".xml", ".json", ".yaml", ".yml", ".toml",
  ".md", ".mdx", ".txt", ".csv", ".env", ".gitignore",
  ".sql", ".graphql", ".gql", ".proto", ".gradle", ".svelte", ".vue",
  ".astro", ".liquid", ".sh", ".bash", ".zsh", ".fish",
  ".config", ".d.ts",
]);

// Patterns to skip entirely (case-insensitive substring match)
const SKIP_PATTERNS = [
  "node_modules",
  ".git",
  ".github",
  "dist",
  ".next",
  ".nuxt",
  "build",
  ".cache",
  "__pycache__",
  ".DS_Store",
  ".exe",
  ".dll",
  ".o",
  ".pyc",
  ".wasm",
  ".ico",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mp3",
  ".wav",
  ".ogg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  // Lockfiles & generated bloat
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "bun.lockb",
  "gemfile.lock",
  "poetry.lock",
  "composer.lock",
  ".min.js",
  ".min.css",
  ".bundle.js",
  "vendor/",
];

const MAX_FILE_SIZE_BYTES = 300 * 1024; // 300 KB per file
const MAX_FILES = 300;
const MAX_CONCURRENT_FETCHES = 15;

function shouldSkip(path: string): boolean {
  const lower = path.toLowerCase();
  for (const pattern of SKIP_PATTERNS) {
    if (lower.includes(pattern)) return true;
  }
  return false;
}

function isTextFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return true;
  const ext = path.slice(dot).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  let clean = url.trim();
  if (clean.endsWith(".git")) clean = clean.slice(0, -4);
  if (clean.endsWith("/")) clean = clean.slice(0, -1);

  const patterns = [
    /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/.*)?$/,
    /^git@github\.com:([^\/]+)\/([^\/]+)(?:\.git)?$/,
  ];

  for (const p of patterns) {
    const m = clean.match(p);
    if (m) return { owner: m[1], repo: m[2] };
  }
  return null;
}

interface TreeItem {
  path: string;
  type: "blob" | "tree";
}

/**
 * Fetch repo files via GitHub Trees API + raw.githubusercontent.com.
 * Avoids the CPU-heavy zipball unzip that hit the 2s CPU limit.
 */
async function fetchRepoFiles(
  owner: string,
  repo: string,
  ref: string,
  githubToken: string | undefined,
): Promise<{ files: Array<{ path: string; content: string }>; truncated: boolean }> {
  const authHeaders: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "codemap-edge-function",
  };
  if (githubToken) {
    authHeaders["Authorization"] = `Bearer ${githubToken}`;
  }

  // ── Step 1: Check repo size ───────────────────────────────────────────
  const repoRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    { headers: authHeaders },
  );

  if (!repoRes.ok) {
    const status = repoRes.status;
    if (status === 404) throw new Error("Repository not found");
    if (status === 403) throw new Error("GitHub API rate limit exceeded");
    throw new Error(`GitHub API error: ${status}`);
  }

  const repoData = await repoRes.json() as { size?: number };
  if (repoData.size && repoData.size > 120_000) {
    throw new Error(
      `Repository is too large (~${(repoData.size / 1024).toFixed(1)}MB). ` +
      "Try a smaller repo or specify a subdirectory.",
    );
  }

  // ── Step 2: Get recursive file tree ───────────────────────────────────
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
    { headers: authHeaders },
  );

  if (!treeRes.ok) {
    const status = treeRes.status;
    if (status === 404) throw new Error(`Branch/ref "${ref}" not found`);
    if (status === 403) throw new Error("GitHub API rate limit exceeded");
    throw new Error(`GitHub Trees API error: ${status}`);
  }

  const treeBody = await treeRes.json() as { tree?: TreeItem[] };
  if (!Array.isArray(treeBody.tree)) {
    throw new Error("Unexpected tree response format");
  }

  // ── Step 3: Filter to text files we can analyze ───────────────────────
  const candidates = treeBody.tree
    .filter((item) => item.type === "blob")
    .filter((item) => !shouldSkip(item.path))
    .filter((item) => isTextFile(item.path))
    .slice(0, MAX_FILES);

  if (candidates.length === 0) {
    throw new Error("No analyzable files found in the repository");
  }

  const truncated = treeBody.tree.length > candidates.length;

  // ── Step 4: Fetch file contents in parallel batches ───────────────────
  const rawHost = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}`;
  const results: Array<{ path: string; content: string }> = [];

  for (let i = 0; i < candidates.length; i += MAX_CONCURRENT_FETCHES) {
    const batch = candidates.slice(i, i + MAX_CONCURRENT_FETCHES);

    const fetched = await Promise.allSettled(
      batch.map(async (item) => {
        const url = `${rawHost}/${item.path}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;
        const text = await res.text();
        if (text.length > MAX_FILE_SIZE_BYTES) return null;
        return { path: item.path, content: text };
      }),
    );

    for (const result of fetched) {
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
      }
    }
  }

  return { files: results, truncated };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { repoUrl, branch } = await req.json();
    if (!repoUrl || typeof repoUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "repoUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return new Response(
        JSON.stringify({ error: "Invalid GitHub URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await fetchRepoFiles(parsed.owner, parsed.repo, branch || "HEAD", Deno.env.get("GITHUB_TOKEN"));

    return new Response(
      JSON.stringify({ files: result.files, truncated: result.truncated }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("fetch-repo error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
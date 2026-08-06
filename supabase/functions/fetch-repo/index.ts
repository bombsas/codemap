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

// Extensions/filenames to skip entirely
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
];

function shouldSkip(path: string): boolean {
  const lower = path.toLowerCase();
  for (const pattern of SKIP_PATTERNS) {
    if (lower.includes(pattern)) return true;
  }
  return false;
}

function isTextFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return true; // no extension, include
  const ext = path.slice(dot).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Normalize: strip trailing .git, trailing slash
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

// Extract the top-level folder name from the zip entries
function findTopFolder(entries: string[]): string | null {
  for (const entry of entries) {
    const parts = entry.split("/");
    if (parts.length > 1) {
      return parts[0];
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify JWT
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

    const { owner, repo } = parsed;
    const ref = branch || "HEAD";
    const downloadUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${ref}`;

    const githubToken = Deno.env.get("GITHUB_TOKEN");

    // Build headers — use token if available, otherwise call unauthenticated
    // (public repos work without a token, just with stricter rate limits)
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "codemap-edge-function",
    };
    if (githubToken) {
      headers["Authorization"] = `Bearer ${githubToken}`;
    }

    // Fetch the zipball from GitHub
    const zipResponse = await fetch(downloadUrl, { headers, redirect: "follow" });

    if (!zipResponse.ok) {
      const msg =
        zipResponse.status === 401
          ? "GitHub token is invalid or expired"
          : zipResponse.status === 403 && !githubToken
          ? "GitHub API rate limit exceeded. Try adding a GITHUB_TOKEN secret for higher limits."
          : zipResponse.status === 404
          ? "Repository not found"
          : "Failed to fetch repository";
      return new Response(
        JSON.stringify({
          error: `GitHub API error: ${zipResponse.status}`,
          message: msg,
        }),
        { status: zipResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const zipBuffer = await zipResponse.arrayBuffer();
    const zipBytes = new Uint8Array(zipBuffer);

    // Use fflate to unzip
    // We import fflate from npm
    const { unzipSync, decompressSync } = await import("npm:fflate@0.8.2");

    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(zipBytes);
    } catch {
      // Try gzip fallback
      try {
        const decompressed = decompressSync(zipBytes);
        unzipped = unzipSync(decompressed);
      } catch {
        return new Response(
          JSON.stringify({ error: "Failed to decompress repository archive" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Determine the top folder to strip from paths
    const entryPaths = Object.keys(unzipped);
    const topFolder = findTopFolder(entryPaths);

    const MAX_FILE_SIZE = 500 * 1024; // 500KB
    const files: Array<{ path: string; content: string }> = [];

    for (const rawPath of entryPaths) {
      const bytes = unzipped[rawPath];
      // Skip directories (fflate may include zero-length entries for dirs)
      if (bytes.length === 0 && rawPath.endsWith("/")) continue;

      // Strip the top folder from the path
      let relativePath = rawPath;
      if (topFolder && rawPath.startsWith(topFolder + "/")) {
        relativePath = rawPath.slice(topFolder.length + 1);
      } else if (topFolder && rawPath === topFolder) {
        continue; // skip the root folder entry itself
      }

      // Skip empty paths and hidden files
      if (!relativePath || relativePath.startsWith(".")) continue;

      // Check if we should skip this file
      if (shouldSkip(relativePath)) continue;

      // Check if it's a text file
      if (!isTextFile(relativePath)) continue;

      // Check file size
      if (bytes.length > MAX_FILE_SIZE) continue;

      // Decode to text
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const content = decoder.decode(bytes);

      files.push({ path: relativePath, content });
    }

    return new Response(
      JSON.stringify({ files }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
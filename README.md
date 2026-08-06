# CodeMap 🗺️

**Understand any codebase in minutes.**

CodeMap is a web application that helps developers understand large and unfamiliar codebases through interactive visualizations. Upload a GitHub repository, ZIP archive, or paste individual files — CodeMap parses every function and class using tree-sitter AST analysis, generates AI-powered explanations of each component, and renders the result as an interactive graph you can explore.

---

## Features

- **Three visualization modes** — Block view (expandable function cards), Dependency graph (edge-focused layout), and Mind-map (radial/hierarchical overview)
- **Multi-language support** — JavaScript, TypeScript, Python, Java, Go, C, and C++
- **AI-powered explanations** — Each function gets a plain-English breakdown of its purpose, inputs, outputs, and internal logic (powered by OpenAI)
- **Multiple input methods** — GitHub repository URL, ZIP file upload, or paste files directly
- **Persistent analyses** — Save results to your account and revisit them anytime
- **Detail inspector** — Click any node to see full source code, callers, and callees

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 |
| **Routing** | React Router v7 |
| **State** | Zustand |
| **Visualization** | React Flow (`@xyflow/react`), dagre, elkjs |
| **Code Parsing** | web-tree-sitter, tree-sitter-wasms |
| **Authentication** | Supabase Auth (email/password) |
| **Database** | Supabase PostgreSQL (with Row-Level Security) |
| **Edge Functions** | Supabase Edge Functions (Deno) |
| **AI** | OpenAI (GPT-4o-mini) via `explain-code` Edge Function |
| **GitHub Integration** | GitHub API via `fetch-repo` Edge Function |
| **Icons** | Lucide React + react-icons |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project (for authentication, database, and edge functions)
- OpenAI API key (for AI explanations)
- (Optional) GitHub personal access token (for private repo imports)

### Installation

```bash
npm install
```

### Environment / Secrets

CodeMap uses **Supabase Edge Function secrets** — never `.env` files. Configure these in the [Supabase dashboard](https://supabase.com/dashboard/project/_/settings/functions):

| Secret | Required | Purpose |
|--------|----------|---------|
| `OPENAI_API_KEY` | ✅ Yes | AI-powered code explanations |
| `GITHUB_TOKEN` | ❌ Optional | Access private GitHub repositories |

### Local Development

```bash
npm run dev
```

This starts the Vite dev server (typically at `http://localhost:5173`).

### Build for Production

```bash
npm run build
```

Output goes to the `dist/` directory.

---

## Project Structure

```
src/
├── components/
│   ├── layout/           — Header, AuthGuard, PageLayout
│   ├── analysis/         — ZipUpload, GitHubForm, PasteFiles, ProgressStepper
│   ├── visualization/    — GraphCanvas, BlockNode, DepEdge, MindMapNode, ViewToggle
│   └── inspector/        — DetailPanel, SourceCodeView
├── hooks/
│   ├── useParser.ts      — tree-sitter WASM parsing integration
│   ├── useExplanation.ts — Batching and calling explain-code edge function
│   ├── useGraphLayout.ts — dagre/elkjs layout computation
│   ├── useLoadAnalysis.ts — Load saved analyses from Supabase
│   └── useSaveAnalysis.ts — Persist analysis results to Supabase
├── lib/
│   ├── supabase.ts       — Supabase client configuration
│   ├── languages.ts      — Language detection helpers
│   ├── database.types.ts — Generated TypeScript types for DB schema
│   └── queries/          — tree-sitter .scm query files (one per language)
├── store/
│   └── visualizationStore.ts — Zustand store for visualization state
├── pages/
│   ├── LandingPage.tsx   — Marketing / landing page
│   ├── LoginPage.tsx     — Sign-in form
│   ├── RegisterPage.tsx  — Sign-up form
│   ├── DashboardPage.tsx — Saved analyses list
│   ├── NewAnalysisPage.tsx — Create a new analysis (input methods)
│   └── AnalysisView.tsx  — The main visualization view
├── types/
│   ├── index.ts          — Shared types (language, node, edge, etc.)
│   └── analysis.ts       — Analysis-specific types
├── App.tsx               — Router configuration
├── main.tsx              — Entry point
└── index.css             — Tailwind imports + design tokens

supabase/functions/
├── fetch-repo/           — Edge function: fetch GitHub repo zipball → files
└── explain-code/         — Edge function: batch AI explanation generation
```

---

## How It Works

1. **Input** — Choose one of three methods: paste a GitHub URL (public or private with token), upload a ZIP archive, or paste individual source files.
2. **Parsing** — The browser loads the appropriate tree-sitter WASM grammar for each detected language and builds an AST. Queries extract every function, class, import, and call expression.
3. **Dependency graph** — Imports and function calls are linked to build a dependency graph of the codebase.
4. **AI explanations** — Function snippets are batched (10–15 per request) and sent to the `explain-code` Supabase Edge Function, which calls OpenAI's structured output API. Results include purpose, inputs, outputs, and logic summaries.
5. **Visualization** — The analysis renders in three interactive modes powered by React Flow:
   - **Block view**: card-sized function nodes grouped by file, with expandable details
   - **Dependency graph**: edge-focused view using dagre layered layout
   - **Mind-map**: radial/hierarchical overview using elkjs
6. **Persistence** — Results are saved to Supabase PostgreSQL (projects, files, functions, dependencies tables) under the authenticated user's scope, protected by Row-Level Security.
7. **Exploration** — Click any node to open the detail panel with full source code, explanation, callers, and callees.

---

## Timeline of Work

### Phase 1 — Project Foundation ✅
- Initialized Vite + React + TypeScript project
- Established design system (dark code theme, Share Tech Mono + Fira Code typography)
- Configured Tailwind CSS v4 with custom design tokens

### Phase 2 — Supabase Backend ✅
- Linked Supabase project (`rqvfqtyuqfjarluydskr`)
- Created database schema (profiles, projects, files, functions, dependencies tables)
- Applied Row-Level Security policies
- Configured Supabase Auth (email/password)
- Registered auth redirect URLs for preview environments

### Phase 3 — Auth, Routing & Dashboard ✅
- Built Login, Register, and Landing pages
- Created AuthGuard component for protected routes
- Built Dashboard page with saved analyses list
- Set up React Router with session persistence

### Phase 4 — Tree-Sitter Parsing Engine ✅
- Installed web-tree-sitter and tree-sitter-wasms
- Authored `.scm` query files for all 7 languages (JS, TS, Python, Java, Go, C, C++)
- Built `useParser` hook for client-side AST analysis
- Extracted functions, classes, calls, and imports from parsed ASTs

### Phase 5 — Code Ingestion UI ✅
- Built GitHub URL input form (calls `fetch-repo` Edge Function)
- Built ZIP upload component with drag-and-drop (client-side unzip via fflate)
- Built paste-files component for manual entry
- Added ProgressStepper with 4-step status indicator
- Created NewAnalysisPage orchestrating all input methods

### Phase 6 — Edge Functions ✅
- **`fetch-repo`** — Deno Edge Function that fetches GitHub zipball, unzips with fflate, returns file list. Secured with `GITHUB_TOKEN`.
- **`explain-code`** — Deno Edge Function that batches 10–15 function snippets, calls OpenAI (GPT-4o-mini) with `response_format: json_schema`, returns structured explanations. Authenticated via Supabase JWT.
- Both functions handle CORS preflight and include proper error responses.

### Phase 7 — Visualization Layer ✅
- Built GraphCanvas using React Flow with three view modes
- Created BlockNode component (expandable function cards)
- Created DepEdge component (dependency edges with type labels)
- Created MindMapNode component (radial layout)
- Created ViewToggle for switching between modes
- Integrated dagre for layered graph layout and elkjs for radial/hierarchical layout
- Built DetailPanel and SourceCodeView inspector components

### Phase 8 — AI Explanation Pipeline ✅
- Built `useExplanation` hook for batching function snippets
- Calls `explain-code` Edge Function with structured error handling
- Manages per-function state (pending → explained / failed with retry)
- Integrated with Zustand visualization store

### Phase 9 — Analysis Persistence ✅
- Built `useSaveAnalysis` hook — persists files, functions, and dependencies to Supabase
- Built `useLoadAnalysis` hook — loads saved analyses into the store
- Dashboard fetches and displays user's saved projects
- Full end-to-end flow: analyze → save → revisit

### Remaining / Future Work
- Monorepo workspace splitting and sub-package detection
- LSP-level semantic resolution across file boundaries
- Additional language support beyond the v1 set
- Collaborative analysis sharing
- Incremental re-analysis on code changes
- Self-hosting and custom domain support
- Private repo GitHub token configuration UI (Settings page)

---

## License

MIT
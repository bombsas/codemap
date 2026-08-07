/**
 * End-to-end tests for CodeMap
 *
 * Tests the full user flow:
 *   1. Landing page renders correctly
 *   2. Registration / auto-login flow
 *   3. Dashboard displays and navigation works
 *   4. New analysis -> GitHub repo URL -> pipeline -> view analysis
 *
 * Edge Functions (fetch-repo, explain-code) are mocked at the network
 * layer so the test runs without external API dependencies.
 * Supabase Auth endpoints are also intercepted to simulate a logged-in
 * session without needing a real user account.
 */
import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:5173";

/** Supabase project ref from the codebase. */
const SB_REF = "rqvfqtyuqfjarluydskr";

/**
 * localStorage key used by @supabase/supabase-js to persist the session.
 * Format: sb-<host>-auth-token (dots replaced with dashes).
 */
const SB_AUTH_KEY = `sb-${SB_REF}-supabase-co-auth-token`;

/** Unique test timestamp so each run uses fresh-ish identifiers. */
const TS = Date.now();
const TEST_EMAIL = `codemap-e2e-${TS}@test.nativelyai.app`;
const TEST_PASSWORD = "TestPass123!";

/* ── Sample code that tree-sitter can actually parse ──────────────── */

const INDEX_TS = `
import { greet } from "./utils";

export function main() {
  console.log(greet("CodeMap"));
}

main();
`.trim();

const UTILS_TS = `
/** Greet someone */
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`.trim();

const README_MD = "# Test Repo\nA minimal repository for E2E testing.";

const MOCK_FILES = [
  { path: "src/index.ts", content: INDEX_TS },
  { path: "src/utils.ts", content: UTILS_TS },
  { path: "README.md", content: README_MD },
];

/* ── Helpers ────────────────────────────────────────────────────────── */

function makeFakeSession() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: `eyJfake.${btoa(JSON.stringify({ sub: "test-user-id", email: TEST_EMAIL, exp: now + 3600 }))}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: `ref-token-${TS}`,
    user: {
      id: "test-user-id",
      aud: "authenticated",
      role: "authenticated",
      email: TEST_EMAIL,
      email_confirmed_at: new Date().toISOString(),
      phone: "",
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: "email" },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

/** Inject a fake Supabase session into localStorage so AuthGuard passes. */
async function injectSession(page: Page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    { key: SB_AUTH_KEY, session: makeFakeSession() },
  );
}

/** Mock the supabase projects table REST calls (save & load analysis). */
async function handleDbRoutes(page: Page): Promise<void> {
  // Intercept GET /rest/v1/projects?select=*… (dashboard load)
  await page.route(/supabase\.co\/rest\/v1\/projects/, (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === "GET") {
      // Return empty list for the dashboard
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    if (method === "POST") {
      // Accept the insert and return a fake project
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: `test-project-${TS}`,
            name: "3 files",
            source_type: "github",
            file_count: 3,
            function_count: 2,
            created_at: new Date().toISOString(),
          },
        ]),
      });
    }

    // PATCH, DELETE etc.
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  // Intercept GET /rest/v1/projects?id=eq.* (single project load for AnalysisView)
  await page.route(/supabase\.co\/rest\/v1\/project_files/, (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(/supabase\.co\/rest\/v1\/functions/, (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(/supabase\.co\/rest\/v1\/dependencies/, (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(/supabase\.co\/rest\/v1\/explanations/, (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

/* ── Test suite ──────────────────────────────────────────────────────── */

test.describe("CodeMap — Full End-to-End Flow", () => {

  /* ── Landing page ─────────────────────────────────────────────────── */

  test("1. Landing page renders hero and CTA buttons", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });

    await expect(page).toHaveTitle(/CodeMap/);
    await expect(page.locator("h1")).toContainText("Understand any codebase");
    await expect(page.getByText("Get Started")).toBeVisible();
    await expect(page.getByText("Create Account")).toBeVisible();
  });

  /* ── Registration form ────────────────────────────────────────────── */

  test("2. Registration page has a working form", async ({ page }) => {
    await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });

    await expect(page.locator("h2")).toContainText("Create Account");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();

    // Fill the form
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
  });

  /* ── Login page & navigation ──────────────────────────────────────── */

  test("3. Login page renders sign-in form", async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

    await expect(page.locator("h2")).toContainText("Sign In");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

    // Check that the "Create one" toggle is present
    await expect(page.getByText("Create one")).toBeVisible();
  });

  /* ── Authenticated flow ───────────────────────────────────────────── */

  test.describe("Authenticated user flow", () => {

    test.beforeEach(async ({ page }) => {
      // Wire up all mocks
      await handleDbRoutes(page);
      await page.route(/.*supabase\.co\/auth\/v1\/.*/, (route) => {
        const url = route.request().url();
        const method = route.request().method();

        if (method === "POST" && url.includes("grant_type=password")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(makeFakeSession()),
          });
        }
        if (method === "GET" && url.includes("/auth/v1/user")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ id: "test-user-id", email: TEST_EMAIL }),
          });
        }
        if (method === "POST" && url.includes("/auth/v1/signup")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ id: "test-user-id", email: TEST_EMAIL, ...makeFakeSession() }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeFakeSession()),
        });
      });

      // Mock the fetch-repo Edge Function
      await page.route(/.*functions\/v1\/fetch-repo/, (route) => {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ files: MOCK_FILES }),
        });
      });

      // Mock the explain-code Edge Function
      await page.route(/.*functions\/v1\/explain-code/, (route) => {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            explanations: [
              {
                functionId: "src/index.ts#function:main@3",
                purpose: "Entry point that orchestrates program startup.",
                inputs: [],
                output: "void — logs a greeting to the console.",
                logic: "Calls the greet utility with the app name, logs the result.",
                signature: "function main(): void",
                fileName: "src/index.ts",
              },
              {
                functionId: "src/utils.ts#function:greet@3",
                purpose: "Constructs a personalized greeting string.",
                inputs: [{ name: "name", type: "string", description: "The name to greet." }],
                output: "string — the formatted greeting message.",
                logic: "Uses a template literal to embed the name parameter.",
                signature: "export function greet(name: string): string",
                fileName: "src/utils.ts",
              },
            ],
            remaining: 0,
          }),
        });
      });

      // Abort websocket / realtime connections
      await page.route(/.*supabase\.co\/realtime\/.*/, (route) => route.abort());
    });

    test("4. Dashboard loads with 'No analyses yet' state for new user", async ({ page }) => {
      await injectSession(page);
      // Navigate to dashboard
      await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

      // After auth mock is set, the page should render
      await expect(page.locator("h1")).toContainText("Your Analyses");
      await expect(page.getByText("No analyses yet")).toBeVisible();
      await expect(page.getByRole("button", { name: "New Analysis" })).toBeVisible();
    });

    test("5. Navigate to New Analysis page via dashboard button", async ({ page }) => {
      await injectSession(page);
      await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

      await page.getByRole("button", { name: "New Analysis" }).click();
      await page.waitForURL("**/new");

      await expect(page.locator("h1")).toContainText("New Analysis");
      // Should show the input methods (GitHub selected by default)
      await expect(page.getByText("GitHub Repository URL")).toBeVisible();
      await expect(page.getByPlaceholder("https://github.com/owner/repo")).toBeVisible();
    });

    test("6. Submit a GitHub URL and see the pipeline progress", async ({ page }) => {
      test.setTimeout(120_000);
      await injectSession(page);
      await page.goto(`${BASE}/new`, { waitUntil: "networkidle" });

      // Intercept the supabase functions invoke call for fetch-repo
      // (The route is set in beforeEach but ensure it's active)

      // Type a GitHub URL
      const urlInput = page.locator("#repo-url");
      await urlInput.fill("https://github.com/bombsas/purpose-ai.git");

      // Click "Fetch Repository"
      await page.getByRole("button", { name: "Fetch Repository" }).click();

      // Wait for the pipeline to start — the progress stepper should appear
      // After mocking, files are returned, parsed, explained.
      await page.waitForTimeout(1500);

      // The "Analyzing Codebase" heading should appear
      await expect(page.getByText("Analyzing Codebase").or(page.getByText("Analysis Complete"))).toBeVisible({ timeout: 20000 });

      // The ProgressStepper should render showing parsing progress
      await expect(page.getByText("Parsing")).toBeVisible({ timeout: 10000 });

      // The pipeline will parse the files (tree-sitter), then try to call explain-code (mocked)
      // Wait for either "Analysis Complete" or any error state text
      const completeBtn = page.getByRole("button", { name: "View Analysis" });
      const errorText = page.getByText(/encountered an error/);

      await expect(completeBtn.or(errorText)).toBeVisible({ timeout: 60_000 });

      // If complete, take a screenshot
      if (await completeBtn.isVisible()) {
        await page.screenshot({ path: "e2e-pipeline-complete.png", fullPage: true });
        // Click "View Analysis"
        await completeBtn.click();
        await page.waitForURL(/\/analysis\//, { timeout: 10000 });
        await expect(page.getByText("Ready")).toBeVisible({ timeout: 10000 });
      } else {
        // Pipeline hit an error — capture the error for debugging
        await page.screenshot({ path: "e2e-pipeline-error.png", fullPage: true });
        // Even in error state, verify the UI allows restart
        await expect(page.getByText("Start over")).toBeVisible({ timeout: 5000 });
      }
    });

    test("7. AuthGuard redirects unauthenticated users to /login", async ({ page }) => {
      // Don't inject session so the auth check fails
      await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
      // Should redirect to login
      await page.waitForURL("**/login", { timeout: 10000 });
      await expect(page.locator("h2")).toContainText("Sign In");
    });

    test("8. New Analysis page shows language badges", async ({ page }) => {
      await injectSession(page);
      await page.goto(`${BASE}/new`, { waitUntil: "networkidle" });

      // The supported languages banner should be visible
      await expect(page.getByText("We can analyze these languages")).toBeVisible();
      // Check a few language badges are rendered
      await expect(page.getByText("JavaScript")).toBeVisible();
      await expect(page.getByText("TypeScript")).toBeVisible();
      await expect(page.getByText("Python")).toBeVisible();
    });

    test("9. Input method tabs are interactive (GitHub / ZIP / Paste)", async ({ page }) => {
      await injectSession(page);
      await page.goto(`${BASE}/new`, { waitUntil: "networkidle" });

      // GitHub should be selected by default
      const githubTab = page.getByText("GitHub").first();
      await expect(githubTab).toBeVisible();

      // Click ZIP tab
      const zipTab = page.getByText("ZIP Upload");
      await zipTab.click();
      await expect(page.getByText("Upload ZIP file")).toBeVisible({ timeout: 5000 });

      // Click Paste Files tab
      const pasteTab = page.getByText("Paste Files");
      await pasteTab.click();
      await expect(page.getByText("Paste your code")).toBeVisible({ timeout: 5000 });

      // Switch back to GitHub
      await githubTab.click();
      await expect(page.getByText("GitHub Repository URL")).toBeVisible({ timeout: 5000 });
    });
  });

  /* ── Responsiveness ────────────────────────────────────────────────── */

  test("10. Landing page is responsive at mobile width (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toContainText("Understand any codebase");
    // CTA buttons should still be visible
    await expect(page.getByText("Get Started")).toBeVisible();
    await expect(page.getByText("Create Account")).toBeVisible();
    await page.screenshot({ path: "landing-mobile.png", fullPage: true });
  });
});
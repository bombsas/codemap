import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import PageLayout from "../components/layout/PageLayout";
import { Eye, EyeOff, Save, AlertCircle, CheckCircle2 } from "lucide-react";

type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];

export default function ProfilePage() {
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  // Settings state
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Form fields
  const [openaiKey, setOpenaiKey] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGithub, setShowGithub] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Fetch user and settings on mount
  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) setUserEmail(user.email);

      if (user) {
        const { data } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          setSettings(data);
          // Don't pre-fill key values — let user type them
        }
      }

      setLoadingSettings(false);
    };
    init();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Build the payload — only include non-empty values
      const payload: Database["public"]["Tables"]["user_settings"]["Insert"] = {
        user_id: user.id,
      };
      if (openaiKey.trim()) payload.openai_api_key = openaiKey.trim();
      if (githubToken.trim()) payload.github_token = githubToken.trim();

      if (settings) {
        // Update existing
        const { error } = await supabase
          .from("user_settings")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("user_settings")
          .insert(payload);

        if (error) throw error;
      }

      // Refresh local state
      const { data: fresh } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fresh) setSettings(fresh);

      setSaveMsg({
        type: "success",
        text: "Settings saved successfully",
      });

      // Clear fields after save
      setOpenaiKey("");
      setGithubToken("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setSaveMsg({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  };

  const hasOpenaiKey = !!settings?.openai_api_key;
  const hasGithubToken = !!settings?.github_token;

  return (
    <PageLayout userEmail={userEmail}>
      <div className="max-w-lg mx-auto">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="font-heading text-2xl text-foreground tracking-wide">
            Profile Settings
          </h1>
          <p className="text-sm text-muted mt-1">
            Provide your own API keys to use your own quota instead of the
            shared account keys.
          </p>
        </div>

        {loadingSettings ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 rounded border-2 border-accent/30 border-t-accent animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* ── OpenAI API Key ───────────────────────────────────────── */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="openai-key"
                  className="font-heading text-sm text-foreground tracking-wide"
                >
                  OpenAI API Key
                </label>
                {hasOpenaiKey && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    Saved
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted mb-3">
                Used for AI code explanations. Your key is stored securely and
                only visible to you.
              </p>
              <div className="relative">
                <input
                  id="openai-key"
                  type={showOpenai ? "text" : "password"}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder={
                    hasOpenaiKey
                      ? "Leave blank to keep existing key"
                      : "sk-…"
                  }
                  className="w-full bg-background border border-border rounded-md px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenai(!showOpenai)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors duration-150 cursor-pointer"
                  aria-label={showOpenai ? "Hide key" : "Show key"}
                >
                  {showOpenai ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* ── GitHub Token ─────────────────────────────────────────── */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="github-token"
                  className="font-heading text-sm text-foreground tracking-wide"
                >
                  GitHub Personal Access Token
                </label>
                {hasGithubToken && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    Saved
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted mb-3">
                Used to fetch private repositories and increase API rate limits.
                Needs <code className="text-accent text-[10px]">repo</code> scope for
                private repos.
              </p>
              <div className="relative">
                <input
                  id="github-token"
                  type={showGithub ? "text" : "password"}
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder={
                    hasGithubToken
                      ? "Leave blank to keep existing token"
                      : "ghp_…"
                  }
                  className="w-full bg-background border border-border rounded-md px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowGithub(!showGithub)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors duration-150 cursor-pointer"
                  aria-label={showGithub ? "Hide token" : "Show token"}
                >
                  {showGithub ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* ── Save section ─────────────────────────────────────────── */}
            <div className="flex flex-col items-end gap-3">
              {saveMsg && (
                <div
                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md border ${
                    saveMsg.type === "success"
                      ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                      : "text-destructive border-destructive/20 bg-destructive/5"
                  }`}
                >
                  {saveMsg.type === "success" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  {saveMsg.text}
                </div>
              )}
              <button
                onClick={handleSave}
                disabled={saving || (!openaiKey.trim() && !githubToken.trim())}
                className="inline-flex items-center gap-2 bg-primary text-on-primary rounded-md px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 rounded border-2 border-on-primary/30 border-t-on-primary animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Settings
                  </>
                )}
              </button>
              <p className="text-[10px] text-muted/50 text-right">
                Keys are sent to our server and stored in your personal
                settings. They are only used when you run an analysis.
              </p>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
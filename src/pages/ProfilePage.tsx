import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import PageLayout from "../components/layout/PageLayout";
import {
  Eye,
  EyeOff,
  Save,
  AlertCircle,
  CheckCircle2,
  User,
  Mail,
  Lock,
} from "lucide-react";

type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  // ── Profile state ──────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // ── Password state ─────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [reauthSent, setReauthSent] = useState(false);

  // ── Settings state (existing) ──────────────────────────────────────────────
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [openaiKey, setOpenaiKey] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGithub, setShowGithub] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // ── Fetch user, profile, and settings on mount ─────────────────────────────
  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoadingSettings(false);
        setProfileLoading(false);
        return;
      }

      setUserId(user.id);
      if (user.email) setUserEmail(user.email);

      // Load profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.display_name) {
        setDisplayName(profile.display_name);
      }
      setProfileLoading(false);

      // Load settings
      const { data: settingsData } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (settingsData) {
        setSettings(settingsData);
      }
      setLoadingSettings(false);
    };
    init();
  }, []);

  // ── Save profile (display name) ────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!userId) return;
    setProfileSaving(true);
    setProfileMsg(null);

    try {
      const trimmed = displayName.trim();

      const { error } = await supabase.from("profiles").upsert(
        {
          id: userId,
          display_name: trimmed || null,
        },
        { onConflict: "id" }
      );

      if (error) throw error;

      setProfileMsg({ type: "success", text: "Name saved successfully" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save name";
      setProfileMsg({ type: "error", text: msg });
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Change password ────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    setPasswordSaving(true);
    setPasswordMsg(null);
    setReauthSent(false);

    // Validate
    if (!newPassword) {
      setPasswordMsg({ type: "error", text: "New password is required" });
      setPasswordSaving(false);
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({
        type: "error",
        text: "New password must be at least 6 characters",
      });
      setPasswordSaving(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Passwords do not match" });
      setPasswordSaving(false);
      return;
    }

    try {
      // First, reauthenticate with current password
      if (currentPassword) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: userEmail!,
          password: currentPassword,
        });
        if (signInError) {
          setPasswordMsg({
            type: "error",
            text: "Current password is incorrect",
          });
          setPasswordSaving(false);
          return;
        }
      }

      // Now update the password
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        // If reauthentication is needed, send a reauth email
        if (
          error.message?.toLowerCase().includes("reauthentication") ||
          error.message?.toLowerCase().includes("reauthenticate")
        ) {
          await supabase.auth.reauthenticate();
          setReauthSent(true);
          setPasswordMsg({
            type: "error",
            text: "Reauthentication needed. Check your email for a verification link, then try again.",
          });
        } else {
          throw error;
        }
        return;
      }

      // Success
      setPasswordMsg({
        type: "success",
        text: "Password changed successfully",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to change password";
      setPasswordMsg({ type: "error", text: msg });
    } finally {
      setPasswordSaving(false);
    }
  };

  // ── Save API keys (existing) ───────────────────────────────────────────────
  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveMsg(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const payload: Database["public"]["Tables"]["user_settings"]["Insert"] = {
        user_id: user.id,
      };
      if (openaiKey.trim()) payload.openai_api_key = openaiKey.trim();
      if (githubToken.trim()) payload.github_token = githubToken.trim();

      if (settings) {
        const { error } = await supabase
          .from("user_settings")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_settings")
          .insert(payload);
        if (error) throw error;
      }

      const { data: fresh } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (fresh) setSettings(fresh);

      setSaveMsg({ type: "success", text: "Settings saved successfully" });
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
            Manage your account, API keys, and personal details.
          </p>
        </div>

        {profileLoading && loadingSettings ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 rounded border-2 border-accent/30 border-t-accent animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* ── Email (read-only) ───────────────────────────────────────── */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <label className="font-heading text-sm text-foreground tracking-wide flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4 text-muted" />
                Email
              </label>
              <p className="text-sm text-foreground mt-1">
                {userEmail ?? "—"}
              </p>
              <p className="text-[11px] text-muted mt-1">
                This is the email you used to sign up. It cannot be changed
                here.
              </p>
            </div>

            {/* ── Display Name ────────────────────────────────────────────── */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <label
                htmlFor="display-name"
                className="font-heading text-sm text-foreground tracking-wide flex items-center gap-2 mb-1"
              >
                <User className="w-4 h-4 text-muted" />
                Display Name
              </label>
              <p className="text-[11px] text-muted mb-3">
                Set a display name to personalise your account.
              </p>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-150"
              />
              <div className="flex items-center justify-end gap-3 mt-3">
                {profileMsg && (
                  <div
                    className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md border ${
                      profileMsg.type === "success"
                        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                        : "text-destructive border-destructive/20 bg-destructive/5"
                    }`}
                  >
                    {profileMsg.type === "success" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    {profileMsg.text}
                  </div>
                )}
                <button
                  onClick={handleSaveProfile}
                  disabled={profileSaving}
                  className="inline-flex items-center gap-2 bg-primary text-on-primary rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 cursor-pointer"
                >
                  {profileSaving ? (
                    <>
                      <div className="w-4 h-4 rounded border-2 border-on-primary/30 border-t-on-primary animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Name
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* ── Change Password ─────────────────────────────────────────── */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <label className="font-heading text-sm text-foreground tracking-wide flex items-center gap-2 mb-1">
                <Lock className="w-4 h-4 text-muted" />
                Change Password
              </label>
              <p className="text-[11px] text-muted mb-4">
                Update your password. It must be at least 6 characters.
              </p>

              <div className="space-y-3">
                {/* Current password */}
                <div className="relative">
                  <input
                    id="current-password"
                    type={showCurrentPw ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-150"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors duration-150 cursor-pointer"
                    aria-label={showCurrentPw ? "Hide password" : "Show password"}
                  >
                    {showCurrentPw ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* New password */}
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNewPw ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-150"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors duration-150 cursor-pointer"
                    aria-label={showNewPw ? "Hide password" : "Show password"}
                  >
                    {showNewPw ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Confirm new password */}
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmPw ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-150"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors duration-150 cursor-pointer"
                    aria-label={
                      showConfirmPw ? "Hide password" : "Show password"
                    }
                  >
                    {showConfirmPw ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-end gap-3 mt-4">
                {passwordMsg && (
                  <div
                    className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md border w-full ${
                      passwordMsg.type === "success"
                        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                        : "text-destructive border-destructive/20 bg-destructive/5"
                    }`}
                  >
                    {passwordMsg.type === "success" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    {passwordMsg.text}
                    {reauthSent && (
                      <span className="text-muted">
                        {" "}
                        A reauthentication email has been sent to{" "}
                        <strong className="text-foreground">{userEmail}</strong>
                        .
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={handleChangePassword}
                  disabled={
                    passwordSaving || (!currentPassword && !newPassword)
                  }
                  className="inline-flex items-center gap-2 bg-primary text-on-primary rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 cursor-pointer"
                >
                  {passwordSaving ? (
                    <>
                      <div className="w-4 h-4 rounded border-2 border-on-primary/30 border-t-on-primary animate-spin" />
                      Updating…
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      Change Password
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* ── OpenAI API Key ─────────────────────────────────────────── */}
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

            {/* ── GitHub Token ─────────────────────────────────────────────── */}
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
                Needs <code className="text-accent text-[10px]">repo</code>{" "}
                scope for private repos.
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

            {/* ── Save Settings section ─────────────────────────────────────── */}
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
                onClick={handleSaveSettings}
                disabled={saving || (!openaiKey.trim() && !githubToken.trim())}
                className="inline-flex items-center gap-2 bg-primary text-on-primary rounded-md px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 cursor-pointer"
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
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) throw updateError;

      setMessage("Password updated successfully! Redirecting to dashboard...");
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reset password"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded bg-accent/20 border border-accent/30 flex items-center justify-center">
              <span className="text-accent text-sm font-bold font-heading">
                {">_"}
              </span>
            </div>
            <span className="font-heading text-foreground text-xl tracking-wide">
              CodeMap
            </span>
          </div>
          <p className="text-muted text-sm">Choose a new password</p>
        </div>

        {!ready ? (
          <div className="bg-surface border border-border rounded-lg p-6 text-center">
            <p className="text-muted text-sm">Verifying reset link...</p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-surface border border-border rounded-lg p-6 space-y-4"
          >
            <h2 className="font-heading text-foreground text-lg text-center">
              New Password
            </h2>

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-accent/10 border border-accent/30 rounded-md px-3 py-2 text-xs text-accent">
                {message}
              </div>
            )}

            <div>
              <label
                htmlFor="new-password"
                className="block text-xs text-muted mb-1.5"
              >
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all duration-150"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs text-muted mb-1.5"
              >
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all duration-150"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary rounded-md py-2 text-sm font-medium hover:opacity-90 transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
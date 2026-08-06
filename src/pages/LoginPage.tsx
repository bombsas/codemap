import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });

        if (signUpError) throw signUpError;

        setMessage(
          "Account created! You can now sign in."
        );
        setIsSignUp(false);
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) throw signInError;

        navigate("/dashboard");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
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
          <p className="text-muted text-sm">Understand any codebase in minutes</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border rounded-lg p-6 space-y-4"
        >
          <h2 className="font-heading text-foreground text-lg text-center">
            {isSignUp ? "Create Account" : "Sign In"}
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
              htmlFor="email"
              className="block text-xs text-muted mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all duration-150"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs text-muted mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {loading
              ? "Please wait..."
              : isSignUp
              ? "Create Account"
              : "Sign In"}
          </button>

          <p className="text-center text-xs text-muted">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setMessage(null);
              }}
              className="text-accent hover:underline underline-offset-2"
            >
              {isSignUp ? "Sign in" : "Create one"}
            </button>
          </p>
        </form>

        <p className="text-center mt-4">
          <Link
            to="/"
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
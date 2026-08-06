import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";
import { FileCode, ArrowRight } from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate("/dashboard", { replace: true });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
              <span className="text-accent text-lg font-bold font-heading">
                {">_"}
              </span>
            </div>
          </div>

          <h1 className="font-heading text-4xl sm:text-5xl text-foreground tracking-tight mb-4">
            Understand any codebase
            <br />
            <span className="text-accent">in minutes</span>
          </h1>

          <p className="text-muted text-base sm:text-lg max-w-lg mx-auto mb-10 leading-relaxed">
            CodeMap parses your code, extracts every function and class, and
            generates AI-powered explanations — then visualizes it all as an
            interactive graph.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 bg-primary text-on-primary rounded-md px-6 py-3 text-sm font-medium hover:opacity-90 transition-all duration-150 active:scale-[0.98]"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 border border-border text-foreground rounded-md px-6 py-3 text-sm font-medium hover:border-accent/30 hover:bg-surface/50 transition-all duration-150 active:scale-[0.98]"
            >
              Create Account
            </Link>
          </div>
        </div>

        {/* Feature preview */}
        <div className="max-w-4xl mx-auto mt-20 px-4 pb-16 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-surface border border-border rounded-lg p-5 text-left">
            <div className="w-9 h-9 rounded bg-accent/10 border border-accent/20 flex items-center justify-center mb-3">
              <FileCode className="w-4 h-4 text-accent" />
            </div>
            <h3 className="font-heading text-foreground text-sm mb-1.5 tracking-wide">
              Parse Everything
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              Drop a GitHub URL, upload a ZIP, or paste files. Supports
              JavaScript, TypeScript, Python, Java, Go, C, and C++.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-lg p-5 text-left">
            <div className="w-9 h-9 rounded bg-accent/10 border border-accent/20 flex items-center justify-center mb-3">
              <span className="text-accent text-sm font-heading">AI</span>
            </div>
            <h3 className="font-heading text-foreground text-sm mb-1.5 tracking-wide">
              AI Explanations
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              Every function gets a structured, plain-English explanation of
              its purpose, inputs, outputs, and internal logic.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-lg p-5 text-left">
            <div className="w-9 h-9 rounded bg-accent/10 border border-accent/20 flex items-center justify-center mb-3">
              <span className="text-accent text-sm font-heading">◉</span>
            </div>
            <h3 className="font-heading text-foreground text-sm mb-1.5 tracking-wide">
              Visualize
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              Explore your codebase as a block view, dependency graph, or
              mind-map. Click any node to see source and explanations.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-4">
        <p className="text-center text-[10px] text-muted/50">
          CodeMap &mdash; Open-source codebase visualizer
        </p>
      </footer>
    </div>
  );
}
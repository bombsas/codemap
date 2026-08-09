import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useState } from "react";

interface HeaderProps {
  userEmail?: string;
}

export default function Header({ userEmail }: HeaderProps) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 group"
          >
            <div className="w-7 h-7 rounded bg-accent/20 border border-accent/30 flex items-center justify-center">
              <span className="text-accent text-xs font-bold font-heading">{">_"}</span>
            </div>
            <span className="font-heading text-foreground text-lg tracking-wide">
              CodeMap
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="text-muted text-xs hidden sm:block truncate max-w-[140px]">
              {userEmail}
            </span>
          )}
          <button
            onClick={() => navigate("/profile")}
            className="text-xs text-muted hover:text-foreground transition-colors duration-150 px-3 py-1.5 rounded-md border border-border hover:border-border/60 cursor-pointer"
          >
            Profile
          </button>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-xs text-muted hover:text-foreground transition-colors duration-150 px-3 py-1.5 rounded-md border border-border hover:border-border/60 disabled:opacity-50 cursor-pointer"
          >
            {signingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </div>
    </header>
  );
}
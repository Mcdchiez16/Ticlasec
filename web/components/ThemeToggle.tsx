"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "ticlasec-theme";
type Theme = "light" | "dark";

function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable: the choice just lasts for this page view */
  }
}

/** Light / dark switch. The initial theme is applied by an inline script in layout.tsx (no flash). */
export function ThemeToggle({ variant = "segmented" }: { variant?: "segmented" | "icon" }) {
  const [theme, setThemeState] = useState<Theme | null>(null);

  useEffect(() => {
    setThemeState(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const choose = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
  };

  if (variant === "icon") {
    const next: Theme = theme === "dark" ? "light" : "dark";
    return (
      <button
        type="button"
        onClick={() => choose(next)}
        className="btn-dw btn-dw-ghost btn-dw-sm !w-9 !px-0"
        aria-label={`Switch to ${next} mode`}
        title={`Switch to ${next} mode`}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" strokeWidth={2.6} /> : <Moon className="h-4 w-4" strokeWidth={2.6} />}
      </button>
    );
  }

  const opt = (t: Theme, label: string, Icon: typeof Sun) => (
    <button
      type="button"
      onClick={() => choose(t)}
      aria-pressed={theme === t}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-1.5 text-[12px] font-extrabold transition-colors ${
        theme === t
          ? "border-[var(--focus-ring)] bg-[var(--bg-surface)] text-[var(--accent-text)]"
          : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={2.6} aria-hidden />
      {label}
    </button>
  );

  return (
    <div role="group" aria-label="Colour theme" className="flex gap-1 rounded-xl bg-[var(--bg-raised)] p-1">
      {opt("light", "Light", Sun)}
      {opt("dark", "Dark", Moon)}
    </div>
  );
}

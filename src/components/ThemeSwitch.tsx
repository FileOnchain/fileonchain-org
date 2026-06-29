"use client";

import { FaMoon, FaSun } from "react-icons/fa";
import { useThemeStates } from "@/states/theme";
import { cn } from "@/lib/cn";

interface ThemeSwitchProps {
  className?: string;
}

/**
 * ThemeSwitch — sun/moon toggle. Lives inline inside Nav (and other surfaces)
 * via the `className` slot. The earlier floating top-right version was
 * replaced by the global Nav in Phase 3.
 */
const ThemeSwitch = ({ className }: ThemeSwitchProps) => {
  const theme = useThemeStates((state) => state.theme);
  const toggleTheme = useThemeStates((state) => state.toggleTheme);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-surface text-foreground hover:bg-surface-elevated transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      {isDark ? <FaSun size={16} /> : <FaMoon size={16} />}
    </button>
  );
};

export default ThemeSwitch;
"use client";

import { FaMoon, FaSun } from "react-icons/fa";
import { useThemeStates } from "@/states/theme";

const ThemeSwitch = () => {
  const theme = useThemeStates((state) => state.theme);
  const toggleTheme = useThemeStates((state) => state.toggleTheme);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full border border-border bg-surface text-foreground hover:bg-primary hover:text-primary-foreground transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {isDark ? <FaSun size={18} /> : <FaMoon size={18} />}
    </button>
  );
};

export default ThemeSwitch;
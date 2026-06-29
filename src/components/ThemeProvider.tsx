"use client";

import { useEffect } from "react";
import { hydrateTheme, useThemeStates } from "@/states/theme";

/**
 * Hydrates the Zustand theme store from localStorage / system preference after
 * mount. The inline `<head>` script in `layout.tsx` already applies the theme
 * class pre-hydration, so this is a confirmation pass — it only runs once and
 * reconciles any drift between the persisted store value and the DOM.
 */
const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const theme = useThemeStates((state) => state.theme);

  useEffect(() => {
    hydrateTheme();
  }, []);

  // Re-sync the DOM if the store ever drifts (e.g. another tab toggled theme).
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return <>{children}</>;
};

export default ThemeProvider;
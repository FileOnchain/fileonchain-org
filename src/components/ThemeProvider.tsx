"use client";

import { useEffect } from "react";
import { hydrateTheme, useThemeStates } from "@/states/theme";

// Hydrates the theme store from localStorage / system preference and keeps
// the `dark` class in sync with the store. Renders nothing.
const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const theme = useThemeStates((state) => state.theme);

  useEffect(() => {
    hydrateTheme();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return <>{children}</>;
};

export default ThemeProvider;
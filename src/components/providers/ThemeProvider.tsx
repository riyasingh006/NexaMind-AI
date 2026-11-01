"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ThemePreference } from "@/types/settings";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: "midnight" | "dim";
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(theme: ThemePreference): "midnight" | "dim" {
  if (theme === "system") {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "dim";
    }
    return "midnight";
  }
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("midnight");
  const [resolvedTheme, setResolvedTheme] = useState<"midnight" | "dim">("midnight");

  const applyTheme = useCallback((nextTheme: ThemePreference) => {
    const resolved = resolveTheme(nextTheme);
    setResolvedTheme(resolved);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = "dark";
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("documind-theme") as ThemePreference | null;
    const initial = stored && ["midnight", "dim", "system"].includes(stored) ? stored : "midnight";
    setThemeState(initial);
    applyTheme(initial);
  }, [applyTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => applyTheme("system");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme, applyTheme]);

  const setTheme = useCallback(
    (nextTheme: ThemePreference) => {
      setThemeState(nextTheme);
      window.localStorage.setItem("documind-theme", nextTheme);
      applyTheme(nextTheme);
    },
    [applyTheme],
  );

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

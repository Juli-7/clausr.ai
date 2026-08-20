"use client";

import { useState, useCallback, useEffect } from "react";

type Theme = "light" | "dark";

const DARK_VARS = {
  "--color-bg-primary": "#12110d",
  "--color-bg-card": "#1a1815",
  "--color-bg-dark": "#161411",
  "--color-border-default": "#2d2924",
  "--color-border-input": "#3d3832",
  "--color-accent-blue": "#5A7BD4",
  "--color-accent-blue-bg": "rgba(90, 123, 212, 0.2)",
  "--color-accent-blue-border": "rgba(90, 123, 212, 0.4)",
  "--color-text-muted": "#b8b0a0",
  "--color-text-body": "#e8e2d4",
  "--color-text-header": "#f5f1ea",
  "--color-success": "#5ab5c2",
  "--color-success-bg": "rgba(90, 181, 194, 0.15)",
  "--color-danger": "#d68a93",
  "--color-danger-bg": "rgba(214, 138, 147, 0.12)",
  "--color-danger-border": "rgba(214, 138, 147, 0.25)",
  "--color-amber": "#d4aa4a",
  "--color-amber-bg": "rgba(212, 170, 74, 0.15)",
  "--color-amber-border": "rgba(212, 170, 74, 0.3)",
};

function getStored(): Theme | null {
  if (typeof window === "undefined") return null;
  return (localStorage.getItem("theme") as Theme) ?? null;
}

function getSystemPref(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const saved = getStored();
    const t = saved ?? getSystemPref();
    applyThemeVars(t);
    setThemeState(t);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!getStored()) {
        applyThemeVars(e.matches ? "dark" : "light");
        setThemeState(e.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem("theme", t);
    applyThemeVars(t);
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, toggle, setTheme };
}

function applyThemeVars(t: Theme) {
  const root = document.documentElement;
  if (t === "dark") {
    for (const [key, val] of Object.entries(DARK_VARS)) {
      root.style.setProperty(key, val);
    }
  } else {
    for (const key of Object.keys(DARK_VARS)) {
      root.style.removeProperty(key);
    }
  }
}

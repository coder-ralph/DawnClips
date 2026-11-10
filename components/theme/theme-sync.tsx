"use client";

import { useEffect } from "react";

export function applyTheme(theme: "light" | "dark" | "system") {
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function ThemeSync({
  theme,
  language,
  autoplay,
  muted,
}: {
  theme: "light" | "dark" | "system";
  language: string;
  autoplay: boolean;
  muted: boolean;
}) {
  useEffect(() => {
    window.localStorage.setItem("dawnclips-theme", theme);
    window.localStorage.setItem("dawnclips-language", language);
    window.localStorage.setItem("dawnclips:autoplay", autoplay ? "1" : "0");
    window.localStorage.setItem("dawnclips:muted", muted ? "1" : "0");
    document.documentElement.lang = language;
    applyTheme(theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, language, autoplay, muted]);

  return null;
}

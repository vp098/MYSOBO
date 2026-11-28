import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch, type PortalUser } from "./services/api";
import { useT, type MessageKey } from "./i18n";
import { ME_KEY } from "./session";

export type Theme = PortalUser["theme"];
export const THEMES: { value: Theme; key: MessageKey; swatch: [string, string] }[] = [
  { value: "warm", key: "theme.warm", swatch: ["#FCFEFB", "#287A4B"] },
  { value: "neutral", key: "theme.neutral", swatch: ["#F7F7F6", "#3D4A42"] },
  { value: "light", key: "theme.light", swatch: ["#FFFFFF", "#287A4B"] },
  { value: "dark", key: "theme.dark", swatch: ["#141A16", "#5BAF7C"] },
];
const LOCAL_KEY = "mysobo-theme";

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(LOCAL_KEY, theme); } catch { /* private mode */ }
}

/** Puts the signed-in person's saved theme on <html data-theme>. Guests keep the last one used on this device. */
export function useApplyTheme(me: PortalUser | null | undefined) {
  useEffect(() => {
    if (me?.theme) apply(me.theme);
    else if (me === null) {
      let local: string | null = null;
      try { local = localStorage.getItem(LOCAL_KEY); } catch { /* ignore */ }
      apply(THEMES.some((item) => item.value === local) ? (local as Theme) : "warm");
    }
  }, [me]);
}

export function ThemePicker({ user }: { user: PortalUser }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const current = user.theme ?? "warm";

  async function choose(theme: Theme) {
    setError("");
    apply(theme);
    queryClient.setQueryData<PortalUser | null>(ME_KEY, (old) => (old ? { ...old, theme } : old));
    try {
      await apiPatch("/me/preferences/", { theme });
    } catch (cause) {
      apply(current);
      queryClient.setQueryData<PortalUser | null>(ME_KEY, (old) => (old ? { ...old, theme: current } : old));
      setError(cause instanceof Error ? cause.message : t("err.request"));
    }
  }

  return (
    <fieldset className="themePicker">
      <legend>{t("theme.title")}</legend>
      <div className="themeOptions">
        {THEMES.map((item) => (
          <button key={item.value} type="button" className={item.value === current ? "on" : ""} aria-pressed={item.value === current} onClick={() => void choose(item.value)}>
            <span className="themeSwatch" style={{ background: item.swatch[0] }}><i style={{ background: item.swatch[1] }} /></span>
            {t(item.key)}
          </button>
        ))}
      </div>
      {error && <p className="formError">{error}</p>}
    </fieldset>
  );
}

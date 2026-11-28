import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet, apiPost } from "./services/api";
import { useT } from "./i18n";
import type { LoginResult } from "./session";

/*
 * "Continue with Google" (Google Identity Services). Google is the only way to
 * sign up or log in. The client id comes from the backend (/api/auth/config/),
 * so only GOOGLE_CLIENT_ID has to be set, on the backend. VITE_GOOGLE_CLIENT_ID
 * still works as a build-time fallback.
 */
const BUILD_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";

type GoogleId = {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: string; auto_select?: boolean; cancel_on_tap_outside?: boolean }) => void;
  renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
};
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

export type AuthConfig = { google_client_id: string; google_enabled: boolean; password_login: boolean };

export function useAuthConfig() {
  return useQuery({
    queryKey: ["auth-config"],
    queryFn: () => apiGet<AuthConfig>("/auth/config/"),
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

let scriptPromise: Promise<void> | null = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptPromise = null; reject(new Error("load")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type GoogleState = "loading" | "ready" | "not_configured" | "load_failed";

/**
 * Renders Google's own button. Success, a rejected token, a blocked account and
 * network errors are all reported; closing Google's window simply leaves the
 * button in place (Google does not report a cancelled pop-up).
 */
export function GoogleSignIn({ accountType, signup = false, onSuccess, onState }: {
  accountType?: "resident" | "business_owner";
  signup?: boolean;
  onSuccess: (result: LoginResult & { new?: boolean }) => void;
  onState?: (state: GoogleState) => void;
}) {
  const { t, lang } = useT();
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<GoogleState>("loading");
  const config = useAuthConfig();
  const clientId = config.data?.google_client_id || BUILD_CLIENT_ID;
  const typeRef = useRef(accountType);
  typeRef.current = accountType;
  const successRef = useRef(onSuccess);
  successRef.current = onSuccess;

  useEffect(() => { onState?.(state); }, [state, onState]);

  useEffect(() => {
    if (config.isLoading) return;
    if (!clientId) { setState("not_configured"); return; }
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !holder.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        cancel_on_tap_outside: true,
        callback: async ({ credential }) => {
          setError("");
          setPending(true);
          try {
            successRef.current(await apiPost<LoginResult & { new?: boolean }>("/auth/google/", { credential, account_type: typeRef.current }));
          } catch (cause) {
            if (cause instanceof ApiError && cause.status === 403) setError(t("au.blocked"));
            else if (cause instanceof ApiError && cause.status === 503) setError(t("au.notConfigured"));
            else if (cause instanceof ApiError && cause.status === 409) setError(cause.message);
            else if (cause instanceof ApiError && cause.status === 400) setError(t("au.googleRejected"));
            else setError(t("au.network"));
          } finally {
            setPending(false);
          }
        },
      });
      holder.current.innerHTML = "";
      window.google.accounts.id.renderButton(holder.current, {
        type: "standard",
        theme: "filled_blue",
        size: "large",
        text: signup ? "signup_with" : "continue_with",
        shape: "pill",
        logo_alignment: "left",
        width: Math.max(240, Math.min(holder.current.clientWidth || 320, 400)),
        locale: lang === "gu" ? "gu" : lang === "hi" ? "hi" : "en",
      });
      setState("ready");
    }).catch(() => { if (!cancelled) setState("load_failed"); });
    return () => { cancelled = true; };
  }, [clientId, config.isLoading, lang, signup, t]);

  return (
    <div className="googleSignIn">
      {state === "loading" && <div className="gsiSkeleton" aria-busy="true">{t("au.loadingGoogle")}</div>}
      {state === "not_configured" && <p className="auNotice" role="status">{t("au.notConfigured")}</p>}
      {state === "load_failed" && <p className="formError" role="alert">{t("err.googleLoad")}</p>}
      <div ref={holder} className="googleButtonHolder" aria-busy={pending} hidden={state !== "ready"} />
      {pending && <p className="mutedText" role="status">{t("login.signingIn")}</p>}
      {error && <p className="formError" role="alert">{error}</p>}
    </div>
  );
}

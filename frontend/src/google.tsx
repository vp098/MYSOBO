
import { useEffect, useRef, useState } from "react";
import { apiPost } from "./services/api";
import { useT } from "./i18n";
import type { LoginResult } from "./session";

/*
 * "Continue with Google" using Google Identity Services.
 * Needs VITE_GOOGLE_CLIENT_ID (frontend) and GOOGLE_CLIENT_ID (backend) set to
 * the same OAuth 2.0 Web client ID from Google Cloud Console.
 */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";
export const SMS_OTP_ENABLED = import.meta.env.VITE_ENABLE_SMS_OTP === "true";

type GoogleId = {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: string; auto_select?: boolean }) => void;
  renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
};
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
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

export function GoogleSignIn({ onSuccess }: { onSuccess: (result: LoginResult) => void }) {
  const { t, lang } = useT();
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !holder.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setError("");
          setPending(true);
          try {
            onSuccess(await apiPost<LoginResult>("/auth/google/", { credential }));
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : t("err.google"));
          } finally {
            setPending(false);
          }
        },
      });
      holder.current.innerHTML = "";
      window.google.accounts.id.renderButton(holder.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "left",
        width: Math.min(holder.current.clientWidth || 320, 400),
        locale: lang === "gu" ? "gu" : lang === "hi" ? "hi" : "en",
      });
    }).catch(() => { if (!cancelled) setError(t("err.googleLoad")); });
    return () => { cancelled = true; };
  }, [lang, onSuccess, t]);

  // Google sign-in is optional: without a client id it simply does not show.
  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div className="googleSignIn">
      <div ref={holder} className="googleButtonHolder" aria-busy={pending} />
      {pending && <p className="mutedText">{t("login.signingIn")}</p>}
      {error && <p className="formError">{error}</p>}
      <p className="googleConsent">{t("login.googleConsent")}</p>
    </div>
  );
}

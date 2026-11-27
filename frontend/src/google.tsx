import { LeafMark, Logo, PinScene } from "./logo";
import React, { useEffect, useRef, useState } from "react";
import { apiPost } from "./services/api";
import { useT } from "./i18n";

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

export function GoogleSignIn({ onSuccess }: { onSuccess: () => void }) {
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
            const response = await apiPost<{ token: string }>("/auth/google/", { credential });
            sessionStorage.setItem("mysobo-token", response.token);
            onSuccess();
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

  if (!GOOGLE_CLIENT_ID) {
    return <p className="formError">{t("login.googleMissing")}</p>;
  }
  return (
    <div className="googleSignIn">
      <div ref={holder} className="googleButtonHolder" aria-busy={pending} />
      {pending && <p className="mutedText">{t("login.signingIn")}</p>}
      {error && <p className="formError">{error}</p>}
      <p className="googleConsent">{t("login.googleConsent")}</p>
    </div>
  );
}

/* Preview sign-in: any email, no verification (VITE_DEMO_LOGIN=true). */
export const DEMO_LOGIN_ENABLED = import.meta.env.VITE_DEMO_LOGIN === "true";

export function EmailSignIn({ startWith = "signup", onSuccess, onPassword }: {
  startWith?: "signup" | "login";
  onSuccess: () => void;
  onPassword: () => void;
}) {
  const { t } = useT();
  const [kind, setKind] = useState(startWith);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const signup = kind === "signup";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await apiPost<{ token: string }>("/auth/demo-email/", { email: email.trim() });
      sessionStorage.setItem("mysobo-token", response.token);
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.login"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="authScreenBody">
      <div className="authHero"><PinScene /></div>
      <aside className="authAside">
        <span className="authAsideChip"><LeafMark size={16} />{t("auth.asideChip")}</span>
        <h2>{t("auth.asideTitle")}</h2>
        <ul className="authPerks">
          <li>{t("auth.perk1")}</li>
          <li>{t("auth.perk2")}</li>
          <li>{t("auth.perk3")}</li>
          <li>{t("auth.perk4")}</li>
        </ul>
        <div className="authAsideMap"><PinScene /></div>
        <p className="authAsideFoot">{t("auth.asideFoot")}</p>
      </aside>
      <div className="authSheet">
      <div className="authBrand"><Logo size={34} /></div>
      <h1 id="login-title" className="authSub">{signup ? t("auth.signupSub") : t("auth.loginSub")}</h1>
      <form className="authBox" onSubmit={submit}>
        <input type="email" name="email" autoComplete="email" inputMode="email" required aria-label={t("login.email")} placeholder={t("auth.emailPh")} value={email} onChange={(event) => setEmail(event.target.value)} />
        {error && <p className="formError">{error}</p>}
        <button className="obBtn lpWide" type="submit" disabled={pending || !email.includes("@")}>{pending ? t("login.signingIn") : signup ? t("auth.getStarted") : t("login.continue")}</button>
        {GOOGLE_CLIENT_ID && (
          <>
            <div className="authOr"><span>{t("auth.or")}</span></div>
            <GoogleSignIn onSuccess={onSuccess} />
          </>
        )}
        <p className="authSwitch">
          {signup ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
          <button type="button" className="authLink" onClick={() => { setKind(signup ? "login" : "signup"); setError(""); }}>{signup ? t("auth.logIn") : t("auth.signUp")}</button>
        </p>
      </form>
      <ul className="authPerks authPerksMobile">
        <li>{t("auth.perk1")}</li>
        <li>{t("auth.perk2")}</li>
        <li>{t("auth.perk3")}</li>
      </ul>
      <p className="googleConsent">{t("login.googleConsent")}</p>
      <button type="button" className="authAdmin" onClick={onPassword}>{t("login.usePassword")}</button>
      </div>
    </div>
  );
}

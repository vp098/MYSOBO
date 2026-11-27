import { LeafMark, Logo, PinScene, Wordmark } from "./logo";
import { useEffect, useState } from "react";
import { LanguageSwitch, useT } from "./i18n";

/*
 * First-launch flow on phones, laid out like Calendly's Android onboarding
 * (splash → welcome with "Create an account" / "Sign in"), in MySobo colours.
 * Shown once per device.
 */
const DONE_KEY = "mysobo-onboarded";

export type OnboardingNext = "signup" | "login" | null;

export function shouldOnboard() {
  try {
    if (localStorage.getItem(DONE_KEY)) return false;
  } catch {
    return false;
  }
  return window.matchMedia("(max-width: 900px)").matches;
}

export function Onboarding({ onDone }: { onDone: (next: OnboardingNext) => void }) {
  const { t } = useT();
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => setSplash(false), 1100);
    return () => { document.body.style.overflow = ""; window.clearTimeout(timer); };
  }, []);

  function finish(next: OnboardingNext) {
    try { localStorage.setItem(DONE_KEY, "1"); } catch { /* still close */ }
    onDone(next);
  }

  if (splash) {
    return (
      <div className="ob obSplash" role="dialog" aria-modal="true" aria-label="MySobo">
        <LeafMark size={120} className="obSplashLeaf" />
        <Wordmark className="obSplashWord" />
        <p className="obTagline">{t("brand.tagline")}</p>
      </div>
    );
  }

  return (
    <div className="ob obWelcome2" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="obTop">
        <Logo size={28} className="obLogo" />
        <LanguageSwitch />
      </div>
      <div className="obCopy">
        <h1 id="ob-title">{t("ob2.line1")}<br />{t("ob2.line2")}<br /><span>{t("ob2.line3")}</span></h1>
        <button type="button" className="obBtn" onClick={() => finish("signup")}>{t("ob2.create")}</button>
        <button type="button" className="obBtn outline" onClick={() => finish("login")}>{t("ob2.signin")}</button>
        <button type="button" className="obGuest" onClick={() => finish(null)}>{t("ob2.guest")}</button>
      </div>
      <div className="obScene"><PinScene /></div>
    </div>
  );
}

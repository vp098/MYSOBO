import { useEffect, useState } from "react";
import { useT } from "./i18n";

/*
 * Installable app support. In production we register /sw.js. The install
 * button appears when the browser offers an install prompt (Android, desktop
 * Chrome/Edge) or on iPhone/iPad Safari, where we show "Add to Home Screen"
 * steps instead. It hides itself once MySobo runs as an installed app.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    listeners.forEach((notify) => notify());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((notify) => notify());
  });
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app works without it; installing just is not offered.
    });
  });
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function InstallButton() {
  const { t } = useT();
  const [, setTick] = useState(0);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const notify = () => setTick((n) => n + 1);
    listeners.add(notify);
    return () => { listeners.delete(notify); };
  }, []);

  if (isStandalone()) return null;
  const canPrompt = deferredPrompt !== null;
  const ios = isIos();
  if (!canPrompt && !ios) return null;

  async function install() {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      await prompt.prompt();
      await prompt.userChoice;
      deferredPrompt = null;
      setTick((n) => n + 1);
    } else {
      setShowIosHelp(true);
    }
  }

  return (
    <>
      <button type="button" className="installButton" aria-label={t("install.button")} onClick={install}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
        </svg>
        <span aria-hidden="true">{t("install.button")}</span>
      </button>
      {showIosHelp && (
        <div className="modalBackdrop" role="presentation" onClick={() => setShowIosHelp(false)}>
          <div className="installHelp" role="dialog" aria-modal="true" aria-labelledby="install-help-title" onClick={(event) => event.stopPropagation()}>
            <img src="/icons/icon-192.png" alt="" width="72" height="72" />
            <h2 id="install-help-title">{t("install.iosTitle")}</h2>
            <ol>
              <li>{t("install.iosStep1")}</li>
              <li>{t("install.iosStep2")}</li>
              <li>{t("install.iosStep3")}</li>
            </ol>
            <button type="button" className="button" onClick={() => setShowIosHelp(false)}>{t("close")}</button>
          </div>
        </div>
      )}
    </>
  );
}

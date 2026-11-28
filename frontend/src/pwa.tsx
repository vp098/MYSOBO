import { useEffect, useState } from "react";
import { CheckCircle2, Download, MonitorSmartphone, Share, SquarePlus } from "lucide-react";
import { useT } from "./i18n";

/*
 * Installable app (PWA). /sw.js is registered in production builds. The
 * browser's own install prompt is used where it exists (Chrome, Edge,
 * Samsung Internet, Android). iPhone/iPad Safari has no prompt, so we show the
 * "Add to Home Screen" steps. Once installed (running standalone, or the
 * browser reported "appinstalled"), the install buttons hide.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALLED_KEY = "mysobo-installed";
let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    // The browser only offers this when the app is not installed.
    try { localStorage.removeItem(INSTALLED_KEY); } catch { /* ignore */ }
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* ignore */ }
    notify();
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

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: window-controls-overlay)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export type InstallStatus = "standalone" | "installed" | "prompt" | "ios" | "manual";

/** Where this browser stands with installing MySobo, plus the action to take. */
export function useInstall() {
  const [, setTick] = useState(0);
  const [related, setRelated] = useState(false);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener?.("change", listener);
    // Chrome on Android can tell us if the installed app exists (manifest related_applications).
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
    nav.getInstalledRelatedApps?.().then((apps) => setRelated(apps.length > 0)).catch(() => undefined);
    return () => { listeners.delete(listener); media.removeEventListener?.("change", listener); };
  }, []);

  let remembered = false;
  try { remembered = localStorage.getItem(INSTALLED_KEY) === "1"; } catch { /* ignore */ }
  const status: InstallStatus = isStandalone() ? "standalone"
    : deferredPrompt ? "prompt"
      : related || remembered ? "installed"
        : isIos() ? "ios" : "manual";

  async function install() {
    if (!deferredPrompt) return "unavailable" as const;
    const prompt = deferredPrompt;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    deferredPrompt = null;
    if (choice.outcome === "accepted") {
      try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* ignore */ }
    }
    notify();
    return choice.outcome;
  }
  return { status, install };
}

function IosSteps({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <div className="installHelp" role="dialog" aria-modal="true" aria-labelledby="install-help-title" onClick={(event) => event.stopPropagation()}>
        <img src="/icons/icon-192.png" alt="" width="72" height="72" />
        <h2 id="install-help-title">{t("install.iosTitle")}</h2>
        <ol>
          <li><Share size={16} /> {t("install.iosStep1")}</li>
          <li><SquarePlus size={16} /> {t("install.iosStep2")}</li>
          <li>{t("install.iosStep3")}</li>
        </ol>
        <button type="button" className="button" onClick={onClose}>{t("close")}</button>
      </div>
    </div>
  );
}

/** Header button: installs, shows iPhone steps, or opens the install guide. Hidden once installed. */
export function InstallButton() {
  const { t } = useT();
  const { status, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (status === "standalone" || status === "installed") return null;
  if (status === "manual") {
    return <a className="navInstall" href="/mysobo#install"><Download size={16} /><span>{t("install.button")}</span></a>;
  }
  return (
    <>
      <button type="button" className="navInstall" onClick={() => (status === "prompt" ? void install() : setHelp(true))}>
        <Download size={16} /><span>{t("install.button")}</span>
      </button>
      {help && <IosSteps onClose={() => setHelp(false)} />}
    </>
  );
}

/** The install section on /mysobo: install, steps for iPhone, or "already installed". */
export function InstallCard() {
  const { t } = useT();
  const { status, install } = useInstall();
  const [help, setHelp] = useState(false);
  const [result, setResult] = useState("");

  if (status === "standalone") return null; // already running as the installed app
  return (
    <section className="installCard" aria-labelledby="install-card-title">
      <img src="/icons/icon-192.png" alt="" width="64" height="64" className="installCardIcon" />
      <div className="installCardText">
        <h2 id="install-card-title">{status === "installed" ? t("install.doneTitle") : t("install.cardTitle")}</h2>
        <p>{status === "installed" ? t("install.doneText")
          : status === "ios" ? t("install.iosText")
            : status === "manual" ? t("install.manualText")
              : t("install.cardText")}</p>
        {result && <p className="odSmall" role="status">{result}</p>}
      </div>
      <div className="installCardAction">
        {status === "prompt" && (
          <button type="button" className="lnBtn" onClick={async () => {
            const outcome = await install();
            setResult(outcome === "accepted" ? t("install.accepted") : outcome === "dismissed" ? t("install.dismissed") : "");
          }}><Download size={18} />{t("install.cta")}</button>
        )}
        {status === "ios" && <button type="button" className="lnBtn" onClick={() => setHelp(true)}><Share size={18} />{t("install.showSteps")}</button>}
        {status === "manual" && <span className="installHint"><MonitorSmartphone size={18} />{t("install.manualHint")}</span>}
        {status === "installed" && <span className="installDone"><CheckCircle2 size={18} />{t("install.installed")}</span>}
      </div>
      {help && <IosSteps onClose={() => setHelp(false)} />}
    </section>
  );
}

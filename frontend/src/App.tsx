import { LeafMark, Logo, PinScene } from "./logo";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  apiDelete,
  apiUpload,
  type Business,
  type BusinessProduct,
  type BusinessService,
  type Category,
  type CategoryField,
  type ManagedCategoryField,
  type ManagedCategory,
  type ManagedSubcategory,
  type PortalUser,
  type Review,
  type Subcategory,
} from "./services/api";
import { LanguageSwitch, useT, type MessageKey } from "./i18n";
import { InstallButton } from "./pwa";
import { OwnerDashboard } from "./owner";
import { SuperAdminDashboard } from "./superadmin";
import { coverFor, coverForCategory } from "./covers";
import { ListingPage } from "./listing";
import { Onboarding, shouldOnboard } from "./onboarding";
import { DEMO_LOGIN_ENABLED, EmailSignIn, GoogleSignIn, SMS_OTP_ENABLED } from "./google";

export function Shell({
  children,
  user,
  onAuthChange,
  bottomNav,
}: {
  children: ReactNode;
  user?: PortalUser;
  onAuthChange: () => void;
  /** Phone tab bar. Omit for the resident tabs; pass null for none. */
  bottomNav?: ReactNode | null;
}) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [logoutError, setLogoutError] = useState("");
  const { t } = useT();

  async function logout() {
    try {
      await apiPost<void>("/auth/logout/");
      sessionStorage.removeItem("mysobo-token");
      setLogoutError("");
      onAuthChange();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : t("err.logout"));
    }
  }

  function closeLogin() {
    const next = new URLSearchParams(params);
    next.delete("dialog");
    setParams(next);
  }

  function loginComplete() {
    queryClient.invalidateQueries();
    onAuthChange();
    closeLogin();
  }

  return (
    <div className={`app ${bottomNav === null ? "" : "hasTabbar"}`}>
      <header className="topbar">
        <a className="brand" href="/mysobo" aria-label={t("nav.home")}>
          <Logo size={30} />
        </a>
        <nav>
          <a className="topLink" href="/mysobo" aria-current={location.pathname === "/mysobo" ? "page" : undefined}>{t("nav.residents")}</a>
          <a className="topLink" href="/mysobo/owner" aria-current={location.pathname.startsWith("/mysobo/owner") ? "page" : undefined}>{t("nav.business")}</a>
          {user?.is_superadmin && <a href="/mysobo/superadmin">{t("nav.superadmin")}</a>}
          <InstallButton />
          <LanguageSwitch />
          {user ? (
            <button type="button" className="navButton" onClick={logout}>{t("nav.logout")}</button>
          ) : (
            <button type="button" className="button buttonLight" onClick={() => {
              const next = new URLSearchParams(params);
              next.set("dialog", "login");
              setParams(next);
            }}>{t("nav.login")}</button>
          )}
        </nav>
      </header>
      {logoutError && <p className="formError topError">{logoutError}</p>}
      <main>{children}</main>
      {bottomNav === undefined ? <ResidentTabbar /> : bottomNav}
      {(params.get("dialog") === "login" || params.get("dialog") === "signup") && (
        <LoginDialog onClose={closeLogin} onSuccess={loginComplete} startWith={params.get("dialog") === "signup" ? "signup" : "login"} />
      )}
    </div>
  );
}

function LoginDialog({ onClose, onSuccess, startWith = "login" }: { onClose: () => void; onSuccess: () => void; startWith?: "login" | "signup" }) {
  const { t } = useT();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [mobile, setMobile] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  async function requestOtp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await apiPost<{ detail: string; resend_after_seconds: number }>(
        "/auth/otp/request/",
        { mobile, consent },
      );
      setCodeRequested(true);
      setCode("");
      setResendSeconds(response.resend_after_seconds);
      setNotice(response.detail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.sendCode"));
    } finally {
      setPending(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await apiPost<{ token: string }>("/auth/otp/verify/", { mobile, code });
      sessionStorage.setItem("mysobo-token", response.token);
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.verify"));
    } finally {
      setPending(false);
    }
  }

  async function passwordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await apiPost<{ token: string }>("/auth/login/", {
        username: form.get("username"),
        password: form.get("password"),
      });
      sessionStorage.setItem("mysobo-token", response.token);
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.login"));
    } finally {
      setPending(false);
    }
  }

  if (DEMO_LOGIN_ENABLED && mode === "otp") {
    return (
      <div className="modalBackdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}>
        <section className="authCard modalCard authScreen" role="dialog" aria-modal="true" aria-labelledby="login-title">
          <button className="modalClose" type="button" onClick={onClose} aria-label={t("close")}>×</button>
          <EmailSignIn startWith={startWith} onSuccess={onSuccess} onPassword={() => setMode("password")} />
        </section>
      </div>
    );
  }

  return (
    <div className="modalBackdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="authCard modalCard" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button className="modalClose" type="button" onClick={onClose} aria-label={t("close")}>×</button>
        <span className="authLogo"><LeafMark size={60} /></span>
        <p className="eyebrow">{t("login.eyebrow")}</p>
        <h1 id="login-title">{t("login.title")}</h1>
        <p className="mutedText">{DEMO_LOGIN_ENABLED ? t("login.introEmail") : SMS_OTP_ENABLED ? t("login.intro") : t("login.introGoogle")}</p>
        {mode === "otp" && DEMO_LOGIN_ENABLED ? (
          <EmailSignIn startWith={startWith} onSuccess={onSuccess} onPassword={() => setMode("password")} />
        ) : mode === "otp" && !SMS_OTP_ENABLED ? (
          <GoogleSignIn onSuccess={onSuccess} />
        ) : mode === "otp" ? (
          codeRequested ? (
            <form onSubmit={verifyOtp}>
              <p className="mutedText">{t("login.enterCode", { mobile })}</p>
              <label>{t("login.code")}
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </label>
              {error && <p className="formError">{error}</p>}
              <button className="button authButton" type="submit" disabled={pending || code.length !== 6}>{pending ? t("login.verifying") : t("login.verify")}</button>
              <div className="loginSecondaryActions">
                <button type="button" className="textButton" onClick={() => {
                  setCodeRequested(false);
                  setConsent(false);
                  setCode("");
                  setError("");
                  setNotice("");
                }}>{t("login.changeNumber")}</button>
                <button type="button" className="textButton" disabled={pending || resendSeconds > 0} onClick={() => void requestOtp()}>
                  {resendSeconds > 0 ? t("login.resendIn", { s: resendSeconds }) : t("login.resend")}
                </button>
              </div>
              {notice && <p className="inlineMessage">{notice}</p>}
            </form>
          ) : (
            <form onSubmit={requestOtp}>
              <label>{t("login.mobile")}<input name="mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder={t("login.mobilePh")} value={mobile} onChange={(event) => setMobile(event.target.value)} required /></label>
              <label className="consentCheck">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{t("login.consent")}</span>
              </label>
              {error && <p className="formError">{error}</p>}
              <button className="button authButton" type="submit" disabled={pending || !mobile.trim() || !consent}>{pending ? t("login.sending") : t("login.send")}</button>
            </form>
          )
        ) : (
          <form onSubmit={passwordLogin}>
            <label>{t("login.username")}<input name="username" autoComplete="username" required /></label>
            <label>{t("login.password")}<input name="password" type="password" autoComplete="current-password" required /></label>
            {error && <p className="formError">{error}</p>}
            <button className="button authButton" type="submit" disabled={pending}>{pending ? t("login.signingIn") : t("login.withPassword")}</button>
          </form>
        )}
        <button type="button" className="textButton loginModeToggle" onClick={() => {
          setMode((current) => current === "otp" ? "password" : "otp");
          setError("");
          setNotice("");
        }}>{mode === "otp" ? t("login.usePassword") : DEMO_LOGIN_ENABLED ? t("login.useEmail") : SMS_OTP_ENABLED ? t("login.useOtp") : t("login.useGoogle")}</button>
      </section>
    </div>
  );
}

function SearchBox() {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const { t } = useT();
  const paramsRef = useRef(params);
  paramsRef.current = params;

  function apply(text: string) {
    const next = new URLSearchParams(paramsRef.current);
    next.delete("listing");
    if (text.trim()) next.set("q", text.trim());
    else next.delete("q");
    if ((paramsRef.current.get("q") ?? "") !== (next.get("q") ?? "")) setParams(next, { replace: true });
  }

  // Results update as you type (short pause so we do not search on every key).
  useEffect(() => {
    const timer = window.setTimeout(() => apply(value), 350);
    return () => window.clearTimeout(timer);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form className="searchBlock" role="search" onSubmit={(event: FormEvent) => { event.preventDefault(); apply(value); }}>
      <div className="search searchLarge">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
        <input value={value} maxLength={120} onChange={(event) => setValue(event.target.value)} placeholder={t("rs.searchPh")} aria-label={t("search.label")} />
        {value && <button type="button" className="searchClear" aria-label={t("close")} onClick={() => setValue("")}>×</button>}
        <button type="submit">{t("search.button")}</button>
      </div>
      <p className="searchHelp"><span>{t("rs.searchHelp")}</span><span>{t("rs.chars", { n: value.length })}</span></p>
    </form>
  );
}

function categoryIcon(category: Category) {
  if (category.icon_image) {
    return <img src={category.icon_image} alt="" />;
  }
  return <img src={coverForCategory(category.slug, category.name)} alt="" />;
}

const AREAS = ["Safal Parisar", "Gala Haven", "Orchid Whitefield", "Bopal 44", "Aarohi Crest", "Sobo Center", "Shela", "Ghuma"];
const CAT_BLURBS = ["medical-and-health", "tuition-and-coaching", "house-help", "food-and-dining", "home-services", "fitness-and-wellness", "bakery-and-confectionery", "grocery-and-supermarkets"];

function TabIcon({ d }: { d: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
}

function ResidentTabbar() {
  const { t } = useT();
  const location = useLocation();
  const path = location.pathname;
  const items: { href: string; label: string; icon: ReactNode; active: boolean }[] = [
    { href: "/mysobo", label: t("nav.explore"), active: path === "/mysobo" && location.hash !== "#categories", icon: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></> },
    { href: "/mysobo#categories", label: t("nav.categories"), active: path.startsWith("/services") || path.startsWith("/products") || path.startsWith("/categories") || location.hash === "#categories", icon: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></> },
    { href: "/mysobo/saved", label: t("nav.saved"), active: path === "/mysobo/saved", icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /> },
    { href: "/mysobo/owner", label: t("nav.myBusiness"), active: path.startsWith("/mysobo/owner"), icon: <><path d="M4 9.5 5.5 5h13L20 9.5" /><path d="M5.5 11v8.5h13V11M10 19.5v-4h4v4" /><path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5" /></> },
  ];
  return (
    <nav className="tabbar" aria-label={t("nav.home")}>
      {items.map((item) => (
        <Link
          key={item.href}
          to={item.href}
          className={item.active ? "active" : ""}
          aria-current={item.active ? "page" : undefined}
          onClick={() => {
            if (item.href.endsWith("#categories")) {
              window.setTimeout(() => document.getElementById("categories")?.scrollIntoView({ behavior: "smooth" }), 60);
            }
          }}
        >
          <TabIcon d={item.icon} /><span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function openState(business: Business): "open" | "closed" | "" {
  const hours = business.hours ?? [];
  if (!hours.length) return "";
  const now = new Date();
  const today = hours.find((item) => item.dow === (now.getDay() + 6) % 7);
  if (!today || today.closed || !today.opens || !today.closes) return "closed";
  const hm = now.toTimeString().slice(0, 5);
  return today.opens.slice(0, 5) <= hm && hm < today.closes.slice(0, 5) ? "open" : "closed";
}

function useSavedSet() {
  const signedIn = Boolean(sessionStorage.getItem("mysobo-token"));
  const { data } = useQuery({
    queryKey: ["my-saved"],
    queryFn: () => apiGet<Business[]>("/me/saved/"),
    enabled: signedIn,
    retry: false,
  });
  return { signedIn, saved: new Set((data ?? []).map((item) => item.id)) };
}

function BusinessCards({ businesses }: { businesses: Business[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { signedIn, saved } = useSavedSet();
  const { t } = useT();
  if (!businesses.length) {
    return <div className="emptyState"><h2>{t("cards.noneTitle")}</h2><p>{t("cards.noneText")}</p></div>;
  }
  const weekAgo = Date.now() - 7 * 864e5;

  function contact(business: Business, type: "call" | "whatsapp") {
    const number = (type === "call" ? business.phone : business.whatsapp || business.phone) ?? "";
    if (!signedIn || !number) {
      const next = new URLSearchParams(params);
      next.set("dialog", "login");
      setParams(next);
      return;
    }
    const digits = number.replace(/\D/g, "").slice(-10);
    void apiPost(`/businesses/${encodeURIComponent(business.slug)}/events/`, { type }).catch(() => undefined);
    if (type === "call") window.location.assign(`tel:+91${digits}`);
    else window.open(`https://wa.me/91${digits}?text=${encodeURIComponent(t("rs.waText", { name: business.name }))}`, "_blank", "noopener,noreferrer");
  }

  async function toggle(business: Business) {
    if (!signedIn) {
      const next = new URLSearchParams(params);
      next.set("dialog", "login");
      setParams(next);
      return;
    }
    const url = `/businesses/${encodeURIComponent(business.slug)}/saved/`;
    if (saved.has(business.id)) await apiDelete(url);
    else await apiPost(url);
    await queryClient.invalidateQueries({ queryKey: ["my-saved"] });
    await queryClient.invalidateQueries({ queryKey: ["saved", business.slug] });
  }

  return (
    <div className="bizGrid">
      {businesses.map((business) => {
        const isSaved = saved.has(business.id);
        const kindLabel = t(business.kind === "product" ? "kind.product" : business.kind === "both" ? "kind.both" : "kind.service");
        return (
          <article className="bizCard" key={business.id}>
            <button className="bizOpen" type="button" aria-label={t("cards.open", { name: business.name })} onClick={() => navigate(`/business/${encodeURIComponent(business.slug)}`)}>
              <span className="bizCover">
                <img src={coverFor(business)} alt="" loading="lazy" />
                {business.category && <span className="bizTag">{business.category.name}</span>}
                {business.created_at && Date.parse(business.created_at) > weekAgo && <span className="bizNew">{t("cards.new")}</span>}
              </span>
              <span className="bizBody">
                <strong>{business.name}{business.verified && <span className="vTick" title={t("vf.verified")}>✓</span>}</strong>
                {business.address && !business.hide_address && <small className="bizArea">{business.address}</small>}
                <span className="bizStats">
                  {business.verified && <span className="bizVerified">✓ {t("vf.verified")}</span>}
                  {business.review_count ? <span className="bizRating">★ {(business.average_rating ?? 0).toFixed(1)} <em>({business.review_count})</em></span> : null}
                  <span className="bizKind">{kindLabel}</span>
                  {openState(business) && <span className={openState(business) === "open" ? "bizOpenNow" : "bizClosedNow"}>{openState(business) === "open" ? t("lp.openNow") : t("lp.closedNow")}</span>}
                </span>
                <span className="bizDesc">{business.description || t("cards.inSouthBopal", { kind: kindLabel })}</span>
              </span>
            </button>
            <div className="bizActions">
              <button type="button" className="bizAct call" onClick={() => contact(business, "call")}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M6.6 3.5h2.6l1.4 4-2 1.3a12 12 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" /></svg>{t("listing.call")}
              </button>
              <button type="button" className="bizAct wa" onClick={() => contact(business, "whatsapp")}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /></svg>{t("listing.whatsapp")}
              </button>
            </div>
            <button
              type="button"
              className={`bizHeart ${isSaved ? "on" : ""}`}
              aria-pressed={isSaved}
              aria-label={t(isSaved ? "cards.unsave" : "cards.save", { name: business.name })}
              onClick={() => void toggle(business)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
            </button>
          </article>
        );
      })}
    </div>
  );
}

function SavedPage({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const { t } = useT();
  const signedIn = Boolean(sessionStorage.getItem("mysobo-token"));
  const { data = [], isLoading } = useQuery({
    queryKey: ["my-saved"],
    queryFn: () => apiGet<Business[]>("/me/saved/"),
    enabled: signedIn,
    retry: false,
  });
  return (
    <Shell user={user} onAuthChange={onAuthChange}>
      <section className="section savedPage">
        <p className="eyebrow">{t("nav.saved")}</p>
        <h1>{t("saved.title")}</h1>
        <p className="mutedText">{t("saved.copy")}</p>
        {!signedIn ? (
          <div className="emptyState"><img src="/mascot/mithu.png" alt="" width="80" height="80" /><p>{t("saved.signIn")}</p><Link className="button" to="/mysobo/saved?dialog=login">{t("nav.login")}</Link></div>
        ) : isLoading ? <p className="emptyState">{t("home.finding")}</p>
          : data.length ? <BusinessCards businesses={data} />
            : <div className="emptyState"><img src="/mascot/mithu.png" alt="" width="80" height="80" /><p>{t("saved.empty")}</p><Link className="button" to="/mysobo">{t("nav.explore")}</Link></div>}
      </section>
    </Shell>
  );
}

function CatalogCards({
  products = [],
  services = [],
}: {
  products?: BusinessProduct[];
  services?: BusinessService[];
}) {
  const navigate = useNavigate();
  const { t } = useT();
  const items = products.length ? products : services;
  if (!items.length) return null;
  return (
    <div className="businessGrid">
      {products.map((item) => (
        <button className="businessCard catalogCard" type="button" key={item.id} onClick={() => navigate(`/business/${encodeURIComponent(item.business.slug)}`)}>
          <span className="businessAvatar">{item.name.charAt(0)}</span>
          <span className="businessCardCopy">
            <strong>{item.name}</strong>
            <span className="businessDescription">{[item.brand, item.model].filter(Boolean).join(" · ") || item.description}</span>
            <small>{item.business.name}{item.price ? ` · ₹${item.price}` : ""}</small>
          </span>
          <span className="cardArrow">→</span>
        </button>
      ))}
      {services.map((item) => (
        <button className="businessCard catalogCard" type="button" key={item.id} onClick={() => navigate(`/business/${encodeURIComponent(item.business.slug)}`)}>
          <span className="businessAvatar">{item.name.charAt(0)}</span>
          <span className="businessCardCopy">
            <strong>{item.name}</strong>
            <span className="businessDescription">{item.description || item.service_area || t("cards.localService")}</span>
            <small>{item.business.name}{item.price_min ? ` · ${t("cards.from", { price: item.price_min })}` : ""}</small>
          </span>
          <span className="cardArrow">→</span>
        </button>
      ))}
    </div>
  );
}

function phoneDigits(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function phoneHref(phone: string) {
  const digits = phoneDigits(phone);
  const international = digits.length === 10 ? `+91${digits}` : `+${digits}`;
  return `tel:${international}`;
}

function whatsappHref(phone: string) {
  const digits = phoneDigits(phone);
  const international = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${international}`;
}

function ListingDialog({ slug, user, onLogin }: { slug: string; user?: PortalUser; onLogin: () => void }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const { t } = useT();
  const { data: business, isLoading } = useQuery({
    queryKey: ["listing", slug],
    queryFn: () => apiGet<Business>(`/businesses/${encodeURIComponent(slug)}/`),
  });
  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", slug],
    queryFn: () => apiGet<Review[]>(`/businesses/${encodeURIComponent(slug)}/reviews/`),
    enabled: Boolean(business),
  });
  const { data: saved } = useQuery({
    queryKey: ["saved", slug, user?.id],
    queryFn: () => apiGet<{ saved: boolean }>(`/businesses/${encodeURIComponent(slug)}/saved/`),
    enabled: Boolean(business),
  });

  function close() {
    if (location.pathname.startsWith("/business/")) {
      navigate("/mysobo");
      return;
    }
    const next = new URLSearchParams(params);
    next.delete("listing");
    setParams(next);
  }

  async function toggleSaved() {
    if (!user) {
      onLogin();
      return;
    }
    try {
      if (saved?.saved) await apiDelete(`/businesses/${encodeURIComponent(slug)}/saved/`);
      else await apiPost(`/businesses/${encodeURIComponent(slug)}/saved/`);
      await queryClient.invalidateQueries({ queryKey: ["saved", slug] });
      setMessage(saved?.saved ? t("listing.removed") : t("listing.savedMsg"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("err.save"));
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      onLogin();
      return;
    }
    const body = new FormData(event.currentTarget).get("review");
    try {
      await apiPost(`/businesses/${encodeURIComponent(slug)}/reviews/`, { rating, body });
      await queryClient.invalidateQueries({ queryKey: ["reviews", slug] });
      setMessage(t("listing.thanks"));
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("err.review"));
    }
  }

  async function openContact(type: "call" | "whatsapp", href: string, newTab = false) {
    const popup = newTab ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    try {
      await apiPost(`/businesses/${encodeURIComponent(slug)}/events/`, { type });
      if (popup) popup.location.href = href;
      else if (newTab) window.open(href, "_blank", "noopener,noreferrer");
      else window.location.assign(href);
    } catch (cause) {
      popup?.close();
      setMessage(cause instanceof Error ? cause.message : t("err.contact"));
    }
  }

  return (
    <div className="modalBackdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section className="listingModal" role="dialog" aria-modal="true" aria-label={t("listing.dialog")}>
        <button className="modalClose" type="button" onClick={close} aria-label={t("close")}>×</button>
        {isLoading ? <p>{t("listing.loading")}</p> : business ? (
          <>
            <div className="listingCover"><img src={coverFor(business)} alt="" /></div>
            <div className="listingHeader">
              <div>
                <p className="eyebrow">{business.category?.name ?? t("listing.defaultCategory")}</p>
                <div className="businessNameRow"><h2>{business.name}</h2></div>
                {business.review_count ? <p className="bizStats"><span className="bizRating">★ {(business.average_rating ?? 0).toFixed(1)} <em>({t("cards.reviews", { n: business.review_count })})</em></span></p> : null}
              </div>
            </div>
            <p className="listingDescription">{business.description || t("listing.defaultDesc")}</p>
            {business.address && !business.hide_address && <p className="listingAddress">⌖ {business.address}</p>}
            <div className="listingButtons">
              {business.phone && phoneDigits(business.phone).length >= 10 && <a className="button" href={phoneHref(business.phone)} onClick={(event) => {
                event.preventDefault();
                void openContact("call", phoneHref(business.phone));
              }} aria-label={t("listing.callName", { name: business.name })}>☎ {t("listing.call")}</a>}
              {business.whatsapp && phoneDigits(business.whatsapp).length >= 10 && <a className="button whatsapp" href={whatsappHref(business.whatsapp)} target="_blank" rel="noreferrer" onClick={(event) => {
                event.preventDefault();
                void openContact("whatsapp", whatsappHref(business.whatsapp), true);
              }} aria-label={t("listing.whatsappName", { name: business.name })}>◉ {t("listing.whatsapp")}</a>}
              <button type="button" className="button secondaryButton" onClick={toggleSaved}>{saved?.saved ? `♥ ${t("listing.saved")}` : `♡ ${t("listing.save")}`}</button>
            </div>
            {business.phone && phoneDigits(business.phone).length >= 10 && <p className="listingContact">{t("listing.phone")}: <a href={phoneHref(business.phone)} onClick={(event) => {
              event.preventDefault();
              void openContact("call", phoneHref(business.phone));
            }}>{business.phone}</a></p>}
            {business.email && <p className="listingContact">{t("listing.email")}: <a href={`mailto:${business.email}`}>{business.email}</a></p>}
            {business.website && <p className="listingContact">{t("listing.website")}: <a href={business.website} target="_blank" rel="noreferrer">{business.website}</a></p>}
            <section className="reviewSection">
              <h3>{t("listing.reviews")}</h3>
              {reviews.length ? reviews.map((review) => (
                <article className="reviewCard" key={review.id}>
                  <strong>{review.user_name}</strong><span className="reviewStars">{"★".repeat(review.rating)}</span>
                  {review.body && <p>{review.body}</p>}
                </article>
              )) : <p className="mutedText">{t("listing.noReviews")}</p>}
              <form className="reviewForm" onSubmit={submitReview}>
                <label>{t("listing.rating")}
                  <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
                    {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{t("listing.stars", { n: value })}</option>)}
                  </select>
                </label>
                <label>{t("listing.yourReview")}<textarea name="review" placeholder={t("listing.reviewPh")} rows={3} /></label>
                <button className="button" type="submit">{t("listing.post")}</button>
              </form>
              {message && <p className="inlineMessage">{message}</p>}
            </section>
          </>
        ) : <div className="emptyState"><h2>{t("listing.unavailable")}</h2></div>}
      </section>
    </div>
  );
}

function Residents({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const resultsRef = useRef<HTMLElement>(null);
  const { t } = useT();
  const requestedKind = params.get("kind");
  const kind = requestedKind === "service" || requestedKind === "product"
    ? requestedKind
    : "all";
  const selectedCategory = params.get("category") ?? "";
  const selectedSubcategory = params.get("subcategory") ?? "";
  const query = params.get("q") ?? "";
  const area = params.get("area") ?? (() => { try { return localStorage.getItem("mysobo-area") ?? ""; } catch { return ""; } })();
  const [onboarding, setOnboarding] = useState(() => !user && !params.get("dialog") && shouldOnboard());
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const {
    data: categories,
    isLoading: categoriesLoading,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["categories", kind],
    queryFn: () => apiGet<Category[]>(`/categories/?kind=${kind}`),
  });
  const {
    data: businessData,
    isLoading,
    isError: businessesError,
    refetch: refetchBusinesses,
  } = useQuery({
    queryKey: ["businesses", query, selectedCategory, selectedSubcategory, kind, area],
    queryFn: () => {
      const filters = new URLSearchParams();
      if (query) filters.set("q", query);
      if (area) filters.set("location", area);
      if (selectedCategory) filters.set("category", selectedCategory);
      if (selectedSubcategory) filters.set("subcategory", selectedSubcategory);
      filters.set("kind", kind);
      return apiGet<{ results: Business[] } | Business[]>(`/businesses/${filters.size ? `?${filters}` : ""}`);
    },
  });
  const businesses = Array.isArray(businessData) ? businessData : businessData?.results ?? [];
  const allCategories = categories ?? [];
  const visibleCategories = (kind === "service"
    ? allCategories.filter((category) => category.supports_services)
    : kind === "product"
      ? allCategories.filter((category) => category.supports_products)
      : allCategories
  ).slice().sort((a, b) => (b.listing_count ?? 0) - (a.listing_count ?? 0));
  const selectedCategoryRecord = visibleCategories.find((category) => category.slug === selectedCategory);
  const selectedCategoryName = selectedCategoryRecord?.name;
  const visibleSubcategories = selectedCategoryRecord?.subcategories ?? [];
  const selectedSubcategoryName = visibleSubcategories.find((subcategory) => subcategory.slug === selectedSubcategory)?.name;
  const subcategoriesByParent = new Map<string | null, Subcategory[]>();
  for (const subcategory of visibleSubcategories) {
    const siblings = subcategoriesByParent.get(subcategory.parent_id) ?? [];
    siblings.push(subcategory);
    subcategoriesByParent.set(subcategory.parent_id, siblings);
  }
  const orderedSubcategories: { item: Subcategory; depth: number }[] = [];
  const visitedSubcategories = new Set<string>();
  function appendSubcategories(parentId: string | null, depth: number) {
    for (const item of subcategoriesByParent.get(parentId) ?? []) {
      if (visitedSubcategories.has(item.id)) continue;
      visitedSubcategories.add(item.id);
      orderedSubcategories.push({ item, depth });
      appendSubcategories(item.id, depth + 1);
    }
  }
  appendSubcategories(null, 0);

  useEffect(() => {
    if (selectedCategory) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedCategory, selectedSubcategory]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete("listing");
    if (key === "category") next.delete("subcategory");
    if (key === "kind" && selectedCategory) {
      const selected = allCategories.find((category) => category.slug === selectedCategory);
      const supported = value === "all"
        || (value === "service" && selected?.supports_services)
        || (value === "product" && selected?.supports_products);
      if (!supported) {
        next.delete("category");
        next.delete("subcategory");
      } else if (selectedSubcategory) {
        const subcategory = selected?.subcategories.find((item) => item.slug === selectedSubcategory);
        const subcategorySupported = value === "all"
          || (value === "service" && subcategory?.supports_services)
          || (value === "product" && subcategory?.supports_products);
        if (!subcategorySupported) next.delete("subcategory");
      }
    }
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <Shell user={user} onAuthChange={onAuthChange}>
      <section className="hero">
        <div className="heroCopy">
          <p className="heroPill"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6zM19 14l.9 2.6L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.4z" /></svg>{t("rs.pill")}</p>
          <h1>{t("home.title1")}<br />{t("home.title2")}</h1>
          <p className="heroSub">{t("rs.sub")}</p>
          <SearchBox />
          <div className="heroFilters">
          <span className="heroFilterLabel">{t("rs.filterType")}</span>
          <div className="kindTabs" aria-label={t("home.tabsLabel")}>
            {["all", "service", "product"].map((item) => (
              <button
                key={item}
                className={kind === item ? "active" : ""}
                type="button"
                aria-pressed={kind === item}
                onClick={() => setFilter("kind", item)}
              >
                {item === "all" ? t("tab.all") : item === "service" ? t("tab.service") : t("tab.product")}
              </button>
            ))}
          </div>
          <label className="areaPick">
            <span className="srOnly">{t("r3.area")}</span>
            <LeafMark size={16} />
            <select value={area} onChange={(event) => {
              const value = event.target.value;
              try { localStorage.setItem("mysobo-area", value); } catch { /* ignore */ }
              setFilter("area", value);
            }}>
              <option value="">{t("r3.allAreas")}</option>
              {AREAS.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          </div>
        </div>
        <div className="heroArt" aria-hidden="true">
          <div className="heroStage">
            <span className="heroShape a" /><span className="heroShape b" /><span className="heroShape c" />
            <div className="heroPreview">
              <p className="heroPreviewTitle"><LeafMark size={18} />{t("home.previewTitle")}</p>
              <div className="heroPreviewMap"><PinScene /></div>
              <ul>
                {businesses.slice(0, 3).map((business) => (
                  <li key={business.id}>
                    <img src={coverFor(business)} alt="" />
                    <span><b>{business.name}</b><small>{business.category?.name ?? ""}{business.review_count ? ` · ★ ${(business.average_rating ?? 0).toFixed(1)}` : ""}</small></span>
                    <em>{t("listing.call")}</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
      <section className="trustStrip" aria-label={t("home.trustedBy")}>
        <p>{t("home.trustedBy")}</p>
        <ul>
          {["Safal Parisar", "Iscon Platinum", "Shivalik Sharda", "Applewoods", "Sun City", "Shela", "Ghuma"].map((name) => (
            <li key={name}><LeafMark size={16} />{name}</li>
          ))}
        </ul>
      </section>

      <section className="section categorySection" id="categories">
        <div className="sectionTitle">
          <div><h2>{t("rs.browse")}</h2><p className="mutedText sectionSub">{t("rs.browseSub")}</p></div>
          {selectedCategory && <button className="textLink resetFilter" type="button" onClick={() => setFilter("category", "")}>{t("home.clearCategory")}</button>}
        </div>
        <div className="catGrid">
          {(allCategoriesOpen ? visibleCategories : visibleCategories.slice(0, 6)).map((category) => {
            const on = selectedCategory === category.slug;
            return (
              <button
                className={`catCard ${on ? "on" : ""}`}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter("category", on ? "" : category.slug)}
                key={category.id || category.slug}
              >
                <span className="categoryIcon">{categoryIcon(category)}</span>
                <span className="catText">
                  <span className="catTop"><strong>{category.name}</strong><em>{t("rs.active", { n: category.listing_count })}</em></span>
                  {CAT_BLURBS.includes(category.slug) && <span className="catBlurb">{t(`catd.${category.slug}` as MessageKey)}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {!allCategoriesOpen && visibleCategories.length > 6 && (
          <button type="button" className="smallButton seeAllCategories" onClick={() => setAllCategoriesOpen(true)}>{t("home.seeAllCats", { n: visibleCategories.length })}</button>
        )}
        {selectedCategoryRecord && visibleSubcategories.length > 0 && (
          <div className="subcategoryList" aria-label={t("home.subLabel", { name: selectedCategoryName ?? "" })}>
            <button
              type="button"
              className={`subcategoryChip ${selectedSubcategory ? "" : "active"}`}
              onClick={() => setFilter("subcategory", "")}
            >
              {t("home.allIn", { name: selectedCategoryName ?? "" })}
            </button>
            {orderedSubcategories.map(({ item: subcategory, depth }) => (
              <button
                type="button"
                key={subcategory.id}
                className={`subcategoryChip ${selectedSubcategory === subcategory.slug ? "active" : ""}`}
                aria-pressed={selectedSubcategory === subcategory.slug}
                style={{ marginLeft: `${depth * 14}px` }}
                onClick={() => setFilter("subcategory", selectedSubcategory === subcategory.slug ? "" : subcategory.slug)}
              >
                {subcategory.name}
              </button>
            ))}
          </div>
        )}
        {categoriesError && categories === undefined ? (
          <div className="emptyState" role="alert">
            <p>{t("err.categories")}</p>
            <button className="smallButton" type="button" onClick={() => void refetchCategories()}>{t("tryAgain")}</button>
          </div>
        ) : !visibleCategories.length && (
          <p className="emptyState">{categoriesLoading ? t("home.loadingCats") : t("home.noCats")}</p>
        )}
      </section>

      <section className="section listingResults" ref={resultsRef}>
        <div className="sectionTitle">
          <div>
            <p className="eyebrow">
              {selectedCategory
                ? kind === "all" ? t("home.eyCategory") : kind === "service" ? t("home.eyServiceCat") : t("home.eyProductCat")
                : kind === "product" ? t("home.eyShop") : kind === "service" ? t("home.eyFind") : t("home.eyBrowse")}
            </p>
            <h2>{query ? t("home.searchResult", { q: query }) : selectedSubcategoryName ?? selectedCategoryName ?? t("home.trusted")}</h2>
          </div>
          {businessData !== undefined && <span className="mutedText">{t("listings.count", { n: businesses.length })}</span>}
        </div>
        {(selectedCategoryName || query || area) && (
          <div className="activeFilters">
            <span>{t("rs.showing")}</span>
            {selectedCategoryName && <button type="button" className="filterChip" onClick={() => setFilter("category", "")}>{selectedCategoryName} <b aria-hidden="true">×</b><span className="srOnly">{t("rs.clear")}</span></button>}
            {query && <button type="button" className="filterChip" onClick={() => setFilter("q", "")}>“{query}” <b aria-hidden="true">×</b><span className="srOnly">{t("rs.clear")}</span></button>}
            {area && <button type="button" className="filterChip" onClick={() => { try { localStorage.removeItem("mysobo-area"); } catch { /* ignore */ } setFilter("area", ""); }}>{area} <b aria-hidden="true">×</b><span className="srOnly">{t("rs.clear")}</span></button>}
            <button type="button" className="textLink" onClick={() => { try { localStorage.removeItem("mysobo-area"); } catch { /* ignore */ } setParams(new URLSearchParams(kind === "all" ? {} : { kind })); }}>{t("rs.clearAll")}</button>
          </div>
        )}
        {isLoading ? <p className="emptyState">{t("home.finding")}</p> : businessesError && businessData === undefined ? (
          <div className="emptyState" role="alert">
            <h2>{t("err.listingsTitle")}</h2>
            <p>{t("err.checkApi")}</p>
            <button className="smallButton" type="button" onClick={() => void refetchBusinesses()}>{t("tryAgain")}</button>
          </div>
        ) : businesses.length ? <BusinessCards businesses={businesses} /> : (
          <div className="emptyState">
            <h2>{selectedSubcategoryName || selectedCategoryName
              ? t("empty.namedTitle", { name: selectedSubcategoryName ?? selectedCategoryName ?? "" })
              : kind === "all"
                ? t("empty.allTitle")
                : kind === "service" ? t("empty.serviceTitle") : t("empty.productTitle")}</h2>
            <p>{selectedSubcategoryName || selectedCategoryName
              ? t("empty.selectionText")
              : query
                ? t("empty.searchText")
                : kind === "all"
                  ? t("empty.allText")
                  : kind === "service" ? t("empty.serviceText") : t("empty.productText")}</p>
            {selectedCategory && <button className="smallButton" type="button" onClick={() => setFilter("category", "")}>{t("home.browseAll")}</button>}
          </div>
        )}
      </section>
      {onboarding && <Onboarding onDone={(nextStep) => {
        setOnboarding(false);
        if (nextStep) {
          const next = new URLSearchParams(params);
          next.set("dialog", nextStep);
          setParams(next);
        }
      }} />}
      {params.get("listing") && <ListingDialog
        slug={params.get("listing")!}
        user={user}
        onLogin={() => {
          const next = new URLSearchParams(params);
          next.set("dialog", "login");
          setParams(next);
        }}
      />}
    </Shell>
  );
}

type PageResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type CombinedCategoryListings = PageResponse<Business> & {
  products?: BusinessProduct[];
  services?: BusinessService[];
};

function CategoryPage({ kind, user, onAuthChange }: {
  kind: "service" | "product" | "all";
  user?: PortalUser;
  onAuthChange: () => void;
}) {
  const { categorySlug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const subcategorySlugs = (useParams()["*"] ?? "").split("/").filter(Boolean);
  const { t } = useT();
  const categoryBase = kind === "service" ? "/services" : kind === "product" ? "/products" : "/categories";
  const { data: categories = [], isLoading: categoriesLoading, isError: categoryError, refetch: refetchCategories } = useQuery({
    queryKey: ["categories", kind],
    queryFn: () => apiGet<Category[]>(`/categories/?kind=${kind}`),
  });
  const category = categories.find((item) => item.slug === categorySlug);
  const subcategoryMap = new Map((category?.subcategories ?? []).map((item) => [item.id, item]));
  const selectedChain: Subcategory[] = [];
  let currentParentId: string | null = null;
  let invalidSubcategory = false;
  for (const slug of subcategorySlugs) {
    const next = (category?.subcategories ?? []).find((item) =>
      item.slug === slug && item.parent_id === currentParentId
    );
    if (!next) {
      invalidSubcategory = true;
      break;
    }
    selectedChain.push(next);
    currentParentId = next.id;
  }
  const selectedSubcategory = selectedChain[selectedChain.length - 1];
  const searchKey = params.toString();
  const { data: listings, isLoading: listingsLoading, isError: listingsError, refetch: refetchListings } = useQuery<CombinedCategoryListings>({
    queryKey: ["category-listings", kind, categorySlug, selectedSubcategory?.id, searchKey],
    enabled: Boolean(category && !invalidSubcategory),
    queryFn: () => {
      const filters = new URLSearchParams(params);
      filters.set("kind", kind);
      filters.set("category", categorySlug ?? "");
      if (category) filters.set("category_id", category.id);
      if (selectedSubcategory) filters.set("subcategory", selectedSubcategory.slug);
      if (kind === "product") {
        return apiGet<PageResponse<BusinessProduct>>(`/products/?${filters.toString()}`)
          .then((response) => ({ ...response, products: response.results, services: undefined, results: [] as Business[] }));
      }
      if (kind === "service") {
        return apiGet<PageResponse<BusinessService>>(`/services/?${filters.toString()}`)
          .then((response) => ({ ...response, services: response.results, products: undefined, results: [] as Business[] }));
      }
      return apiGet<PageResponse<Business>>(`/businesses/?${filters.toString()}`)
        .then((response) => ({ ...response, products: undefined, services: undefined }));
    },
  });
  const filterFields = (category?.fields ?? []).filter((field) =>
    field.filterable && (!field.subcategory_id || field.subcategory_id === selectedSubcategory?.id)
  );
  const directSubcategories = (category?.subcategories ?? []).filter((item) =>
    item.parent_id === (selectedSubcategory?.id ?? null)
  );
  const breadcrumbs = [
    { label: t("cat.home"), href: `/mysobo?kind=${kind}` },
    { label: category?.name ?? t("cat.category"), href: `${categoryBase}/${categorySlug}` },
    ...selectedChain.map((item, index) => ({
      label: item.name,
      href: `${categoryBase}/${categorySlug}/${selectedChain.slice(0, index + 1).map((part) => part.slug).join("/")}`,
    })),
  ];
  const listingCount = selectedSubcategory?.listing_count ?? category?.listing_count ?? 0;
  const page = Number(params.get("page") ?? 1);
  const totalPages = Math.max(1, Math.ceil((listings?.count ?? 0) / 20));

  function subcategoryPath(item: Subcategory) {
    const chain = [item];
    let parentId = item.parent_id;
    while (parentId) {
      const parent = subcategoryMap.get(parentId);
      if (!parent || chain.some((part) => part.id === parent.id)) break;
      chain.unshift(parent);
      parentId = parent.parent_id;
    }
    return chain.map((part) => part.slug);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const next = new URLSearchParams(params);
    next.delete("page");
    for (const key of ["q", "location", "min_rating", "min_price", "max_price", "ordering"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) next.set(key, value);
      else next.delete(key);
    }
    for (const field of filterFields) {
      const value = String(formData.get(`field_${field.key}`) ?? "").trim();
      if (value) next.set(`field_${field.key}`, value);
      else next.delete(`field_${field.key}`);
    }
    setParams(next);
  }

  function changePage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Shell user={user} onAuthChange={onAuthChange}>
      <section className="section categoryLanding">
        <nav className="breadcrumbs" aria-label={t("cat.breadcrumb")}>
          {breadcrumbs.map((item, index) => (
            <span key={item.href}>
              {index > 0 && <span aria-hidden="true"> / </span>}
              {index === breadcrumbs.length - 1
                ? <strong>{item.label}</strong>
                : <Link to={item.href}>{item.label}</Link>}
            </span>
          ))}
        </nav>
        {categoriesLoading ? <p className="emptyState">{t("cat.loading")}</p> : categoryError ? (
          <div className="emptyState"><p>{t("cat.loadError")}</p><button className="smallButton" type="button" onClick={() => void refetchCategories()}>{t("retry")}</button></div>
        ) : !category || invalidSubcategory ? (
          <div className="emptyState"><h1>{t("cat.notFound")}</h1><p>{t("cat.removed")}</p><Link className="button" to={`/mysobo?kind=${kind}`}>{t("cat.browseCategories")}</Link></div>
        ) : (
          <>
            <header className="categoryPageHeader">
              <div className="categoryPageArt">
                {category.image || category.icon_image
                  ? <img src={category.image || category.icon_image} alt="" />
                  : <span>{category.icon || category.name.charAt(0).toUpperCase()}</span>}
              </div>
              <div>
                <p className="eyebrow">{kind === "all" ? t("cat.eyAll") : kind === "service" ? t("cat.eyService") : t("cat.eyProduct")} · {t("hero.top")}</p>
                <h1>{selectedSubcategory?.name ?? category.name}</h1>
                {selectedSubcategory?.description || (!selectedSubcategory && category.description)
                  ? <p>{selectedSubcategory?.description || category.description}</p>
                  : null}
                <strong>{t("cat.active", { n: listingCount })}</strong>
              </div>
            </header>
            {directSubcategories.length > 0 && (
              <section className="categorySubcategories">
                <h2>{selectedSubcategory ? t("cat.moreIn", { name: selectedSubcategory.name }) : t("cat.browseName", { name: category.name })}</h2>
                <div className="subcategoryCards">
                  {directSubcategories.map((item) => (
                    <button className="subcategoryCard" type="button" key={item.id} onClick={() =>
                      navigate(`${categoryBase}/${category.slug}/${subcategoryPath(item).join("/")}${location.search}`)
                    }>
                      <strong>{item.name}</strong><span>{t("listings.count", { n: item.listing_count })}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section className="categoryResults">
              <form className="categoryFilters" key={searchKey} onSubmit={applyFilters}>
                <h2>{t("cat.filterTitle")}</h2>
                <label>{t("cat.search")}<input name="q" maxLength={120} defaultValue={params.get("q") ?? ""} placeholder={t("cat.searchPh", { name: selectedSubcategory?.name ?? category.name })} /></label>
                <label>{t("cat.location")}<input name="location" defaultValue={params.get("location") ?? ""} placeholder={t("cat.locationPh")} /></label>
                <label>{t("cat.sort")}<select name="ordering" defaultValue={params.get("ordering") ?? "relevance"}>
                  <option value="relevance">{t("sort.relevance")}</option>
                  <option value="rating">{t("sort.rating")}</option>
                  <option value="recent">{t("sort.recent")}</option>
                  <option value="alphabetical">{t("sort.alpha")}</option>
                  {kind === "product" && <><option value="price_low">{t("sort.priceLow")}</option><option value="price_high">{t("sort.priceHigh")}</option></>}
                  {kind === "service" && <><option value="price_low">{t("sort.priceLow")}</option><option value="price_high">{t("sort.priceHigh")}</option></>}
                </select></label>
                <label>{t("cat.minRating")}<select name="min_rating" defaultValue={params.get("min_rating") ?? ""}>
                  <option value="">{t("cat.anyRating")}</option><option value="4">{t("cat.starsPlus", { n: 4 })}</option><option value="3">{t("cat.starsPlus", { n: 3 })}</option>
                </select></label>
                {kind === "product" && <>
                  <label>{t("cat.minPrice")}<input name="min_price" type="number" min="0" step="0.01" defaultValue={params.get("min_price") ?? ""} /></label>
                  <label>{t("cat.maxPrice")}<input name="max_price" type="number" min="0" step="0.01" defaultValue={params.get("max_price") ?? ""} /></label>
                </>}
                {kind === "service" && <>
                  <label>{t("cat.minPrice")}<input name="min_price" type="number" min="0" step="0.01" defaultValue={params.get("min_price") ?? ""} /></label>
                  <label>{t("cat.maxPrice")}<input name="max_price" type="number" min="0" step="0.01" defaultValue={params.get("max_price") ?? ""} /></label>
                </>}
                {filterFields.map((field: CategoryField) => (
                  <label key={field.id}>{field.label}
                    {field.field_type === "choice" ? (
                      <select name={`field_${field.key}`} defaultValue={params.get(`field_${field.key}`) ?? ""}>
                        <option value="">{t("any")}</option>{field.options.map((option) => <option value={option} key={option}>{option}</option>)}
                      </select>
                    ) : field.field_type === "boolean" ? (
                      <select name={`field_${field.key}`} defaultValue={params.get(`field_${field.key}`) ?? ""}>
                        <option value="">{t("any")}</option><option value="true">{t("yes")}</option><option value="false">{t("no")}</option>
                      </select>
                    ) : (
                      <input name={`field_${field.key}`} type={field.field_type === "number" ? "number" : "text"} defaultValue={params.get(`field_${field.key}`) ?? ""} />
                    )}
                  </label>
                ))}
                <div className="filterActions"><button className="button" type="submit">{t("cat.apply")}</button><button className="smallButton" type="button" onClick={() => setParams(new URLSearchParams())}>{t("cat.clearAll")}</button></div>
              </form>
              <div className="categoryListingArea">
                <div className="sectionTitle">
                  <div><p className="eyebrow">{kind === "all" ? t("cat.matchingAll") : kind === "service" ? t("cat.matchingService") : t("cat.matchingProduct")}</p><h2>{selectedSubcategory?.name ?? category.name}</h2></div>
                  <span className="mutedText">{t("cat.results", { n: listings?.count ?? 0 })}</span>
                </div>
                {listingsLoading ? <p className="emptyState">{t("cat.finding")}</p> : listingsError ? (
                  <div className="emptyState"><p>{t("cat.listingsError")}</p><button className="smallButton" type="button" onClick={() => void refetchListings()}>{t("retry")}</button></div>
                ) : (listings?.results.length || listings?.products?.length || listings?.services?.length) ? (
                  <>
                    {kind === "all"
                      ? <BusinessCards businesses={listings?.results ?? []} />
                      : <CatalogCards products={listings?.products} services={listings?.services} />}
                    <nav className="pagination" aria-label={t("cat.pages")}>
                      <button className="smallButton" type="button" disabled={!listings.previous} onClick={() => changePage(page - 1)}>{t("cat.prev")}</button>
                      <span>{t("cat.pageOf", { page, total: totalPages })}</span>
                      <button className="smallButton" type="button" disabled={!listings.next} onClick={() => changePage(page + 1)}>{t("cat.next")}</button>
                    </nav>
                  </>
                ) : (
                  <div className="emptyState">
                    <h2>{t("cat.emptyTitle")}</h2>
                    <p>{selectedSubcategory ? t("cat.emptySub", { name: selectedSubcategory.name }) : t("cat.checkBack")}</p>
                    {selectedSubcategory && <Link className="smallButton" to={`${categoryBase}/${category.slug}`}>{t("cat.returnTo", { name: category.name })}</Link>}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </Shell>
  );
}

export function categoryDataFromForm(form: FormData) {
  const data: Record<string, string | number | boolean> = {};
  const keys = [...form.keys()].filter((key) =>
    key.startsWith("category_field_") && !key.startsWith("category_field_type_")
  );
  for (const key of keys) {
    const fieldKey = key.slice("category_field_".length);
    const rawValue = form.get(key);
    if (rawValue === null || rawValue === "") continue;
    const value = String(rawValue);
    const type = form.get(`category_field_type_${fieldKey}`);
    data[fieldKey] = type === "number" ? Number(value)
      : type === "boolean" ? value === "true"
        : value;
  }
  return data;
}

function BusinessClassificationFields({
  categories,
  defaultCategoryId = "",
  defaultSubcategoryId = "",
  defaultKind = "service",
  defaultCategoryData = {},
}: {
  categories: Category[];
  defaultCategoryId?: string;
  defaultSubcategoryId?: string;
  defaultKind?: Business["kind"];
  defaultCategoryData?: Business["category_data"];
}) {
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [subcategoryId, setSubcategoryId] = useState(defaultSubcategoryId);
  const [kind, setKind] = useState<Business["kind"]>(defaultKind);
  const { t } = useT();
  const eligibleCategories = categories.filter((category) =>
    kind === "service" ? category.supports_services
      : kind === "product" ? category.supports_products
        : category.supports_services || category.supports_products
  );
  const selectedCategory = eligibleCategories.find((category) => category.id === categoryId);
  const eligibleSubcategories = (selectedCategory?.subcategories ?? []).filter((subcategory) =>
    kind === "service" ? subcategory.supports_services
      : kind === "product" ? subcategory.supports_products
        : subcategory.supports_services || subcategory.supports_products
  );
  const selectedSubcategoryId = eligibleSubcategories.some((item) => item.id === subcategoryId)
    ? subcategoryId
    : "";
  const categoryFields = (selectedCategory?.fields ?? []).filter((field) =>
    field.active
    && (field.applies_to === "both" || field.applies_to === kind)
    && (!field.subcategory_id || field.subcategory_id === selectedSubcategoryId)
  );
  return (
    <>
      <label>{t("form.category")}<select name="category_id" value={selectedCategory?.id ?? ""} onChange={(event) => {
        setCategoryId(event.target.value);
        setSubcategoryId("");
      }}><option value="">{t("form.chooseCategory")}</option>{eligibleCategories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>{t("form.type")}<select name="kind" value={kind} onChange={(event) => {
        const nextKind = event.target.value as Business["kind"];
        setKind(nextKind);
        const currentCategory = categories.find((item) => item.id === categoryId);
        const supported = nextKind === "service" ? currentCategory?.supports_services
          : nextKind === "product" ? currentCategory?.supports_products
            : Boolean(currentCategory?.supports_services || currentCategory?.supports_products);
        if (!supported) {
          setCategoryId("");
          setSubcategoryId("");
        } else if (selectedSubcategoryId && !eligibleSubcategories.some((item) =>
          item.id === selectedSubcategoryId && (
            nextKind === "service" ? item.supports_services
              : nextKind === "product" ? item.supports_products
                : item.supports_services || item.supports_products
          )
        )) {
          setSubcategoryId("");
        }
      }}><option value="service">{t("kind.service")}</option><option value="product">{t("kind.product")}</option><option value="both">{t("kind.both")}</option></select></label>
      <label>{t("form.subcategory")}<select name="subcategory_id" value={selectedSubcategoryId} onChange={(event) => setSubcategoryId(event.target.value)}><option value="">{t("form.chooseSub")}</option>{eligibleSubcategories.map((item) => <option value={item.id} key={item.id}>{item.parent_id ? "↳ " : ""}{item.name}</option>)}</select></label>
      {categoryFields.map((field) => {
        const defaultValue = defaultCategoryData?.[field.key];
        return (
          <label key={field.id}>{field.label}{field.required && " *"}
            {field.field_type === "choice" ? (
              <select name={`category_field_${field.key}`} required={field.required} defaultValue={defaultValue === undefined ? "" : String(defaultValue)}>
                <option value="">{t("form.chooseField", { label: field.label.toLowerCase() })}</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : field.field_type === "boolean" ? (
              <select name={`category_field_${field.key}`} required={field.required} defaultValue={defaultValue === undefined ? "" : String(defaultValue)}>
                <option value="">{t("form.choose")}</option><option value="true">{t("yes")}</option><option value="false">{t("no")}</option>
              </select>
            ) : (
              <input
                name={`category_field_${field.key}`}
                type={field.field_type === "number" ? "number" : "text"}
                required={field.required}
                defaultValue={defaultValue === undefined ? "" : String(defaultValue)}
              />
            )}
            <input type="hidden" name={`category_field_type_${field.key}`} value={field.field_type} />
          </label>
        );
      })}
    </>
  );
}

export function EditBusinessForm({ business, onSubmit, open = false, pending = false }: {
  business: Business;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  open?: boolean;
  pending?: boolean;
}) {
  const { t } = useT();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories/") });
  return (
    <details className="editDetails" open={open || undefined}>
      <summary>{t("form.edit")}</summary>
      <form className="stackForm" onSubmit={onSubmit} aria-busy={pending}>
        <label>{t("form.name")}<input name="name" required defaultValue={business.name} /></label>
        <BusinessClassificationFields
          key={business.id}
          categories={categories ?? []}
          defaultCategoryId={business.category?.id ?? ""}
          defaultSubcategoryId={business.subcategory?.id ?? ""}
          defaultKind={business.kind}
          defaultCategoryData={business.category_data}
        />
        <label>{t("form.description")}<textarea name="description" rows={3} defaultValue={business.description} /></label>
        <label>{t("form.phone")}<input name="phone" defaultValue={business.phone} /></label>
        <label>{t("form.whatsapp")}<input name="whatsapp" defaultValue={business.whatsapp} /></label>
        <label>{t("form.address")}<input name="address" defaultValue={business.address ?? ""} /></label>
        <button className="button" type="submit" disabled={pending}>{t("form.save")}</button>
      </form>
    </details>
  );
}

export function BusinessForm({ onSubmit, defaultKind = "service", pending = false }: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  defaultKind?: Business["kind"];
  pending?: boolean;
}) {
  const { data } = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories/") });
  const { t } = useT();
  const choices = data ?? [];
  return (
    <form className="stackForm" onSubmit={onSubmit} aria-busy={pending}>
      <label>{t("form.name")}<input name="name" required maxLength={200} /></label>
      <BusinessClassificationFields categories={choices} defaultKind={defaultKind} />
      <label>{t("form.description")}<textarea name="description" rows={3} /></label>
      <label>{t("form.phone")}<input name="phone" inputMode="tel" /></label>
      <label>{t("form.whatsapp")}<input name="whatsapp" inputMode="tel" /></label>
      <label>{t("form.address")}<input name="address" /></label>
      <button className="button" type="submit" disabled={pending}>{t("form.create")}</button>
    </form>
  );
}

function PortalIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <section className="section pageHero portalHero"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></section>;
}

function PortalFeedback({ error, notice }: { error: string; notice: string }) {
  return <div className="section">{error && <p className="formError">{error}</p>}{notice && <p className="successMessage">{notice}</p>}</div>;
}

type AdminAction = (action: () => Promise<unknown>, success: string) => Promise<void>;

function taxonomyFormData(form: HTMLFormElement) {
  const data = new FormData(form);
  const kind = data.get("listing_type");
  data.set("supports_services", String(kind === "service" || kind === "both"));
  data.set("supports_products", String(kind === "product" || kind === "both"));
  data.delete("listing_type");
  const active = form.querySelector<HTMLInputElement>('input[name="active"]');
  data.set("active", String(active?.checked ?? false));
  for (const field of ["icon_image", "image"]) {
    const file = data.get(field);
    if (file instanceof File && !file.size) data.delete(field);
  }
  return data;
}

function categoryFieldFormData(form: HTMLFormElement) {
  const data = new FormData(form);
  const options = String(data.get("options") ?? "")
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
  data.set("options", JSON.stringify(options));
  for (const name of ["required", "filterable", "active"]) {
    const checkbox = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    data.set(name, String(checkbox?.checked ?? false));
  }
  if (!data.get("subcategory")) data.delete("subcategory");
  return data;
}

export function CategoryManager({ run }: { run: AdminAction }) {
  const [categorySearch, setCategorySearch] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [newSubcategoryCategory, setNewSubcategoryCategory] = useState("");
  const categoriesQuery = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => apiGet<ManagedCategory[]>("/admin/categories/"),
  });
  const subcategoriesQuery = useQuery({
    queryKey: ["admin-subcategories"],
    queryFn: () => apiGet<ManagedSubcategory[]>("/admin/subcategories/"),
  });
  const fieldsQuery = useQuery({
    queryKey: ["admin-category-fields"],
    queryFn: () => apiGet<ManagedCategoryField[]>("/admin/category-fields/"),
  });
  const categories = categoriesQuery.data ?? [];
  const subcategories = subcategoriesQuery.data ?? [];
  const categoryFields = fieldsQuery.data ?? [];
  const visibleCategories = categories.filter((category) =>
    `${category.name} ${category.slug}`.toLowerCase().includes(categorySearch.trim().toLowerCase())
  );
  const visibleSubcategories = subcategories.filter((subcategory) => {
    const categoryName = categories.find((category) => category.id === subcategory.category_id)?.name ?? "";
    return `${subcategory.name} ${subcategory.slug} ${categoryName}`
      .toLowerCase().includes(subcategorySearch.trim().toLowerCase());
  });
  const selectedRoot = categories.find((category) => category.id === newSubcategoryCategory);
  const newParentOptions = subcategories.filter((subcategory) =>
    subcategory.category_id === newSubcategoryCategory && subcategory.active
  );
  const visibleFields = categoryFields.filter((field) => {
    const categoryName = categories.find((category) => category.id === field.category)?.name ?? "";
    return `${field.label} ${field.key} ${categoryName}`
      .toLowerCase().includes(categorySearch.trim().toLowerCase());
  });

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = taxonomyFormData(event.currentTarget);
    await run(() => apiUpload("/admin/categories/", data), "Category added.");
    event.currentTarget.reset();
  }

  async function updateCategory(event: FormEvent<HTMLFormElement>, category: ManagedCategory) {
    event.preventDefault();
    const data = taxonomyFormData(event.currentTarget);
    await run(() => apiUpload(`/admin/categories/${category.id}/`, data, "PATCH"), "Category updated.");
  }

  async function createSubcategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = taxonomyFormData(event.currentTarget);
    await run(() => apiUpload("/admin/subcategories/", data), "Subcategory added.");
    event.currentTarget.reset();
    setNewSubcategoryCategory("");
  }

  async function updateSubcategory(event: FormEvent<HTMLFormElement>, subcategory: ManagedSubcategory) {
    event.preventDefault();
    const data = taxonomyFormData(event.currentTarget);
    await run(() => apiUpload(`/admin/subcategories/${subcategory.id}/`, data, "PATCH"), "Subcategory updated.");
  }

  async function createCategoryField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = categoryFieldFormData(event.currentTarget);
    await run(() => apiUpload("/admin/category-fields/", data), "Category field added.");
    event.currentTarget.reset();
  }

  async function updateCategoryField(event: FormEvent<HTMLFormElement>, field: ManagedCategoryField) {
    event.preventDefault();
    const data = categoryFieldFormData(event.currentTarget);
    await run(() => apiUpload(`/admin/category-fields/${field.id}/`, data, "PATCH"), "Category field updated.");
  }

  return (
    <section className="section portalPanel categoryManager">
      <p className="eyebrow">Expandable directory</p>
      <h2>Manage categories and subcategories</h2>
      <p className="mutedText">Categories and nested product or service types are stored in the database; new entries appear on the home page without a frontend release.</p>
      {categoriesQuery.isError && <p className="formError">Could not load categories: {categoriesQuery.error instanceof Error ? categoriesQuery.error.message : "request failed"}</p>}
      {subcategoriesQuery.isError && <p className="formError">Could not load subcategories: {subcategoriesQuery.error instanceof Error ? subcategoriesQuery.error.message : "request failed"}</p>}
      <div className="categoryManagerGrid">
        <div>
          <h3>Add a main category</h3>
          <form className="stackForm" onSubmit={createCategory}>
            <label>Name<input name="name" required maxLength={200} /></label>
            <label>Description<textarea name="description" rows={2} /></label>
            <label>Slug (optional)<input name="slug" /></label>
            <label>Display order<input name="priority" type="number" defaultValue="0" /></label>
            <label>Listing type<select name="listing_type" defaultValue="product"><option value="product">Product</option><option value="service">Service</option><option value="both">Both</option></select></label>
            <label>Icon name or symbol<input name="icon" maxLength={100} /></label>
            <label>Icon image<input name="icon_image" type="file" accept=".jpg,.jpeg,.png,.webp,image/*" /></label>
            <label>Category image<input name="image" type="file" accept=".jpg,.jpeg,.png,.webp,image/*" /></label>
            <label className="checkLabel"><input name="active" type="checkbox" defaultChecked /> Active and visible</label>
            <button className="button" type="submit">Add category</button>
          </form>
        </div>
        <div>
          <label className="taxonomySearch">Search categories<input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Name or slug" /></label>
          <div className="taxonomyList">
            {visibleCategories.map((category) => (
              <details className="taxonomyItem" key={category.id}>
                <summary><strong>{category.name}</strong><span>{category.active ? "Active" : "Inactive"} · {category.supports_products && category.supports_services ? "Both" : category.supports_products ? "Product" : "Service"}</span></summary>
                <form className="stackForm" onSubmit={(event) => void updateCategory(event, category)}>
                  <label>Name<input name="name" required defaultValue={category.name} /></label>
                  <label>Description<textarea name="description" rows={2} defaultValue={category.description} /></label>
                  <label>Slug<input name="slug" required defaultValue={category.slug} /></label>
                  <label>Display order<input name="priority" type="number" defaultValue={category.priority} /></label>
                  <label>Listing type<select name="listing_type" defaultValue={category.supports_products && category.supports_services ? "both" : category.supports_products ? "product" : "service"}><option value="product">Product</option><option value="service">Service</option><option value="both">Both</option></select></label>
                  <label>Icon name or symbol<input name="icon" defaultValue={category.icon} /></label>
                  <label>Replace icon image<input name="icon_image" type="file" accept=".jpg,.jpeg,.png,.webp,image/*" /></label>
                  <label>Replace category image<input name="image" type="file" accept=".jpg,.jpeg,.png,.webp,image/*" /></label>
                  <label className="checkLabel"><input name="active" type="checkbox" defaultChecked={category.active} /> Active and visible</label>
                  <button className="smallButton" type="submit">Save category</button>
                  {category.active && <button className="smallButton dangerButton" type="button" onClick={() => void run(() => apiDelete(`/admin/categories/${category.id}/`), "Category deactivated.")}>Deactivate</button>}
                </form>
              </details>
            ))}
            {!visibleCategories.length && <p className="mutedText">{categoriesQuery.isLoading ? "Loading categories…" : "No matching categories."}</p>}
          </div>
        </div>
      </div>
      <div className="categoryManagerSubcategories">
        <h3>Add a subcategory or deeper category level</h3>
        <form className="stackForm subcategoryEditor" onSubmit={createSubcategory}>
          <label>Main category<select name="category_id" required value={newSubcategoryCategory} onChange={(event) => setNewSubcategoryCategory(event.target.value)}><option value="">Choose category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}{category.active ? "" : " (inactive)"}</option>)}</select></label>
          <label>Parent level<select name="parent_id" defaultValue=""><option value="">Top subcategory</option>{newParentOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Name<input name="name" required /></label>
          <label>Description<textarea name="description" rows={2} /></label>
          <label>Slug (optional)<input name="slug" /></label>
          <label>Display order<input name="priority" type="number" defaultValue="0" /></label>
          <label>Listing type<select name="listing_type" defaultValue={selectedRoot?.supports_products && !selectedRoot.supports_services ? "product" : "service"}><option value="product">Product</option><option value="service">Service</option><option value="both">Both</option></select></label>
          <label>Icon name or symbol<input name="icon" /></label>
          <label>Icon image<input name="icon_image" type="file" accept=".jpg,.jpeg,.png,.webp,image/*" /></label>
          <label>Category image<input name="image" type="file" accept=".jpg,.jpeg,.png,.webp,image/*" /></label>
          <label className="checkLabel"><input name="active" type="checkbox" defaultChecked /> Active and visible</label>
          <button className="button" type="submit">Add subcategory</button>
        </form>
        <label className="taxonomySearch">Search subcategories<input value={subcategorySearch} onChange={(event) => setSubcategorySearch(event.target.value)} placeholder="Name, category or slug" /></label>
        <div className="taxonomyList">
          {visibleSubcategories.map((subcategory) => {
            const root = categories.find((category) => category.id === subcategory.category_id);
            const parent = subcategories.find((item) => item.id === subcategory.parent_id);
            return (
              <details className="taxonomyItem" key={subcategory.id}>
                <summary><strong>{subcategory.name}</strong><span>{root?.name ?? "Category"}{parent ? ` · under ${parent.name}` : ""} · {subcategory.active ? "Active" : "Inactive"}</span></summary>
                <form className="stackForm subcategoryEditor" onSubmit={(event) => void updateSubcategory(event, subcategory)}>
                  <input type="hidden" name="category_id" value={subcategory.category_id} />
                  <label>Parent level<select name="parent_id" defaultValue={subcategory.parent_id ?? ""}><option value="">Top subcategory</option>{subcategories.filter((item) => item.category_id === subcategory.category_id && item.id !== subcategory.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                  <label>Name<input name="name" required defaultValue={subcategory.name} /></label>
                  <label>Description<textarea name="description" rows={2} defaultValue={subcategory.description} /></label>
                  <label>Slug<input name="slug" required defaultValue={subcategory.slug} /></label>
                  <label>Display order<input name="priority" type="number" defaultValue={subcategory.priority} /></label>
                  <label>Listing type<select name="listing_type" defaultValue={subcategory.supports_products && subcategory.supports_services ? "both" : subcategory.supports_products ? "product" : "service"}><option value="product">Product</option><option value="service">Service</option><option value="both">Both</option></select></label>
                  <label>Icon name or symbol<input name="icon" defaultValue={subcategory.icon} /></label>
                  <label>Replace icon image<input name="icon_image" type="file" accept=".jpg,.jpeg,.png,.webp,image/*" /></label>
                  <label>Replace category image<input name="image" type="file" accept=".jpg,.jpeg,.png,.webp,image/*" /></label>
                  <label className="checkLabel"><input name="active" type="checkbox" defaultChecked={subcategory.active} /> Active and visible</label>
                  <button className="smallButton" type="submit">Save subcategory</button>
                  {subcategory.active && <button className="smallButton dangerButton" type="button" onClick={() => void run(() => apiDelete(`/admin/subcategories/${subcategory.id}/`), "Subcategory deactivated.")}>Deactivate</button>}
                </form>
              </details>
            );
          })}
          {!visibleSubcategories.length && <p className="mutedText">{subcategoriesQuery.isLoading ? "Loading subcategories…" : "No matching subcategories."}</p>}
        </div>
      </div>
      <div className="categoryManagerSubcategories">
        <h3>Configure category-specific listing fields and filters</h3>
        <p className="mutedText">Fields marked as filters appear on the matching category and subcategory pages. Field values are validated and stored with each listing.</p>
        <form className="stackForm subcategoryEditor" onSubmit={createCategoryField}>
          <label>Category<select name="category" required defaultValue=""><option value="">Choose category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label>Subcategory (optional)<select name="subcategory" defaultValue=""><option value="">All subcategories</option>{subcategories.map((subcategory) => <option value={subcategory.id} key={subcategory.id}>{categories.find((category) => category.id === subcategory.category_id)?.name} · {subcategory.name}</option>)}</select></label>
          <label>Field label<input name="label" required placeholder="Brand, service area…" /></label>
          <label>Key (optional)<input name="key" placeholder="Generated from label" /></label>
          <label>Field type<select name="field_type" defaultValue="text"><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes/No</option><option value="choice">Choice list</option></select></label>
          <label>Choice options<input name="options" placeholder="Comma-separated options" /></label>
          <label>Applies to<select name="applies_to" defaultValue="both"><option value="product">Product</option><option value="service">Service</option><option value="both">Both</option></select></label>
          <label>Display order<input name="priority" type="number" defaultValue="0" /></label>
          <label className="checkLabel"><input name="required" type="checkbox" /> Required on listing</label>
          <label className="checkLabel"><input name="filterable" type="checkbox" /> Show as a filter</label>
          <label className="checkLabel"><input name="active" type="checkbox" defaultChecked /> Active</label>
          <button className="button" type="submit">Add field</button>
        </form>
        <label className="taxonomySearch">Search configured fields<input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Field or category name" /></label>
        <div className="taxonomyList">
          {visibleFields.map((field) => (
            <details className="taxonomyItem" key={field.id}>
              <summary><strong>{field.label}</strong><span>{categories.find((category) => category.id === field.category)?.name} · {field.field_type} · {field.active ? "Active" : "Inactive"}</span></summary>
              <form className="stackForm subcategoryEditor" onSubmit={(event) => void updateCategoryField(event, field)}>
                <label>Category<select name="category" required defaultValue={field.category}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
                <label>Subcategory<select name="subcategory" defaultValue={field.subcategory ?? ""}><option value="">All subcategories</option>{subcategories.map((subcategory) => <option value={subcategory.id} key={subcategory.id}>{categories.find((category) => category.id === subcategory.category_id)?.name} · {subcategory.name}</option>)}</select></label>
                <label>Field label<input name="label" required defaultValue={field.label} /></label>
                <label>Key<input name="key" required defaultValue={field.key} /></label>
                <label>Field type<select name="field_type" defaultValue={field.field_type}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes/No</option><option value="choice">Choice list</option></select></label>
                <label>Choice options<input name="options" defaultValue={field.options.join(", ")} /></label>
                <label>Applies to<select name="applies_to" defaultValue={field.applies_to}><option value="product">Product</option><option value="service">Service</option><option value="both">Both</option></select></label>
                <label>Display order<input name="priority" type="number" defaultValue={field.priority} /></label>
                <label className="checkLabel"><input name="required" type="checkbox" defaultChecked={field.required} /> Required on listing</label>
                <label className="checkLabel"><input name="filterable" type="checkbox" defaultChecked={field.filterable} /> Show as a filter</label>
                <label className="checkLabel"><input name="active" type="checkbox" defaultChecked={field.active} /> Active</label>
                <button className="smallButton" type="submit">Save field</button>
                {field.active && <button className="smallButton dangerButton" type="button" onClick={() => void run(() => apiDelete(`/admin/category-fields/${field.id}/`), "Category field deactivated.")}>Deactivate</button>}
              </form>
            </details>
          ))}
          {!visibleFields.length && <p className="mutedText">{fieldsQuery.isLoading ? "Loading category fields…" : "No matching configured fields."}</p>}
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [authVersion, setAuthVersion] = useState(0);
  const hasToken = Boolean(sessionStorage.getItem("mysobo-token"));
  const { data: user } = useQuery({
    queryKey: ["me", authVersion],
    queryFn: () => apiGet<PortalUser>("/auth/me/"),
    enabled: hasToken,
    retry: false,
  });
  const authChanged = () => setAuthVersion((value) => value + 1);
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/mysobo" replace />} />
      <Route path="/mysobo" element={<Residents user={user} onAuthChange={authChanged} />} />
      <Route path="/mysobo/saved" element={<SavedPage user={user} onAuthChange={authChanged} />} />
      <Route path="/mysobo/owner/*" element={<OwnerDashboard user={user} onAuthChange={authChanged} />} />
      <Route path="/mysobo/superadmin/*" element={<SuperAdminDashboard user={user} onAuthChange={authChanged} />} />
      <Route path="/services/:categorySlug/*" element={<CategoryPage kind="service" user={user} onAuthChange={authChanged} />} />
      <Route path="/products/:categorySlug/*" element={<CategoryPage kind="product" user={user} onAuthChange={authChanged} />} />
      <Route path="/categories/:categorySlug/*" element={<CategoryPage kind="all" user={user} onAuthChange={authChanged} />} />
      <Route path="/business/:slug" element={<ListingPage user={user} onAuthChange={authChanged} />} />
      <Route path="*" element={<Navigate to="/mysobo" replace />} />
    </Routes>
  );
}

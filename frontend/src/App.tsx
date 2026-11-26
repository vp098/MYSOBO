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
import { LanguageSwitch, useT } from "./i18n";

function Shell({
  children,
  user,
  onAuthChange,
}: {
  children: ReactNode;
  user?: PortalUser;
  onAuthChange: () => void;
}) {
  const [params, setParams] = useSearchParams();
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
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/mysobo" aria-label={t("nav.home")}>
          <span>mysobo</span><span className="brandDot" aria-hidden="true">.</span>
        </a>
        <nav>
          <a href="/mysobo">{t("nav.residents")}</a>
          <a href="/mysobo/owner">{t("nav.business")}</a>
          {user?.is_superadmin && <a href="/mysobo/superadmin">{t("nav.superadmin")}</a>}
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
      {params.get("dialog") === "login" && (
        <LoginDialog onClose={closeLogin} onSuccess={loginComplete} />
      )}
    </div>
  );
}

function LoginDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
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

  return (
    <div className="modalBackdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="authCard modalCard" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button className="modalClose" type="button" onClick={onClose} aria-label={t("close")}>×</button>
        <p className="eyebrow">{t("login.eyebrow")}</p>
        <h1 id="login-title">{t("login.title")}</h1>
        <p className="mutedText">{t("login.intro")}</p>
        {mode === "otp" ? (
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
        }}>{mode === "otp" ? t("login.usePassword") : t("login.useOtp")}</button>
      </section>
    </div>
  );
}

function SearchBox() {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const { t } = useT();

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(params);
    next.delete("listing");
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    setParams(next);
  }

  return (
    <form className="search searchLarge" onSubmit={submit}>
      <span aria-hidden="true">⌕</span>
      <input value={value} maxLength={120} onChange={(event) => setValue(event.target.value)} placeholder={t("search.placeholder")} aria-label={t("search.label")} />
      <button type="submit">{t("search.button")}</button>
    </form>
  );
}

function categoryIcon(category: Category) {
  if (category.icon_image) {
    return <img src={category.icon_image} alt="" />;
  }
  return category.icon || category.name.trim().charAt(0).toUpperCase() || "•";
}

function BusinessCards({ businesses }: { businesses: Business[] }) {
  const navigate = useNavigate();
  const { t } = useT();
  if (!businesses.length) {
    return <div className="emptyState"><h2>{t("cards.noneTitle")}</h2><p>{t("cards.noneText")}</p></div>;
  }
  return (
    <div className="businessGrid">
      {businesses.map((business) => (
        <button className="businessCard" type="button" key={business.id} aria-label={t("cards.open", { name: business.name })} onClick={() => navigate(`/business/${encodeURIComponent(business.slug)}`)}>
          <span className="businessAvatar">{business.name.charAt(0)}</span>
          <span className="businessCardCopy">
            <span className="businessNameRow">
              <strong>{business.name}</strong>
              {business.verified && <span className="verifiedBadge" title={t("verified")}>✓</span>}
            </span>
            <span className="businessDescription">{business.description || t("cards.inSouthBopal", { kind: t(business.kind === "product" ? "kind.product" : business.kind === "both" ? "kind.both" : "kind.service") })}</span>
            {business.address && !business.hide_address && <small>{business.address}</small>}
          </span>
          <span className="cardArrow">→</span>
        </button>
      ))}
    </div>
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
            <div className="listingHeader">
              <span className="listingAvatar">{business.name.charAt(0)}</span>
              <div>
                <p className="eyebrow">{business.category?.name ?? t("listing.defaultCategory")}</p>
                <div className="businessNameRow"><h2>{business.name}</h2>{business.verified && <span className="verifiedBadge">✓</span>}</div>
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
    queryKey: ["businesses", query, selectedCategory, selectedSubcategory, kind],
    queryFn: () => {
      const filters = new URLSearchParams();
      if (query) filters.set("q", query);
      if (selectedCategory) filters.set("category", selectedCategory);
      if (selectedSubcategory) filters.set("subcategory", selectedSubcategory);
      filters.set("kind", kind);
      return apiGet<{ results: Business[] } | Business[]>(`/businesses/${filters.size ? `?${filters}` : ""}`);
    },
  });
  const businesses = Array.isArray(businessData) ? businessData : businessData?.results ?? [];
  const allCategories = categories ?? [];
  const visibleCategories = kind === "service"
    ? allCategories.filter((category) => category.supports_services)
    : kind === "product"
      ? allCategories.filter((category) => category.supports_products)
      : allCategories;
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
          <p className="eyebrow">{t("home.place")}</p>
          <h1>{t("home.title1")}<br />{t("home.title2")}</h1>
          <SearchBox />
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
        </div>
        <div className="heroArt" aria-hidden="true"><div className="heroCircle"><span>{t("hero.top")}</span><strong>{t("hero.big")}</strong><span>{t("hero.bottom")}</span></div></div>
      </section>

      <section className="section categorySection">
        <div className="sectionTitle">
          <div><p className="eyebrow">{t("home.browseLocal")}</p><h2>{t("home.popular")}</h2></div>
          {selectedCategory && <button className="textLink resetFilter" type="button" onClick={() => setFilter("category", "")}>{t("home.clearCategory")}</button>}
        </div>
        <div className="categoryGrid">
          {visibleCategories.map((category) => (
            <button
              className={`categoryCard ${selectedCategory === category.slug ? "selectedCategory" : ""}`}
              type="button"
              onClick={() => navigate(
                kind === "service" ? `/services/${category.slug}`
                  : kind === "product" ? `/products/${category.slug}`
                    : `/categories/${category.slug}`
              )}
              key={category.id || category.slug}
            >
              <span className="categoryIcon">{categoryIcon(category)}</span>
              <strong>{category.name}</strong>
              <small>{t("listings.count", { n: category.listing_count })}</small>
              <span className="cardArrow">→</span>
            </button>
          ))}
        </div>
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
    for (const key of ["q", "location", "verified", "min_rating", "min_price", "max_price", "ordering"]) {
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
                <label className="checkLabel"><input name="verified" type="checkbox" value="true" defaultChecked={params.get("verified") === "true"} /> {t("cat.verifiedOnly")}</label>
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

function OwnerPortal({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const queryClient = useQueryClient();
  const [selectedBusiness, setSelectedBusiness] = useState("");
  const [search, setSearch] = useState("");
  const { t } = useT();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { data: owned = [], isLoading } = useQuery({
    queryKey: ["owner-businesses"],
    queryFn: () => apiGet<Business[]>("/owner/businesses/"),
    enabled: Boolean(user),
  });
  const { data: plans } = useQuery({
    queryKey: ["owner-plans"],
    queryFn: () => apiGet<{ plans: { plan: string; monthly_price: number }[]; subscriptions: { id: string; business_id: string; plan: string; status: string; expires_on: string | null }[]; requests: { business_id: string; requested_plan: string; status: string }[] }>("/owner/plans/"),
    enabled: Boolean(user),
  });
  const { data: claims = [] } = useQuery({
    queryKey: ["owner-claims"],
    queryFn: () => apiGet<{ id: string; business: string; status: string; note: string }[]>("/owner/claims/"),
    enabled: Boolean(user),
  });
  const { data: posts = [] } = useQuery({
    queryKey: ["owner-posts"],
    queryFn: () => apiGet<{ id: string; business: string; title: string; body: string; status: string }[]>("/owner/posts/"),
    enabled: Boolean(user),
  });
  const { data: matches } = useQuery({
    queryKey: ["owner-search", search],
    queryFn: () => apiGet<Business[]>(`/owner/claimable/?q=${encodeURIComponent(search)}`),
    enabled: Boolean(user && search.trim().length >= 2),
  });
  const matchingBusinesses = matches ?? [];

  async function perform(action: () => Promise<unknown>, success: string) {
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await queryClient.invalidateQueries();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.request"));
    }
  }

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
    await perform(() => apiPost("/businesses/", {
      name, slug, kind: form.get("kind"), description: form.get("description"),
      phone: form.get("phone"), whatsapp: form.get("whatsapp"), address: form.get("address"),
      category_id: form.get("category_id") || undefined,
      subcategory_id: form.get("subcategory_id") || undefined,
      category_data: categoryDataFromForm(form),
    }), t("owner.created"));
    event.currentTarget.reset();
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(() => apiPost("/owner/posts/", {
      business_id: form.get("business_id"), title: form.get("title"), body: form.get("body"),
    }), t("owner.offerSent"));
    event.currentTarget.reset();
  }

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(() => apiPost("/owner/plans/", {
      business_id: form.get("business_id"), plan: form.get("plan"),
    }), t("owner.planSubmitted"));
  }

  return (
    <Shell user={user} onAuthChange={onAuthChange}>
      <PortalIntro eyebrow={t("owner.eyebrow")} title={t("owner.title")} copy={t("owner.copy")} />
      {!user ? (
        <section className="section ownerGate"><h2>{t("owner.signInTitle")}</h2><p>{t("owner.signInText")}</p><a className="button" href="/mysobo?dialog=login">{t("nav.login")}</a></section>
      ) : (
        <>
          <section className="section portalGrid">
            <article className="portalPanel">
              <p className="eyebrow">{t("owner.yourListings")}</p><h2>{t("owner.status")}</h2>
              {isLoading ? <p>{t("owner.loading")}</p> : owned.length ? owned.map((business) => (
                <button className={`ownerBusinessRow ${selectedBusiness === business.id ? "selected" : ""}`} type="button" key={business.id} onClick={() => setSelectedBusiness(business.id)}>
                  <span><strong>{business.name}</strong><small>{business.category?.name ?? t("owner.uncategorized")} · {t("owner.planName", { plan: business.plan ?? "" })}</small></span>
                  <span className={`statusPill ${business.verified ? "approved" : "pending"}`}>{business.verified ? t("verified") : t("owner.underReview")}</span>
                </button>
              )) : <p className="mutedText">{t("owner.noClaimed")}</p>}
              {owned.find((business) => business.id === selectedBusiness) && (
                <EditBusinessForm
                  business={owned.find((business) => business.id === selectedBusiness)!}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void perform(() => apiPatch(`/businesses/${selectedBusiness}/`, {
                      name: form.get("name"),
                      category_id: form.get("category_id") || undefined,
                      subcategory_id: form.get("subcategory_id") || undefined,
                      kind: form.get("kind"),
                      description: form.get("description"),
                      category_data: categoryDataFromForm(form),
                      phone: form.get("phone"),
                      whatsapp: form.get("whatsapp"),
                      address: form.get("address"),
                    }), t("owner.updated"));
                  }}
                />
              )}
            </article>
            <article className="portalPanel">
              <p className="eyebrow">{t("owner.claimEyebrow")}</p><h2>{t("owner.findExisting")}</h2>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("owner.searchName")} />
              {matchingBusinesses.slice(0, 5).map((business) => (
                <div className="claimRow" key={business.id}>
                  <span>{business.name}</span>
                  <button type="button" className="smallButton" onClick={() => perform(
                    () => apiPost("/owner/claims/", { business_id: business.id }),
                    t("owner.claimSubmitted"),
                  )}>{t("owner.claim")}</button>
                </div>
              ))}
              {claims.map((claim) => <p className="compactRow" key={claim.id}>{claim.business} · <span className={`statusPill ${claim.status === "approved" ? "approved" : "pending"}`}>{claim.status}</span>{claim.note && ` · ${claim.note}`}</p>)}
              <p className="mutedText">{t("owner.claimsReviewed")}</p>
            </article>
          </section>
          <section className="section portalGrid">
            <article className="portalPanel">
              <p className="eyebrow">{t("owner.createEyebrow")}</p><h2>{t("owner.addBusiness")}</h2>
              <BusinessForm onSubmit={createBusiness} />
            </article>
            <article className="portalPanel">
              <p className="eyebrow">{t("owner.offersEyebrow")}</p><h2>{t("owner.postOffer")}</h2>
              {owned.length ? <form className="stackForm" onSubmit={submitPost}>
                <label>{t("owner.business")}<select name="business_id" required defaultValue={selectedBusiness}><option value="">{t("owner.chooseListing")}</option>{owned.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <label>{t("owner.offerTitle")}<input name="title" required maxLength={200} /></label>
                <label>{t("owner.details")}<textarea name="body" required rows={3} /></label>
                <button className="button" type="submit">{t("owner.submitOffer")}</button>
              </form> : <p className="mutedText">{t("owner.claimToPost")}</p>}
              {posts.map((post) => <p className="compactRow" key={post.id}>{post.title} <span className="statusPill pending">{post.status}</span></p>)}
            </article>
          </section>
          <section className="section portalGrid">
            <article className="portalPanel">
              <p className="eyebrow">{t("owner.plansEyebrow")}</p><h2>{t("owner.choosePlan")}</h2>
              {owned.length ? <form className="stackForm" onSubmit={submitPlan}>
                <label>{t("owner.business")}<select name="business_id" required><option value="">{t("owner.chooseListing")}</option>{owned.map((item) => <option value={item.id} key={item.id}>{item.name} ({item.plan})</option>)}</select></label>
                <label>{t("owner.plan")}<select name="plan" required>{(plans?.plans ?? []).map((plan) => <option value={plan.plan} key={plan.plan}>{t("owner.perMonth", { plan: plan.plan, price: plan.monthly_price })}</option>)}</select></label>
                <button className="button" type="submit">{t("owner.requestPlan")}</button>
              </form> : <p className="mutedText">{t("owner.addBeforePlan")}</p>}
              {plans?.requests.map((item, index) => <p className="compactRow" key={`${item.business_id}-${index}`}>{t("owner.planRequest", { plan: item.requested_plan, status: item.status })}</p>)}
            </article>
            <article className="portalPanel">
              <p className="eyebrow">{t("owner.howEyebrow")}</p><h2>{t("owner.verifiedTitle")}</h2>
              <p className="mutedText">{t("owner.howText")}</p>
            </article>
          </section>
        </>
      )}
      <PortalFeedback error={error} notice={notice} />
    </Shell>
  );
}

function categoryDataFromForm(form: FormData) {
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

function EditBusinessForm({ business, onSubmit }: {
  business: Business;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useT();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories/") });
  return (
    <details className="editDetails">
      <summary>{t("form.edit")}</summary>
      <form className="stackForm" onSubmit={onSubmit}>
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
        <button className="button" type="submit">{t("form.save")}</button>
      </form>
    </details>
  );
}

function BusinessForm({ onSubmit }: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { data } = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories/") });
  const { t } = useT();
  const choices = data ?? [];
  return (
    <form className="stackForm" onSubmit={onSubmit}>
      <label>{t("form.name")}<input name="name" required maxLength={200} /></label>
      <BusinessClassificationFields categories={choices} />
      <label>{t("form.description")}<textarea name="description" rows={3} /></label>
      <label>{t("form.phone")}<input name="phone" inputMode="tel" /></label>
      <label>{t("form.whatsapp")}<input name="whatsapp" inputMode="tel" /></label>
      <label>{t("form.address")}<input name="address" /></label>
      <button className="button" type="submit">{t("form.create")}</button>
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

function CategoryManager({ run }: { run: AdminAction }) {
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

function SuperAdminPortal({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => apiGet<Category[]>("/categories/") });
  const enabled = Boolean(user?.is_superadmin);
  const { data: dashboard } = useQuery({
    queryKey: ["admin-dashboard"], queryFn: () => apiGet<Record<string, number>>("/admin/dashboard/"), enabled,
  });
  const { data: businesses = [] } = useQuery({
    queryKey: ["admin-businesses"], queryFn: () => apiGet<Business[]>("/admin/businesses/"), enabled,
  });
  const { data: claims = [] } = useQuery({
    queryKey: ["admin-claims"], queryFn: () => apiGet<{ id: string; business: string; user: string; proof_path: string }[]>("/admin/claims/"), enabled,
  });
  const { data: planRequests = [] } = useQuery({
    queryKey: ["admin-plan-requests"], queryFn: () => apiGet<{ id: string; business: string; requested_plan: string }[]>("/admin/plan-requests/"), enabled,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["admin-plans"], queryFn: () => apiGet<{ plan: string; monthly_price: number; active: boolean }[]>("/admin/plans/"), enabled,
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["admin-payments"], queryFn: () => apiGet<{ id: string; business: string; plan: string; amount_paise: number; status: string }[]>("/admin/payments/"), enabled,
  });

  async function run(action: () => Promise<unknown>, success: string) {
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await queryClient.invalidateQueries();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request failed.");
    }
  }

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    await run(() => apiPost("/admin/businesses/", {
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`,
      kind: form.get("kind"),
      category_id: form.get("category_id") || undefined,
      subcategory_id: form.get("subcategory_id") || undefined,
      category_data: categoryDataFromForm(form),
      description: form.get("description"),
      phone: form.get("phone"),
      whatsapp: form.get("whatsapp"),
      address: form.get("address"),
    }), "Field entry created. It is awaiting full verification.");
    event.currentTarget.reset();
  }

  async function importEntries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await run(
      () => apiUpload("/admin/businesses/import/", new FormData(form)),
      "CSV import completed. Imported listings are hidden until verified.",
    );
    form.reset();
  }

  async function updatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => apiPut("/admin/plans/", {
      plan: form.get("plan"),
      monthly_price: Number(form.get("monthly_price")),
      active: form.get("active") === "on",
    }), "Plan pricing updated.");
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => apiPost("/admin/payments/", {
      business_id: form.get("business_id"),
      plan: form.get("plan"),
      amount_paise: Math.round(Number(form.get("amount_rupees")) * 100),
      gst_paise: Math.round(Number(form.get("gst_rupees") || 0) * 100),
      method: form.get("method"),
      gateway_ref: form.get("gateway_ref"),
    }), "Payment recorded and access updated.");
    event.currentTarget.reset();
  }

  return (
    <Shell user={user} onAuthChange={onAuthChange}>
      <PortalIntro eyebrow="Super admin" title="MySobo operations" copy="Manage the expandable service and product catalogue, verify listings and claims, enter field-agent listings, manage plans, and record payments." />
      {!user ? (
        <section className="section ownerGate"><h2>Admin sign-in required</h2><p>Log in with a super-admin account to access operations.</p><a className="button" href="/mysobo?dialog=login">Log in</a></section>
      ) : !user.is_superadmin ? (
        <section className="section ownerGate"><h2>Access restricted</h2><p>This portal is only available to users with the super-admin role.</p></section>
      ) : (
        <>
          <section className="section metricGrid">
            {Object.entries(dashboard ?? {}).map(([label, count]) => <article className="metricCard" key={label}><span>{label.replace(/_/g, " ")}</span><strong>{count}</strong></article>)}
          </section>
          <CategoryManager run={run} />
          <section className="section portalGrid">
                <article className="portalPanel"><p className="eyebrow">Verification queue</p><h2>Businesses awaiting review</h2>
                  {businesses.filter((business) => !business.verified).map((business) => <div className="adminRow" key={business.id}><span><strong>{business.name}</strong><small>{business.source} · {business.phone}</small></span><div className="rowActions"><button className="smallButton" type="button" onClick={() => run(() => apiPost(`/admin/businesses/${business.id}/verify/`, { decision: "verify" }), "Business verified.")}>Verify</button><button className="smallButton dangerButton" type="button" onClick={() => run(() => apiPost(`/admin/businesses/${business.id}/verify/`, { decision: "reject" }), "Listing hidden.")}>Reject</button></div></div>)}
                  {!businesses.some((business) => !business.verified) && <p className="mutedText">No business listings awaiting verification.</p>}
            </article>
            <article className="portalPanel"><p className="eyebrow">Claims</p><h2>Owner claim requests</h2>
              {claims.map((claim) => <div className="adminRow" key={claim.id}><span><strong>{claim.business}</strong><small>Requested by {claim.user}{claim.proof_path ? ` · ${claim.proof_path}` : ""}</small></span><div className="rowActions"><button className="smallButton" type="button" onClick={() => run(() => apiPost("/admin/claims/", { claim_id: claim.id, decision: "approved" }), "Claim approved.")}>Approve</button><button className="smallButton dangerButton" type="button" onClick={() => run(() => apiPost("/admin/claims/", { claim_id: claim.id, decision: "rejected" }), "Claim rejected.")}>Reject</button></div></div>)}
              {!claims.length && <p className="mutedText">No claims awaiting review.</p>}
            </article>
          </section>
          <section className="section portalGrid">
            <article className="portalPanel"><p className="eyebrow">Field-agent entry</p><h2>Add a business from the field</h2>
              <form className="stackForm" onSubmit={createEntry}>
                <label>Business name<input name="name" required /></label>
                <BusinessClassificationFields categories={categoriesQuery.data ?? []} defaultKind="service" />
                <label>Description<textarea name="description" rows={2} /></label>
                <label>Phone<input name="phone" inputMode="tel" /></label>
                <label>WhatsApp<input name="whatsapp" inputMode="tel" /></label>
                <label>Address<input name="address" /></label>
                <button className="button" type="submit">Save field entry</button>
              </form>
              <details className="csvImportDetails">
                <summary>Import listings from CSV</summary>
                <p className="mutedText">Upload up to 500 listings (5 MB). Every row is validated before import; invalid rows prevent the whole batch from being saved.</p>
                <p className="csvColumns">Required: <code>name,kind,category_slug</code>. Optional: <code>slug,subcategory_slug,phone,whatsapp,address,description,category_data</code>.</p>
                <form className="stackForm" onSubmit={importEntries}>
                  <label>CSV file<input name="file" type="file" accept=".csv,text/csv" required /></label>
                  <button className="smallButton" type="submit">Validate and import</button>
                </form>
              </details>
            </article>
            <article className="portalPanel"><p className="eyebrow">Plan requests</p><h2>Owner requests</h2>
              {planRequests.map((item) => <div className="adminRow" key={item.id}><span><strong>{item.business}</strong><small>Requested {item.requested_plan}</small></span><div className="rowActions"><button className="smallButton" type="button" onClick={() => run(() => apiPost("/admin/plan-requests/", { request_id: item.id, decision: "approve" }), "Plan request approved.")}>Approve</button><button className="smallButton dangerButton" type="button" onClick={() => run(() => apiPost("/admin/plan-requests/", { request_id: item.id, decision: "reject" }), "Plan request rejected.")}>Reject</button></div></div>)}
              {!planRequests.length && <p className="mutedText">No plan changes awaiting review.</p>}
            </article>
          </section>
          <section className="section portalGrid">
            <article className="portalPanel"><p className="eyebrow">Pricing controls</p><h2>Manage monthly plans</h2>
              <form className="stackForm" onSubmit={updatePlan}>
                <label>Plan<select name="plan" required>{plans.map((plan) => <option value={plan.plan} key={plan.plan}>{plan.plan}</option>)}</select></label>
                <label>Monthly price (₹)<input name="monthly_price" type="number" min="0" required defaultValue={plans[0]?.monthly_price ?? 0} /></label>
                <label className="checkLabel"><input name="active" type="checkbox" defaultChecked /> Available to owners</label>
                <button className="button" type="submit">Save plan</button>
              </form>
              {plans.map((plan) => <p className="compactRow" key={plan.plan}>{plan.plan}: ₹{plan.monthly_price}/month · {plan.active ? "active" : "inactive"}</p>)}
            </article>
            <article className="portalPanel"><p className="eyebrow">Payment control</p><h2>Record payment and access</h2>
              <form className="stackForm" onSubmit={recordPayment}>
                <label>Business<select name="business_id" required><option value="">Choose business</option>{businesses.map((business) => <option value={business.id} key={business.id}>{business.name}</option>)}</select></label>
                <label>Plan<select name="plan" required>{plans.map((plan) => <option value={plan.plan} key={plan.plan}>{plan.plan}</option>)}</select></label>
                <label>Amount (₹)<input name="amount_rupees" type="number" min="0" step="0.01" required /></label>
                <label>GST (₹)<input name="gst_rupees" type="number" min="0" step="0.01" defaultValue="0" /></label>
                <label>Method<input name="method" required defaultValue="manual" /></label>
                <label>Gateway reference<input name="gateway_ref" /></label>
                <button className="button" type="submit">Record payment</button>
              </form>
              <h3>Recent payments</h3>
              {payments.slice(0, 5).map((payment) => <p className="compactRow" key={payment.id}>{payment.business} · {payment.plan} · ₹{(payment.amount_paise / 100).toFixed(2)} · {payment.status}</p>)}
            </article>
          </section>
        </>
      )}
      {error && <PortalFeedback error={error} notice="" />}
      {message && <PortalFeedback error="" notice={message} />}
    </Shell>
  );
}

function BusinessDetailRoute({ user, onAuthChange }: {
  user?: PortalUser;
  onAuthChange: () => void;
}) {
  const { slug } = useParams();
  const navigate = useNavigate();
  if (!slug) return <Navigate to="/mysobo" replace />;
  return (
    <Shell user={user} onAuthChange={onAuthChange}>
      <ListingDialog
        slug={slug}
        user={user}
        onLogin={() => navigate("/mysobo?dialog=login")}
      />
    </Shell>
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
      <Route path="/mysobo/owner" element={<OwnerPortal user={user} onAuthChange={authChanged} />} />
      <Route path="/mysobo/superadmin" element={<SuperAdminPortal user={user} onAuthChange={authChanged} />} />
      <Route path="/services/:categorySlug/*" element={<CategoryPage kind="service" user={user} onAuthChange={authChanged} />} />
      <Route path="/products/:categorySlug/*" element={<CategoryPage kind="product" user={user} onAuthChange={authChanged} />} />
      <Route path="/categories/:categorySlug/*" element={<CategoryPage kind="all" user={user} onAuthChange={authChanged} />} />
      <Route path="/business/:slug" element={<BusinessDetailRoute user={user} onAuthChange={authChanged} />} />
      <Route path="*" element={<Navigate to="/mysobo" replace />} />
    </Routes>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, LockKeyhole, Search, Tag } from "lucide-react";
import { apiGet, apiPatch, type Business, type PortalUser } from "./services/api";
import { BusinessCards, Shell } from "./App";
import { DashSidebar, DashTabbar, useScrollMainToTop, type DashItem } from "./dashboard";
import { IconBadge } from "./iconBadge";
import { LANGUAGES, useT, type MessageKey } from "./i18n";
import { ME_KEY, ROUTES } from "./session";
import { ThemePicker } from "./theme";
import { MyTickets, TicketForm, TicketStatus, type Ticket } from "./support";
import { AvatarPicker } from "./ownerFlows";

/** Resident dashboard at /sobo/resident/*: home, search, saved, offers, activity, support, profile. */

type FeedOffer = { id: string; title: string; body: string; starts_on: string | null; expires_on: string | null; business: { name: string; slug: string; kind: string; category: string } };
type Activity = { type: "saved" | "review" | "call" | "whatsapp" | "ticket"; at: string; title: string; slug?: string; rating?: number; code?: string; status?: Ticket["status"] };

const to = (path: string) => (path === "__services" ? "/services" : path === "__products" ? "/products" : path ? `${ROUTES.resident}/${path}` : ROUTES.resident);

function useDay() {
  const { lang } = useT();
  const locale = lang === "gu" ? "gu-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  return (value?: string | null) => value ? new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short" }) : "";
}

export function ResidentDashboard({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const { t } = useT();
  const section = (useParams()["*"] ?? "").split("/")[0];
  useScrollMainToTop(section);

  if (!user) {
    return (
      <Shell user={user} onAuthChange={onAuthChange}>
        <section className="section savedPage">
          <div className="emptyState"><IconBadge icon={LockKeyhole} /><p>{t("saved.signIn")}</p><Link className="button" to={`${ROUTES.resident}?dialog=login`}>{t("nav.login")}</Link></div>
        </section>
      </Shell>
    );
  }

  const items: DashItem[] = [
    { path: "", label: t("rd.home"), icon: "grid" },
    { path: "search", label: t("rd.search"), icon: "search" },
    { path: "__services", label: t("main.service"), icon: "user" },
    { path: "__products", label: t("main.product"), icon: "store" },
    { path: "saved", label: t("nav.saved"), icon: "heart" },
    { path: "offers", label: t("rd.offers"), icon: "tag" },
    { path: "activity", label: t("rd.activity"), icon: "clock" },
    { path: "support", label: t("sp.title"), icon: "help" },
    { path: "profile", label: t("rd.profile"), icon: "user" },
  ];
  const active = items.some((item) => item.path === section) ? section : "";
  const initial = (user.name || user.email || user.username).charAt(0).toUpperCase();

  return (
    <Shell user={user} onAuthChange={onAuthChange} dashboard
      bottomNav={<DashTabbar label={t("nav.home")} moreLabel={t("od.tab.more")} active={active} to={to}
        tabs={[items[0], items[1], items[4], items[5]]} more={[items[2], items[3], ...items.slice(6)]} />}>
      <div className="odLayout">
        <DashSidebar
          label={t("nav.home")}
          head={<Link className="odUser" to={to("profile")}><span className="odAvatar">{user.avatar ? <img src={user.avatar} alt="" /> : initial}</span><span className="odUserName">{user.name || user.email}</span></Link>}
          groups={[{ items }]}
          active={active}
          to={to}
        />
        <div className="odMain">
          {active === "" && <Home user={user} />}
          {active === "search" && <SearchSection />}
          {active === "saved" && <Saved />}
          {active === "offers" && <Offers />}
          {active === "activity" && <ActivityList />}
          {active === "support" && <div className="tkLayout"><TicketForm /><section className="odCard"><h2>{t("sp.mineTab")}</h2><div className="tkScroll"><MyTickets /></div></section></div>}
          {active === "profile" && <Profile user={user} />}
        </div>
      </div>
    </Shell>
  );
}

function SearchForm({ initial = "", initialKind = "service", onSearch }: { initial?: string; initialKind?: string; onSearch: (q: string, kind: string) => void }) {
  const { t } = useT();
  const [kind, setKind] = useState(initialKind);
  return (
    <form className="rdSearch" onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSearch(String(new FormData(event.currentTarget).get("q") ?? "").trim(), kind);
    }}>
      <div className="mainKinds" role="radiogroup" aria-label={t("home.tabsLabel")}>
        {(["service", "product"] as const).map((item) => (
          <button key={item} type="button" role="radio" aria-checked={kind === item} className={kind === item ? "on" : ""} onClick={() => setKind(item)}>
            <b>{t(item === "service" ? "main.service" : "main.product")}</b>
          </button>
        ))}
      </div>
      <div className="rdSearchRow">
        <input name="q" defaultValue={initial} placeholder={t("rd.searchPh")} aria-label={t("rd.search")} />
        <button type="submit" className="odBtn"><Search size={16} />{t("rd.search")}</button>
      </div>
    </form>
  );
}

function Home({ user }: { user: PortalUser }) {
  const { t } = useT();
  const navigate = useNavigate();
  const { data: saved = [] } = useQuery({ queryKey: ["my-saved"], queryFn: () => apiGet<Business[]>("/me/saved/") });
  const { data: tickets = [] } = useQuery({ queryKey: ["my-tickets"], queryFn: () => apiGet<Ticket[]>("/support/tickets/") });
  const { data: offers = [] } = useQuery({ queryKey: ["offers-feed", "all"], queryFn: () => apiGet<FeedOffer[]>("/offers/") });
  const openTickets = tickets.filter((item) => !["resolved", "closed"].includes(item.status)).length;
  const first = (user.name || "").split(" ")[0];
  return (
    <>
      <header className="rdHello">
        <h1>{first ? t("rd.helloName", { name: first }) : t("rd.hello")}</h1>
        <p className="mutedText">{t("rd.helloSub")}</p>
        <SearchForm onSearch={(q, kind) => navigate(`${to("search")}?q=${encodeURIComponent(q)}&kind=${kind}`)} />
      </header>
      <section className="odKpis rdKpis">
        <Link className="odKpi" to={to("saved")}><div className="odKpiTop"><span>{t("nav.saved")}</span><Heart size={18} /></div><strong>{saved.length}</strong></Link>
        <Link className="odKpi" to={to("offers")}><div className="odKpiTop"><span>{t("rd.liveOffers")}</span><Tag size={18} /></div><strong>{offers.length}</strong></Link>
        <Link className="odKpi" to={to("support")}><div className="odKpiTop"><span>{t("rd.openRequests")}</span></div><strong>{openTickets}</strong></Link>
      </section>
      <div className="odSplit">
        <section className="odCard">
          <div className="odCardHead"><h2>{t("rd.newOffers")}</h2><Link className="odLink" to={to("offers")}>{t("rd.seeAll")}</Link></div>
          <OfferList offers={offers.slice(0, 4)} />
        </section>
        <section className="odCard">
          <div className="odCardHead"><h2>{t("nav.saved")}</h2><Link className="odLink" to={to("saved")}>{t("rd.seeAll")}</Link></div>
          {saved.length ? (
            <ul className="rdMini">{saved.slice(0, 5).map((item) => <li key={item.id}><Link to={ROUTES.business(item.slug)}><b>{item.name}</b><small>{item.category?.name ?? ""}</small></Link></li>)}</ul>
          ) : <p className="mutedText">{t("saved.empty")}</p>}
        </section>
      </div>
    </>
  );
}

function SearchSection() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const kind = params.get("kind") === "product" ? "product" : "service";
  const { data, isFetching } = useQuery({
    queryKey: ["resident-search", q, kind],
    queryFn: () => apiGet<{ results: Business[] } | Business[]>(`/businesses/?kind=${kind}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });
  const rows = Array.isArray(data) ? data : data?.results ?? [];
  return (
    <>
      <h1 className="rdTitle">{t("rd.search")}</h1>
      <SearchForm key={`${q}-${kind}`} initial={q} initialKind={kind} onSearch={(next, nextKind) => setParams(next ? { q: next, kind: nextKind } : { kind: nextKind })} />
      <p className="odRowMeta">{isFetching ? t("home.finding") : t("listings.count", { n: rows.length })}</p>
      {!isFetching && <BusinessCards businesses={rows} />}
    </>
  );
}

function Saved() {
  const { t } = useT();
  const { data = [], isLoading } = useQuery({ queryKey: ["my-saved"], queryFn: () => apiGet<Business[]>("/me/saved/"), retry: false });
  return (
    <section className="savedPage">
      <h1 className="rdTitle">{t("saved.title")}</h1>
      <p className="mutedText">{t("saved.copy")}</p>
      {isLoading ? <p className="emptyState">{t("home.finding")}</p>
        : data.length ? <BusinessCards businesses={data} />
          : <div className="emptyState"><IconBadge icon={Heart} /><p>{t("saved.empty")}</p><Link className="button" to={to("search")}>{t("rd.search")}</Link></div>}
    </section>
  );
}

function OfferList({ offers }: { offers: FeedOffer[] }) {
  const { t } = useT();
  const day = useDay();
  if (!offers.length) return <p className="mutedText">{t("rd.noOffers")}</p>;
  return (
    <ul className="rdOffers">
      {offers.map((offer) => (
        <li key={offer.id}>
          <Link to={ROUTES.business(offer.business.slug)}>
            <span className="rdOfferTag"><Tag size={14} />{offer.business.name}</span>
            <b>{offer.title}</b>
            {offer.body && <p>{offer.body}</p>}
            <small>{[offer.business.category, offer.expires_on ? t("r3.until", { date: day(offer.expires_on) }) : ""].filter(Boolean).join(" · ")}</small>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Offers() {
  const { t } = useT();
  const [scope, setScope] = useState<"all" | "saved">("all");
  const { data = [], isLoading } = useQuery({ queryKey: ["offers-feed", scope], queryFn: () => apiGet<FeedOffer[]>(scope === "saved" ? "/offers/?saved=1" : "/offers/") });
  return (
    <>
      <div className="rdTitleRow">
        <h1 className="rdTitle">{t("rd.offers")}</h1>
        <div className="ofTabs" role="tablist">
          {(["all", "saved"] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={scope === key} className={scope === key ? "on" : ""} onClick={() => setScope(key)}>{t(key === "all" ? "rd.offersAll" : "rd.offersSaved")}</button>)}
        </div>
      </div>
      {isLoading ? <p className="mutedText">{t("home.finding")}</p> : <section className="odCard"><OfferList offers={data} /></section>}
    </>
  );
}

const ACTIVITY_KEY: Record<Activity["type"], MessageKey> = {
  saved: "rd.act.saved", review: "rd.act.review", call: "rd.act.call", whatsapp: "rd.act.whatsapp", ticket: "rd.act.ticket",
};

function ActivityList() {
  const { t } = useT();
  const day = useDay();
  const { data = [], isLoading } = useQuery({ queryKey: ["my-activity"], queryFn: () => apiGet<Activity[]>("/me/activity/") });
  return (
    <>
      <h1 className="rdTitle">{t("rd.activity")}</h1>
      <section className="odCard">
        {isLoading ? <p className="mutedText">{t("home.finding")}</p> : data.length ? (
          <ul className="rdActivity">
            {data.map((item, index) => (
              <li key={`${item.type}-${item.at}-${index}`}>
                <span className="rdActDot" data-type={item.type} />
                <div>
                  <p>{t(ACTIVITY_KEY[item.type], { name: item.title })}{item.code ? ` (${item.code})` : ""}</p>
                  <small>{day(item.at)}</small>
                </div>
                {item.slug ? <Link className="odLink" to={ROUTES.business(item.slug)}>{t("rd.open")}</Link> : item.status ? <TicketStatus status={item.status} /> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mutedText">{t("rd.noActivity")}</p>}
      </section>
    </>
  );
}

function Profile({ user }: { user: PortalUser }) {
  const { t, lang, setLang } = useT();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");
    try {
      await apiPatch("/me/profile/", { name: new FormData(event.currentTarget).get("name") });
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      setNotice(t("rd.saved"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.request"));
    }
  }

  return (
    <>
      <h1 className="rdTitle">{t("rd.profile")}</h1>
      <div className="odSplit">
        <section className="odCard">
          <AvatarPicker user={user} />
          <form className="stackForm" onSubmit={saveName}>
            <label>{t("au.name")}<input name="name" defaultValue={user.name ?? ""} minLength={2} maxLength={150} required /></label>
            {user.email && <p className="odRowMeta">{t("au.email")}: {user.email}</p>}
            {user.mobile && <p className="odRowMeta">{t("login.mobile")}: {user.mobile}</p>}
            {notice && <p className="successMessage">{notice}</p>}
            {error && <p className="formError">{error}</p>}
            <button className="odBtn" type="submit">{t("rd.saveName")}</button>
          </form>
        </section>
        <section className="odCard">
          <fieldset className="themePicker">
            <legend>{t("lang.label")}</legend>
            <div className="themeOptions">
              {LANGUAGES.map((item) => (
                <button key={item.code} type="button" lang={item.code} className={lang === item.code ? "on" : ""} aria-pressed={lang === item.code} onClick={() => setLang(item.code)}>{item.label}</button>
              ))}
            </div>
          </fieldset>
          <ThemePicker user={user} />
        </section>
      </div>
    </>
  );
}

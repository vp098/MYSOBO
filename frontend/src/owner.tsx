import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { apiGet, apiPatch, apiPost, type Business, type PortalUser } from "./services/api";
import { LANGUAGES, useT, type MessageKey } from "./i18n";
import { BusinessForm, EditBusinessForm, Shell, categoryDataFromForm } from "./App";

/*
 * Business owner dashboard at /mysobo/owner/*.
 * Layout follows the owner-portal reference (sidebar + pages); colours come
 * from the MySobo palette tokens in styles.css.
 */

type PlanKey = "free" | "pro" | "premium";
type OwnerPlans = {
  plans: { plan: string; monthly_price: number }[];
  subscriptions: { id: string; business_id: string; plan: string; status: string; expires_on: string | null }[];
  requests: { id?: string; business_id: string; requested_plan: string; status: string; created_at?: string }[];
};
type OwnerClaim = { id: string; business: string; status: string; note: string; created_at?: string };
type OwnerPost = { id: string; business: string; title: string; body: string; status: string; created_at?: string };

const SECTIONS = [
  { path: "", key: "od.nav.overview", icon: "grid" },
  { path: "businesses", key: "od.nav.businesses", icon: "store" },
  { path: "add", key: "od.nav.add", icon: "plus" },
  { path: "claim", key: "od.nav.claim", icon: "shield" },
  { path: "offers", key: "od.nav.offers", icon: "tag" },
  { path: "plans", key: "od.nav.plans", icon: "card" },
  { path: "profile", key: "od.nav.profile", icon: "user" },
  { path: "help", key: "od.nav.help", icon: "help" },
] as const satisfies readonly { path: string; key: MessageKey; icon: string }[];

const ICONS: Record<string, ReactNode> = {
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  store: <><path d="M4 9.5 5.5 5h13L20 9.5" /><path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5" /><path d="M5.5 12v7.5h13V12M10 19.5v-4h4v4" /></>,
  plus: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></>,
  shield: <><path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  tag: <><path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.4 1.4 0 0 1 0 2l-6.6 6.6a1.4 1.4 0 0 1-2 0z" /><circle cx="8.3" cy="8.3" r="1.5" /></>,
  card: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M3.5 10h17M7 15h3" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" /><circle cx="12" cy="16.8" r=".6" fill="currentColor" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.2 2.4 2.4 4.6-4.8" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  hourglass: <><path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 4 5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5-4 8.5s4 4 4 8.5" /></>,
  star: <><path d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.7 5.4-.7z" /></>,
  eyeOff: <><path d="M4 4l16 16M10.6 6.2A9.6 9.6 0 0 1 12 6c4.5 0 7.6 3.6 8.5 6-.4 1-1.1 2.2-2.2 3.3M6.6 7.7C5 8.9 4 10.5 3.5 12c.9 2.4 4 6 8.5 6 1.5 0 2.8-.4 4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.5 3.6 5.3 3.6 8.5s-1.2 6-3.6 8.5c-2.4-2.5-3.6-5.3-3.6-8.5s1.2-6 3.6-8.5z" /></>,
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

const PLAN_RANK: Record<PlanKey, number> = { free: 0, pro: 1, premium: 2 };

function planOf(business: Business): PlanKey {
  return business.plan ?? "free";
}

function businessStatus(business: Business): "verified" | "review" {
  return business.verified ? "verified" : "review";
}

function useDate() {
  const { lang } = useT();
  const locale = lang === "gu" ? "gu-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  return (value?: string | null) => value ? new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "";
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const map: Record<string, { cls: string; key: MessageKey; icon: string }> = {
    verified: { cls: "ok", key: "verified", icon: "check" },
    approved: { cls: "ok", key: "od.status.approved", icon: "check" },
    review: { cls: "wait", key: "owner.underReview", icon: "clock" },
    pending: { cls: "wait", key: "od.status.pending", icon: "clock" },
    rejected: { cls: "bad", key: "od.status.rejected", icon: "help" },
  };
  const item = map[status] ?? map.pending;
  return <span className={`odBadge ${item.cls}`}><Icon name={item.icon} size={14} />{t(item.key)}</span>;
}

function PlanBadge({ plan }: { plan: PlanKey }) {
  const { t } = useT();
  return <span className={`odPlan ${plan}`}>{plan !== "free" && <Icon name="star" size={12} />}{t(`od.plan.${plan}` as MessageKey)}</span>;
}

export function OwnerDashboard({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const section = (useParams()["*"] ?? "").split("/")[0];
  const { t } = useT();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const navRef = useRef<HTMLElement>(null);

  // On phones the sidebar is a horizontal strip; keep the current page's tab in view.
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>("a.active");
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2;
  }, [section, user]);

  const enabled = Boolean(user);
  const { data: owned = [], isLoading } = useQuery({ queryKey: ["owner-businesses"], queryFn: () => apiGet<Business[]>("/owner/businesses/"), enabled });
  const { data: plans } = useQuery({ queryKey: ["owner-plans"], queryFn: () => apiGet<OwnerPlans>("/owner/plans/"), enabled });
  const { data: claims = [] } = useQuery({ queryKey: ["owner-claims"], queryFn: () => apiGet<OwnerClaim[]>("/owner/claims/"), enabled });
  const { data: posts = [] } = useQuery({ queryKey: ["owner-posts"], queryFn: () => apiGet<OwnerPost[]>("/owner/posts/"), enabled });

  async function perform(action: () => Promise<unknown>, success: string) {
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await queryClient.invalidateQueries();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.request"));
      return false;
    }
  }

  if (!user) {
    return <Shell user={user} onAuthChange={onAuthChange}><OwnerWelcome /></Shell>;
  }

  const data = { owned, plans, claims, posts, isLoading, perform };
  const active = SECTIONS.find((item) => item.path === section) ?? SECTIONS[0];

  return (
    <Shell user={user} onAuthChange={onAuthChange}>
      <div className="odLayout">
        <aside className="odSide" aria-label={t("od.workspace")} ref={navRef}>
          <p className="odSideLabel">{t("od.workspace")}</p>
          <nav>
            {SECTIONS.map((item) => (
              <Link
                key={item.path}
                to={item.path ? `/mysobo/owner/${item.path}` : "/mysobo/owner"}
                className={item === active ? "active" : ""}
                aria-current={item === active ? "page" : undefined}
                onClick={() => { setNotice(""); setError(""); }}
              >
                <Icon name={item.icon} />
                <span>{t(item.key)}</span>
                {item.path === "businesses" && owned.length > 0 && <em>{owned.length}</em>}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="odMain">
          <p className="odCrumbs"><Link to="/mysobo/owner">{t("od.portal")}</Link><span aria-hidden="true">›</span><span>{t(active.key)}</span></p>
          {(error || notice) && (
            <div className="odFeedback" role="status">
              {error && <p className="formError">{error}</p>}
              {notice && <p className="successMessage">{notice}</p>}
            </div>
          )}
          {active.path === "" && <Overview user={user} {...data} />}
          {active.path === "businesses" && <MyBusinesses {...data} />}
          {active.path === "add" && <AddBusiness {...data} />}
          {active.path === "claim" && <ClaimBusiness {...data} />}
          {active.path === "offers" && <Offers {...data} />}
          {active.path === "plans" && <Plans {...data} />}
          {active.path === "profile" && <Profile user={user} />}
          {active.path === "help" && <Help />}
        </div>
      </div>
    </Shell>
  );
}

type DashData = {
  owned: Business[];
  plans?: OwnerPlans;
  claims: OwnerClaim[];
  posts: OwnerPost[];
  isLoading: boolean;
  perform: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
};

function PageHead({ title, copy, children }: { title: string; copy?: string; children?: ReactNode }) {
  return (
    <header className="odPageHead">
      <div><h1>{title}</h1>{copy && <p>{copy}</p>}</div>
      {children && <div className="odPageActions">{children}</div>}
    </header>
  );
}

/* ---------- Signed out ---------- */

function OwnerWelcome() {
  const { t } = useT();
  const steps: MessageKey[] = ["od.step1", "od.step2", "od.step3", "od.step4", "od.step5"];
  const perks: { icon: string; title: MessageKey; text: MessageKey }[] = [
    { icon: "shield", title: "od.perk1", text: "od.perk1Text" },
    { icon: "store", title: "od.perk2", text: "od.perk2Text" },
    { icon: "tag", title: "od.perk3", text: "od.perk3Text" },
  ];
  return (
    <section className="odWelcome">
      <div className="odWelcomeMain">
        <p className="odChip"><Icon name="store" size={16} />{t("od.welcomeChip")}</p>
        <h1>{t("od.welcomeTitle")}</h1>
        <p className="odLead">{t("od.welcomeText")}</p>
        <div className="odPerks">
          {perks.map((perk) => (
            <article key={perk.title}><span className="odTileIcon"><Icon name={perk.icon} /></span><h2>{t(perk.title)}</h2><p>{t(perk.text)}</p></article>
          ))}
        </div>
        <p className="odSideLabel">{t("od.journey")}</p>
        <ol className="odSteps">{steps.map((step, index) => <li key={step}><b>{index + 1}</b>{t(step)}</li>)}</ol>
      </div>
      <aside className="odAuthCard">
        <h2>{t("od.startTitle")}</h2>
        <p>{t("od.startText")}</p>
        <a className="button odFull" href="/mysobo/owner?dialog=login">{t("od.startButton")}</a>
        <p className="odSmall">{t("od.alreadyListed")}</p>
        <a className="odLink" href="/mysobo/owner?dialog=login">{t("od.claimExisting")} <Icon name="arrow" size={16} /></a>
      </aside>
    </section>
  );
}

/* ---------- Overview ---------- */

function Overview({ user, owned, plans, claims, posts, isLoading }: DashData & { user: PortalUser }) {
  const { t } = useT();
  const date = useDate();
  const verified = owned.filter((item) => item.verified).length;
  const highest = owned.reduce<PlanKey>((best, item) => PLAN_RANK[planOf(item)] > PLAN_RANK[best] ? planOf(item) : best, "free");
  const pendingClaims = claims.filter((item) => item.status === "pending").length;
  const pendingOffers = posts.filter((item) => item.status === "pending").length;
  const nameOf = (id: string) => owned.find((item) => item.id === id)?.name ?? "";

  const tiles: { label: MessageKey; value: ReactNode; hint: MessageKey; icon: string; tone: string }[] = [
    { label: "od.kpi.total", value: owned.length, hint: "od.kpi.totalHint", icon: "store", tone: "green" },
    { label: "od.kpi.verified", value: verified, hint: "od.kpi.verifiedHint", icon: "check", tone: "green" },
    { label: "od.kpi.review", value: owned.length - verified, hint: "od.kpi.reviewHint", icon: "clock", tone: "marigold" },
    { label: "od.kpi.claims", value: pendingClaims, hint: "od.kpi.claimsHint", icon: "hourglass", tone: "marigold" },
    { label: "od.kpi.offers", value: pendingOffers, hint: "od.kpi.offersHint", icon: "tag", tone: "indigo" },
    { label: "od.kpi.plan", value: t(`od.plan.${highest}` as MessageKey), hint: "od.kpi.planHint", icon: "card", tone: "indigo" },
  ];

  const actions: { to: string; icon: string; key: MessageKey }[] = [
    { to: "add", icon: "plus", key: "od.nav.add" },
    { to: "claim", icon: "shield", key: "od.nav.claim" },
    { to: "businesses", icon: "store", key: "od.manageListings" },
    { to: "offers", icon: "tag", key: "od.createOffer" },
    { to: "plans", icon: "card", key: "od.viewPlans" },
  ];

  const activity = [
    ...claims.map((item) => ({ id: `c${item.id}`, icon: "shield", when: item.created_at, title: t("od.act.claim", { name: item.business }), status: item.status })),
    ...posts.map((item) => ({ id: `p${item.id}`, icon: "tag", when: item.created_at, title: t("od.act.offer", { name: nameOf(item.business) || item.title }), status: item.status })),
    ...(plans?.requests ?? []).map((item, index) => ({ id: `r${item.id ?? index}`, icon: "card", when: item.created_at, title: t("od.act.plan", { name: nameOf(item.business_id), plan: t(`od.plan.${item.requested_plan}` as MessageKey) }), status: item.status })),
  ].sort((a, b) => (b.when ?? "").localeCompare(a.when ?? "")).slice(0, 6);

  return (
    <>
      <section className="odHero">
        <div>
          <p className="odChip"><Icon name="grid" size={16} />{t("od.overviewChip")}</p>
          <h1>{t("od.welcomeBack", { name: user.username })}</h1>
          <p>{owned.length ? t("od.managing", { n: owned.length }) : t("od.noneYet")}</p>
        </div>
        <div className="odPageActions">
          <Link className="odBtn add" to="/mysobo/owner/add"><Icon name="plus" size={18} />{t("od.nav.add")}</Link>
          <Link className="odBtn outline" to="/mysobo/owner/claim"><Icon name="shield" size={18} />{t("od.nav.claim")}</Link>
        </div>
      </section>

      <section className="odKpis" aria-label={t("od.summary")}>
        {tiles.map((tile) => (
          <article key={tile.label} className="odKpi">
            <div className="odKpiTop"><span>{t(tile.label)}</span><span className={`odTileIcon ${tile.tone}`}><Icon name={tile.icon} size={18} /></span></div>
            <strong>{isLoading ? "–" : tile.value}</strong>
            <small>{t(tile.hint)}</small>
          </article>
        ))}
      </section>

      <section className="odCard">
        <p className="odSideLabel">{t("od.quickActions")}</p>
        <div className="odQuick">
          {actions.map((action) => (
            <Link key={action.to} to={`/mysobo/owner/${action.to}`}><span className="odTileIcon green"><Icon name={action.icon} size={18} /></span>{t(action.key)}</Link>
          ))}
        </div>
      </section>

      <div className="odSplit">
        <section className="odCard">
          <div className="odCardHead"><h2>{t("od.yourListings")}</h2><Link className="odLink" to="/mysobo/owner/businesses">{t("od.viewAll")} <Icon name="arrow" size={16} /></Link></div>
          {isLoading ? <p className="mutedText">{t("owner.loading")}</p> : owned.length ? (
            <ul className="odRows">
              {owned.slice(0, 4).map((business) => (
                <li key={business.id}>
                  <div>
                    <p className="odRowTitle">{business.name} <PlanBadge plan={planOf(business)} /></p>
                    <p className="odRowMeta">{business.category?.name ?? t("owner.uncategorized")} · {t(`kind.${business.kind}` as MessageKey)}</p>
                    <p className="odBadges"><StatusBadge status={businessStatus(business)} />{business.hidden && <span className="odBadge muted"><Icon name="eyeOff" size={14} />{t("od.hidden")}</span>}</p>
                  </div>
                  <Link className="odBtn small" to={`/mysobo/owner/businesses?edit=${business.id}`}>{t("od.manage")}</Link>
                </li>
              ))}
            </ul>
          ) : <Empty text={t("od.emptyListings")} to="add" cta={t("od.nav.add")} />}
        </section>
        <section className="odCard">
          <div className="odCardHead"><h2>{t("od.activity")}</h2></div>
          {activity.length ? (
            <ul className="odActivity">
              {activity.map((item) => (
                <li key={item.id}>
                  <span className="odTileIcon marigold"><Icon name={item.icon} size={16} /></span>
                  <div><p>{item.title}</p><p className="odRowMeta"><StatusBadge status={item.status} /> {date(item.when)}</p></div>
                </li>
              ))}
            </ul>
          ) : <p className="mutedText">{t("od.emptyActivity")}</p>}
        </section>
      </div>
    </>
  );
}

function Empty({ text, to, cta }: { text: string; to: string; cta: string }) {
  return (
    <div className="odEmpty">
      <img src="/icons/icon-192.png" alt="" width="72" height="72" />
      <p>{text}</p>
      <Link className="odBtn" to={`/mysobo/owner/${to}`}>{cta}</Link>
    </div>
  );
}

/* ---------- My businesses ---------- */

function MyBusinesses({ owned, isLoading, perform }: DashData) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const params = new URLSearchParams(window.location.search);
  const [editing, setEditing] = useState(params.get("edit") ?? "");

  const list = owned.filter((item) => {
    const text = `${item.name} ${item.category?.name ?? ""} ${item.address ?? ""}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase()))
      && (!kind || item.kind === kind)
      && (!status || businessStatus(item) === status);
  });
  const editingBusiness = owned.find((item) => item.id === editing);

  return (
    <>
      <PageHead title={t("od.nav.businesses")} copy={t("od.businessesCopy")}>
        <Link className="odBtn outline" to="/mysobo/owner/claim">{t("od.claimListing")}</Link>
        <Link className="odBtn add" to="/mysobo/owner/add"><Icon name="plus" size={18} />{t("od.nav.add")}</Link>
      </PageHead>
      <section className="odCard odFilters">
        <label className="odSearch"><span className="srOnly">{t("od.searchBusinesses")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("od.searchBusinesses")} /></label>
        <label><span className="srOnly">{t("form.type")}</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">{t("od.allTypes")}</option><option value="service">{t("kind.service")}</option><option value="product">{t("kind.product")}</option><option value="both">{t("kind.both")}</option></select></label>
        <label><span className="srOnly">{t("od.status")}</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t("od.allStatuses")}</option><option value="verified">{t("verified")}</option><option value="review">{t("owner.underReview")}</option></select></label>
      </section>

      {editingBusiness && (
        <section className="odCard odEditing">
          <div className="odCardHead"><h2>{t("od.editing", { name: editingBusiness.name })}</h2><button type="button" className="odBtn outline small" onClick={() => setEditing("")}>{t("close")}</button></div>
          <EditBusinessForm
            business={editingBusiness}
            open
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void perform(() => apiPatch(`/businesses/${editingBusiness.id}/`, {
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
        </section>
      )}

      {isLoading ? <p className="mutedText">{t("owner.loading")}</p> : list.length ? (
        <section className="odGrid">
          {list.map((business) => (
            <article key={business.id} className="odBizCard">
              <div className={`odBizCover ${planOf(business)}`}>
                <PlanBadge plan={planOf(business)} />
                <span>{business.name}</span>
              </div>
              <div className="odBizBody">
                <p className="odRowMeta"><b>{t(`kind.${business.kind}` as MessageKey)}</b> · {business.category?.name ?? t("owner.uncategorized")}</p>
                <h2>{business.name}</h2>
                <p className="odClamp">{business.description || t("listing.defaultDesc")}</p>
                <p className="odBadges"><StatusBadge status={businessStatus(business)} />{business.hidden && <span className="odBadge muted"><Icon name="eyeOff" size={14} />{t("od.hidden")}</span>}</p>
              </div>
              <div className="odBizActions">
                <button type="button" className="odBtn outline small" onClick={() => { setEditing(business.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("od.editListing")}</button>
                <a className="odBtn small" href={`/business/${business.slug}`}>{t("od.viewPublic")} <Icon name="arrow" size={16} /></a>
              </div>
            </article>
          ))}
        </section>
      ) : owned.length ? <p className="mutedText">{t("cards.noneText")}</p> : <Empty text={t("od.emptyListings")} to="add" cta={t("od.nav.add")} />}
    </>
  );
}

/* ---------- Add business ---------- */

function AddBusiness({ perform }: DashData) {
  const { t } = useT();
  const [formKey, setFormKey] = useState(0);

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "business"}-${Date.now().toString(36)}`;
    const ok = await perform(() => apiPost("/businesses/", {
      name, slug, kind: form.get("kind"), description: form.get("description"),
      phone: form.get("phone"), whatsapp: form.get("whatsapp"), address: form.get("address"),
      category_id: form.get("category_id") || undefined,
      subcategory_id: form.get("subcategory_id") || undefined,
      category_data: categoryDataFromForm(form),
    }), t("owner.created"));
    if (ok) setFormKey((key) => key + 1);
  }

  return (
    <>
      <PageHead title={t("owner.addBusiness")} copy={t("od.addCopy")} />
      <div className="odSplit wideLeft">
        <section className="odCard"><BusinessForm key={formKey} onSubmit={createBusiness} /></section>
        <aside className="odCard odTint">
          <h2>{t("od.afterSubmit")}</h2>
          <ol className="odSteps vertical">
            <li><b>1</b>{t("od.after1")}</li>
            <li><b>2</b>{t("od.after2")}</li>
            <li><b>3</b>{t("od.after3")}</li>
          </ol>
        </aside>
      </div>
    </>
  );
}

/* ---------- Claim business ---------- */

function ClaimBusiness({ claims, perform }: DashData) {
  const { t } = useT();
  const date = useDate();
  const [search, setSearch] = useState("");
  const { data: matches = [], isFetching } = useQuery({
    queryKey: ["owner-search", search],
    queryFn: () => apiGet<Business[]>(`/owner/claimable/?q=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 2,
  });

  return (
    <>
      <PageHead title={t("owner.findExisting")} copy={t("od.claimCopy")} />
      <div className="odSplit wideLeft">
        <section className="odCard">
          <label className="odSearch"><span className="srOnly">{t("owner.searchName")}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("owner.searchName")} /></label>
          {search.trim().length >= 2 && (
            <ul className="odRows">
              {matches.slice(0, 8).map((business) => (
                <li key={business.id}>
                  <div><p className="odRowTitle">{business.name}</p><p className="odRowMeta">{business.category?.name ?? t("owner.uncategorized")}{business.address ? ` · ${business.address}` : ""}</p></div>
                  <button type="button" className="odBtn small" onClick={() => perform(() => apiPost("/owner/claims/", { business_id: business.id }), t("owner.claimSubmitted"))}>{t("owner.claim")}</button>
                </li>
              ))}
              {!isFetching && matches.length === 0 && <li><p className="mutedText">{t("od.noMatch")}</p><Link className="odBtn small" to="/mysobo/owner/add">{t("od.nav.add")}</Link></li>}
            </ul>
          )}
        </section>
        <aside className="odCard">
          <h2>{t("od.yourClaims")}</h2>
          {claims.length ? (
            <ul className="odRows compact">
              {claims.map((claim) => (
                <li key={claim.id}><div><p className="odRowTitle">{claim.business}</p><p className="odRowMeta">{date(claim.created_at)}{claim.note && ` · ${claim.note}`}</p></div><StatusBadge status={claim.status} /></li>
              ))}
            </ul>
          ) : <p className="mutedText">{t("od.noClaims")}</p>}
          <p className="odSmall">{t("owner.claimsReviewed")}</p>
        </aside>
      </div>
    </>
  );
}

/* ---------- Offers ---------- */

function Offers({ owned, posts, perform }: DashData) {
  const { t } = useT();
  const date = useDate();
  const [filter, setFilter] = useState("");
  const [title, setTitle] = useState("");
  const [formKey, setFormKey] = useState(0);
  const nameOf = (id: string) => owned.find((item) => item.id === id)?.name ?? "";
  const shown = posts.filter((post) => !filter || post.business === filter)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await perform(() => apiPost("/owner/posts/", {
      business_id: form.get("business_id"), title: form.get("title"), body: form.get("body"),
    }), t("owner.offerSent"));
    if (ok) { setFormKey((key) => key + 1); setTitle(""); }
  }

  return (
    <>
      <PageHead title={t("od.nav.offers")} copy={t("od.offersCopy")} />
      <div className="odSplit">
        <section className="odCard">
          <h2>{t("owner.postOffer")}</h2>
          {owned.length ? (
            <form key={formKey} className="stackForm" onSubmit={submit}>
              <label>{t("owner.business")} *<select name="business_id" required defaultValue={owned.length === 1 ? owned[0].id : ""}><option value="">{t("owner.chooseListing")}</option>{owned.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <label><span className="odLabelRow">{t("owner.offerTitle")} *<small>{title.length}/200</small></span><input name="title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("od.offerTitlePh")} /></label>
              <label>{t("owner.details")} *<textarea name="body" required rows={4} placeholder={t("od.offerBodyPh")} /></label>
              <button className="odBtn odFull" type="submit">{t("owner.submitOffer")}</button>
            </form>
          ) : <Empty text={t("owner.claimToPost")} to="add" cta={t("od.nav.add")} />}
        </section>
        <section className="odCard">
          <div className="odCardHead">
            <h2>{t("od.submittedOffers")}</h2>
            {owned.length > 1 && <select className="odSelect" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t("owner.business")}><option value="">{t("od.allBusinesses")}</option>{owned.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          </div>
          {shown.length ? (
            <ul className="odOffers">
              {shown.map((post) => (
                <li key={post.id}>
                  <div className="odOfferTop"><p className="odEyebrow">{nameOf(post.business)}</p><StatusBadge status={post.status} /></div>
                  <h3>{post.title}</h3>
                  {post.body && <p>{post.body}</p>}
                  <p className="odRowMeta">{t("od.submittedOn", { date: date(post.created_at) })}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mutedText">{t("od.noOffers")}</p>}
        </section>
      </div>
    </>
  );
}

/* ---------- Plans ---------- */

const PLAN_FEATURES: Record<PlanKey, MessageKey[]> = {
  free: ["od.feat.free1", "od.feat.free2", "od.feat.free3", "od.feat.free4"],
  pro: ["od.feat.pro1", "od.feat.pro2", "od.feat.pro3", "od.feat.pro4"],
  premium: ["od.feat.prem1", "od.feat.prem2", "od.feat.prem3", "od.feat.prem4"],
};

function Plans({ owned, plans, perform }: DashData) {
  const { t } = useT();
  const date = useDate();
  const [selected, setSelected] = useState("");
  const business = owned.find((item) => item.id === selected) ?? owned[0];
  const current = business ? planOf(business) : "free";
  const prices = useMemo(() => Object.fromEntries((plans?.plans ?? []).map((item) => [item.plan, item.monthly_price])), [plans]);
  const pendingFor = (plans?.requests ?? []).find((item) => item.business_id === business?.id && item.status === "pending");
  const nameOf = (id: string) => owned.find((item) => item.id === id)?.name ?? "";

  if (!owned.length) {
    return <><PageHead title={t("od.nav.plans")} copy={t("od.plansCopy")} /><Empty text={t("owner.addBeforePlan")} to="add" cta={t("od.nav.add")} /></>;
  }

  return (
    <>
      <PageHead title={t("od.nav.plans")} copy={t("od.plansCopy")}>
        <label className="odInlineLabel">{t("od.selectListing")}
          <select className="odSelect" value={business?.id ?? ""} onChange={(event) => setSelected(event.target.value)}>
            {owned.map((item) => <option key={item.id} value={item.id}>{item.name} ({t(`od.plan.${planOf(item)}` as MessageKey)})</option>)}
          </select>
        </label>
      </PageHead>
      <section className="odCard odCurrent">
        <span className="odTileIcon green"><Icon name="card" size={18} /></span>
        <div><p className="odRowMeta">{t("od.currentPlanFor", { name: business?.name ?? "" })}</p><p className="odRowTitle">{t(`od.plan.${current}` as MessageKey)}{prices[current] !== undefined && <small> · ₹{prices[current]}/{t("od.month")}</small>}</p></div>
        {business?.plan_expires_on && <p className="odRowMeta">{t("od.renews", { date: date(business.plan_expires_on) })}</p>}
      </section>
      <section className="odPlans">
        {(["free", "pro", "premium"] as PlanKey[]).map((plan) => {
          const isCurrent = plan === current;
          const price = prices[plan];
          const available = price !== undefined || plan === "free";
          return (
            <article key={plan} className={`odPlanCard ${plan} ${isCurrent ? "current" : ""}`}>
              <div className="odPlanHead"><h2>{t(`od.plan.${plan}` as MessageKey)}</h2>{isCurrent && <span className="odBadge ok">{t("od.currentPlan")}</span>}</div>
              <p className="odPrice">₹{price ?? 0}<small>/{t("od.month")}</small></p>
              <p className="odPlanTag">{t(`od.planTag.${plan}` as MessageKey)}</p>
              <ul>{PLAN_FEATURES[plan].map((feature) => <li key={feature}><Icon name="check" size={16} />{t(feature)}</li>)}</ul>
              {isCurrent ? <button type="button" className="odBtn ghost odFull" disabled>{t("od.currentlyActive")}</button>
                : pendingFor?.requested_plan === plan ? <button type="button" className="odBtn ghost odFull" disabled>{t("od.requested")}</button>
                  : <button
                      type="button"
                      className={`odBtn odFull ${plan === "premium" ? "add" : ""}`}
                      disabled={!available || Boolean(pendingFor)}
                      onClick={() => business && perform(() => apiPost("/owner/plans/", { business_id: business.id, plan }), t("owner.planSubmitted"))}
                    >{t("od.requestPlan", { plan: t(`od.plan.${plan}` as MessageKey) })}</button>}
            </article>
          );
        })}
      </section>
      <section className="odCard">
        <div className="odCardHead"><h2>{t("od.requestHistory")}</h2><span className="odRowMeta">{t("od.requestsCount", { n: plans?.requests.length ?? 0 })}</span></div>
        {plans?.requests.length ? (
          <div className="odTableWrap">
            <table className="odTable">
              <thead><tr><th>{t("owner.business")}</th><th>{t("od.requestedPlan")}</th><th>{t("od.submitted")}</th><th>{t("od.status")}</th></tr></thead>
              <tbody>{plans.requests.map((item, index) => (
                <tr key={item.id ?? index}><td>{nameOf(item.business_id)}</td><td>{t(`od.plan.${item.requested_plan}` as MessageKey)}</td><td>{date(item.created_at)}</td><td><StatusBadge status={item.status} /></td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="mutedText">{t("od.noRequests")}</p>}
      </section>
    </>
  );
}

/* ---------- Profile ---------- */

function Profile({ user }: { user: PortalUser }) {
  const { t, lang, setLang } = useT();
  return (
    <>
      <PageHead title={t("od.nav.profile")} copy={t("od.profileCopy")} />
      <div className="odSplit">
        <section className="odCard">
          <h2>{t("od.account")}</h2>
          <dl className="odFacts">
            <div><dt>{t("login.username")}</dt><dd>{user.username}</dd></div>
            <div><dt>{t("login.mobile")}</dt><dd>{user.mobile ?? "—"}</dd></div>
          </dl>
          <p className="odSmall">{t("od.profileNote")}</p>
        </section>
        <section className="odCard">
          <h2><Icon name="globe" size={20} /> {t("lang.label")}</h2>
          <div className="odLangs" role="radiogroup" aria-label={t("lang.label")}>
            {LANGUAGES.map((item) => (
              <button key={item.code} type="button" role="radio" aria-checked={lang === item.code} lang={item.code} className={lang === item.code ? "active" : ""} onClick={() => setLang(item.code)}>
                {item.label}{lang === item.code && <Icon name="check" size={18} />}
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/* ---------- Help ---------- */

function Help() {
  const { t } = useT();
  const faqs: [MessageKey, MessageKey][] = [
    ["od.faq1q", "od.faq1a"], ["od.faq2q", "od.faq2a"], ["od.faq3q", "od.faq3a"], ["od.faq4q", "od.faq4a"],
  ];
  return (
    <>
      <PageHead title={t("od.nav.help")} copy={t("od.helpCopy")} />
      <section className="odCard odFaq">
        {faqs.map(([q, a]) => <details key={q}><summary>{t(q)}</summary><p>{t(a)}</p></details>)}
      </section>
    </>
  );
}

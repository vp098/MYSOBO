import { Link, useNavigate, useParams } from "react-router-dom";
import { IconBadge } from "./iconBadge";
import { BadgeCheck, Store } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { apiGet, apiPatch, apiPost, apiPut, type Business, type PortalUser } from "./services/api";
import { LANGUAGES, useT, type MessageKey } from "./i18n";
import { BusinessForm, EditBusinessForm, Shell, categoryDataFromForm } from "./App";
import { coverFor } from "./covers";
import { LeafMark, PinScene } from "./logo";

/*
 * Business owner dashboard at /mysobo/owner/*.
 * Desktop: grouped sidebar. Phones: bottom tab bar with a "More" sheet.
 * A listing goes live after the owner sends it for approval and the
 * MySobo team approves it. Colours come from the palette tokens in styles.css.
 */

type PlanKey = "free" | "pro" | "premium";
type ListingState = "live" | "waiting" | "draft";
type OwnerPlans = {
  plans: { plan: string; monthly_price: number }[];
  subscriptions: { id: string; business_id: string; plan: string; status: string; expires_on: string | null }[];
  requests: { id?: string; business_id: string; requested_plan: string; status: string; created_at?: string }[];
};
type OwnerPost = { id: string; business: string; title: string; body: string; status: string; expires_on?: string | null; created_at?: string };

type Section = { path: string; key: MessageKey; icon: string };
const GROUPS: { label?: MessageKey; items: Section[] }[] = [
  { items: [{ path: "", key: "od.nav.overview", icon: "grid" }] },
  { label: "od.group.listings", items: [
    { path: "businesses", key: "od.nav.businesses", icon: "store" },
    { path: "add", key: "od.nav.add", icon: "plus" },
    { path: "verify", key: "vf.nav", icon: "shield" },
  ] },
  { label: "od.group.grow", items: [
    { path: "offers", key: "od.nav.offers", icon: "tag" },
    { path: "plans", key: "od.nav.plans", icon: "card" },
  ] },
  { label: "od.group.account", items: [
    { path: "profile", key: "od.nav.profile", icon: "user" },
    { path: "help", key: "od.nav.help", icon: "help" },
  ] },
];
const SECTIONS = GROUPS.flatMap((group) => group.items);

const ICONS: Record<string, ReactNode> = {
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  store: <><path d="M4 9.5 5.5 5h13L20 9.5" /><path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5" /><path d="M5.5 12v7.5h13V12M10 19.5v-4h4v4" /></>,
  plus: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></>,
  tag: <><path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.4 1.4 0 0 1 0 2l-6.6 6.6a1.4 1.4 0 0 1-2 0z" /><circle cx="8.3" cy="8.3" r="1.5" /></>,
  card: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M3.5 10h17M7 15h3" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" /><circle cx="12" cy="16.8" r=".6" fill="currentColor" /></>,
  live: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.2 2.4 2.4 4.6-4.8" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  draft: <><path d="M5 19h4L19.5 8.5a2.1 2.1 0 0 0-3-3L6 16z" /><path d="M14.5 7.5l2 2" /></>,
  send: <><path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z" /></>,
  star: <><path d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.7 5.4-.7z" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.5 3.6 5.3 3.6 8.5s-1.2 6-3.6 8.5c-2.4-2.5-3.6-5.3-3.6-8.5s1.2-6 3.6-8.5z" /></>,
  chevron: <><path d="M7 10l5 5 5-5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  ext: <><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  shield: <><path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  chat: <><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /></>,
  more: <><circle cx="6" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18" cy="12" r="1.4" fill="currentColor" /></>,
  note: <><path d="M5 4.5h14v11l-4 4H5z" /><path d="M15 19.5v-4h4M8.5 9h7M8.5 12.5h5" /></>,
  rupee: <><path d="M7 5h10M7 9h10M9 5c4 0 6 1.6 6 4s-2 4-6 4H8l7 6" /></>,
  phone: <><path d="M6.6 3.5h2.6l1.4 4-2 1.3a12 12 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" /></>,
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

const PLAN_RANK: Record<PlanKey, number> = { free: 0, pro: 1, premium: 2 };
const planOf = (business: Business): PlanKey => business.plan ?? "free";

export function listingState(business: Business): ListingState {
  if (!business.hidden) return "live";
  return business.approval_requested_at ? "waiting" : "draft";
}

function useDate() {
  const { lang } = useT();
  const locale = lang === "gu" ? "gu-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  return (value?: string | null) => value ? new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "";
}

function StateBadge({ state }: { state: ListingState }) {
  const { t } = useT();
  const map: Record<ListingState, { cls: string; key: MessageKey; icon: string }> = {
    live: { cls: "ok", key: "od.state.live", icon: "live" },
    waiting: { cls: "wait", key: "od.state.waiting", icon: "clock" },
    draft: { cls: "muted", key: "od.state.draft", icon: "draft" },
  };
  const item = map[state];
  return <span className={`odBadge ${item.cls}`}><Icon name={item.icon} size={14} />{t(item.key)}</span>;
}

function RequestBadge({ status }: { status: string }) {
  const { t } = useT();
  const map: Record<string, { cls: string; key: MessageKey }> = {
    approved: { cls: "ok", key: "od.status.approved" },
    rejected: { cls: "bad", key: "od.status.rejected" },
    pending: { cls: "wait", key: "od.status.pending" },
  };
  const item = map[status] ?? map.pending;
  return <span className={`odBadge ${item.cls}`}>{t(item.key)}</span>;
}

function OfferBadge({ post }: { post: OwnerPost }) {
  const { t } = useT();
  const expired = Boolean(post.expires_on && post.expires_on < new Date().toISOString().slice(0, 10));
  if (post.status === "approved" && expired) return <span className="odBadge muted">{t("r3.expired")}</span>;
  if (post.status === "approved") return <span className="odBadge ok">{t("r3.live")}</span>;
  if (post.status === "rejected") return <span className="odBadge bad">{t("od.status.rejected")}</span>;
  return <span className="odBadge wait">{t("r3.review")}</span>;
}

function PlanBadge({ plan }: { plan: PlanKey }) {
  const { t } = useT();
  return <span className={`odPlan ${plan}`}>{plan !== "free" && <Icon name="star" size={12} />}{t(`od.plan.${plan}` as MessageKey)}</span>;
}

type Perform = <T>(action: () => Promise<T>, success: string) => Promise<T | null>;

export function OwnerDashboard({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const section = (useParams()["*"] ?? "").split("/")[0];
  const { t } = useT();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [approvalFor, setApprovalFor] = useState<Business | null>(null);

  const enabled = Boolean(user);
  const { data: owned = [], isLoading } = useQuery({ queryKey: ["owner-businesses"], queryFn: () => apiGet<Business[]>("/owner/businesses/"), enabled });
  const { data: plans } = useQuery({ queryKey: ["owner-plans"], queryFn: () => apiGet<OwnerPlans>("/owner/plans/"), enabled });
  const { data: posts = [] } = useQuery({ queryKey: ["owner-posts"], queryFn: () => apiGet<OwnerPost[]>("/owner/posts/"), enabled });

  useEffect(() => { setMoreOpen(false); window.scrollTo({ top: 0 }); }, [section]);

  const perform: Perform = async (action, success) => {
    setError("");
    setNotice("");
    try {
      const value = await action();
      setNotice(success);
      await queryClient.invalidateQueries();
      return value;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.request"));
      return null;
    }
  };

  if (!user) {
    return <Shell user={user} onAuthChange={onAuthChange}><OwnerWelcome /></Shell>;
  }

  const data: DashData = { owned, plans, posts, isLoading, perform, askApproval: setApprovalFor };
  const active = SECTIONS.find((item) => item.path === section) ?? SECTIONS[0];
  const to = (path: string) => path ? `/mysobo/owner/${path}` : "/mysobo/owner";
  const clear = () => { setNotice(""); setError(""); };

  const bottom = (
    <nav className="odTabbar" aria-label={t("od.workspace")}>
      {([["", "grid", "od.tab.home"], ["businesses", "store", "od.tab.listings"]] as const).map(([path, icon, key]) => (
        <Link key={path} to={to(path)} className={active.path === path ? "active" : ""} aria-current={active.path === path ? "page" : undefined} onClick={clear}>
          <Icon name={icon} size={22} /><span>{t(key)}</span>
        </Link>
      ))}
      <Link to={to("add")} className={`odTabAdd ${active.path === "add" ? "active" : ""}`} aria-label={t("od.nav.add")} onClick={clear}>
        <span className="odTabAddIcon"><Icon name="plus" size={26} /></span><span>{t("od.tab.add")}</span>
      </Link>
      <Link to={to("offers")} className={active.path === "offers" ? "active" : ""} aria-current={active.path === "offers" ? "page" : undefined} onClick={clear}>
        <Icon name="tag" size={22} /><span>{t("od.tab.offers")}</span>
      </Link>
      <button type="button" className={["plans", "profile", "help"].includes(active.path) ? "active" : ""} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
        <Icon name="more" size={22} /><span>{t("od.tab.more")}</span>
      </button>
      {moreOpen && (
        <div className="odSheet" role="menu">
          {(["plans", "profile", "help"] as const).map((path) => {
            const item = SECTIONS.find((entry) => entry.path === path)!;
            return <Link role="menuitem" key={path} to={to(path)} onClick={clear}><Icon name={item.icon} />{t(item.key)}</Link>;
          })}
        </div>
      )}
    </nav>
  );

  return (
    <Shell user={user} onAuthChange={onAuthChange} bottomNav={bottom}>
      <div className="odLayout">
        <aside className="odSide" aria-label={t("od.workspace")}>
          <Link className="odUser" to={to("profile")} onClick={clear}>
            <span className="odAvatar">{(user.name || user.email || user.username).charAt(0).toUpperCase()}</span>
            <span className="odUserName">{user.name || user.email || t("od.owner")}</span>
            <Icon name="chevron" size={16} />
          </Link>
          {GROUPS.map((group, index) => (
            <div className="odGroup" key={index}>
              {group.label && <p className="odSideLabel">{t(group.label)}</p>}
              <nav>
                {group.items.map((item) => (
                  <Link
                    key={item.path}
                    to={to(item.path)}
                    className={item === active ? "active" : ""}
                    aria-current={item === active ? "page" : undefined}
                    onClick={clear}
                  >
                    <Icon name={item.icon} />
                    <span>{t(item.key)}</span>
                    {item.path === "businesses" && owned.length > 0 && <em>{owned.length}</em>}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
          <div className="odSideBottom">
            <div className="odSideCard">
              <IconBadge icon={BadgeCheck} size={44} />
              <p className="odRowTitle">{t("cd.promoTitle")}</p>
              <p>{t("od.sideTip")}</p>
              <Link to={to("help")}>{t("cd.promoLink")} <Icon name="arrow" size={14} /></Link>
            </div>
            <Link className="odUpgrade" to={to("plans")} onClick={clear}><Icon name="star" size={18} />{t("cd.upgrade")}</Link>
            <Link className="odSettings" to={to("profile")} onClick={clear}><Icon name="gear" size={18} />{t("cd.settings")}</Link>
          </div>
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
          {active.path === "verify" && <VerifyListing />}
          {active.path === "offers" && <Offers {...data} />}
          {active.path === "plans" && <Plans {...data} />}
          {active.path === "profile" && <Profile user={user} />}
          {active.path === "help" && <Help />}
        </div>
      </div>
      {approvalFor && (
        <ApprovalPrompt
          business={approvalFor}
          onClose={() => setApprovalFor(null)}
          onSend={async () => {
            const business = approvalFor;
            setApprovalFor(null);
            await perform(() => apiPost(`/owner/businesses/${business.id}/request-approval/`), t("od.approvalSent", { name: business.name }));
          }}
        />
      )}
    </Shell>
  );
}

type DashData = {
  owned: Business[];
  plans?: OwnerPlans;
  posts: OwnerPost[];
  isLoading: boolean;
  perform: Perform;
  askApproval: (business: Business) => void;
};

function ApprovalPrompt({ business, onClose, onSend }: { business: Business; onClose: () => void; onSend: () => void }) {
  const { t } = useT();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modalBackdrop odPromptBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="odPrompt" role="dialog" aria-modal="true" aria-labelledby="approval-title">
        <div className="odPromptArt"><img src={coverFor(business)} alt="" /></div>
        <h2 id="approval-title">{t("od.promptTitle")}</h2>
        <p className="odPromptName">{business.name}</p>
        <p>{t("od.promptText")}</p>
        <ol className="odPromptSteps">
          <li><Icon name="send" size={16} />{t("od.promptStep1")}</li>
          <li><Icon name="clock" size={16} />{t("od.promptStep2")}</li>
          <li><Icon name="live" size={16} />{t("od.promptStep3")}</li>
        </ol>
        <div className="odPromptActions">
          <button type="button" className="odBtn outline" onClick={onClose}>{t("od.notNow")}</button>
          <button type="button" className="odBtn" onClick={onSend} autoFocus><Icon name="send" size={18} />{t("od.sendApproval")}</button>
        </div>
      </section>
    </div>
  );
}

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
  const perks: { icon: string; title: MessageKey; text: MessageKey; cover: string }[] = [
    { icon: "store", title: "od.perk1", text: "od.perk1Text", cover: "/covers/shop.svg" },
    { icon: "tag", title: "od.perk2", text: "od.perk2Text", cover: "/covers/events.svg" },
    { icon: "card", title: "od.perk3", text: "od.perk3Text", cover: "/covers/home.svg" },
  ];
  return (
    <section className="odWelcome">
      <div className="odWelcomeMain">
        <p className="odChip"><Icon name="store" size={16} />{t("od.welcomeChip")}</p>
        <h1>{t("od.welcomeTitle")}</h1>
        <p className="odLead">{t("od.welcomeText")}</p>
        <div className="odPerks">
          {perks.map((perk) => (
            <article key={perk.title}>
              <img src={perk.cover} alt="" />
              <h2>{t(perk.title)}</h2>
              <p>{t(perk.text)}</p>
            </article>
          ))}
        </div>
        <p className="odSideLabel">{t("od.journey")}</p>
        <ol className="odSteps">{steps.map((step, index) => <li key={step}><b>{index + 1}</b>{t(step)}</li>)}</ol>
      </div>
      <aside className="odAuthCard">
        <LeafMark size={60} />
        <h2>{t("od.startTitle")}</h2>
        <p>{t("od.startText")}</p>
        <a className="odBtn odFull" href="/mysobo/owner?dialog=login">{t("od.startButtonGoogle")}</a>
      </aside>
      <div className="odWelcomeWide"><PricingTable /></div>
    </section>
  );
}

/* ---------- Overview ---------- */

const GS_HIDE = "mysobo-gs-hidden";
const SHARED = "mysobo-link-shared";
const TIP_DONE = "mysobo-first-tip";
const readFlag = (key: string) => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
const setFlag = (key: string) => { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } };

function Overview({ user, owned, plans, posts, isLoading, askApproval }: DashData & { user: PortalUser }) {
  const { t } = useT();
  const date = useDate();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"listings" | "offers" | "activity">("listings");
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState("");
  const [shared, setShared] = useState(() => readFlag(SHARED));
  const [gsHidden, setGsHidden] = useState(() => readFlag(GS_HIDE));
  const [tipDone, setTipDone] = useState(() => readFlag(TIP_DONE));
  const nameOf = (id: string) => owned.find((item) => item.id === id)?.name ?? "";
  const list = owned.filter((item) => !query || `${item.name} ${item.category?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const firstLive = owned.find((item) => listingState(item) === "live");
  const firstDraft = owned.find((item) => listingState(item) === "draft");
  const ownerName = user.name || user.email || t("od.owner");

  async function copyLink(business: Business) {
    const url = `${window.location.origin}/business/${business.slug}`;
    try { await navigator.clipboard.writeText(url); } catch { window.prompt(t("cd.copyLink"), url); }
    setCopied(business.id);
    setShared(true);
    setFlag(SHARED);
    window.setTimeout(() => setCopied(""), 2000);
  }

  const steps: { key: MessageKey; done: boolean; cover: string; action: () => void }[] = [
    { key: "cd.gs1", done: owned.length > 0, cover: "/covers/home.svg", action: () => navigate("/mysobo/owner/add") },
    { key: "cd.gs2", done: owned.some((item) => listingState(item) !== "draft"), cover: "/covers/shop.svg", action: () => (firstDraft ? askApproval(firstDraft) : navigate("/mysobo/owner/businesses")) },
    { key: "cd.gs3", done: shared, cover: "/covers/mobile.svg", action: () => (firstLive ? void copyLink(firstLive) : navigate("/mysobo/owner/businesses")) },
    { key: "cd.gs4", done: posts.length > 0, cover: "/covers/events.svg", action: () => navigate("/mysobo/owner/offers") },
    { key: "cd.gs5", done: owned.some((item) => planOf(item) !== "free") || Boolean(plans?.requests.length), cover: "/covers/education.svg", action: () => navigate("/mysobo/owner/plans") },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  const activity = [
    ...posts.map((item) => ({ id: `p${item.id}`, icon: "tag", when: item.created_at, title: t("od.act.offer", { name: nameOf(item.business) || item.title }), badge: <RequestBadge status={item.status} /> })),
    ...(plans?.requests ?? []).map((item, index) => ({ id: `r${item.id ?? index}`, icon: "card", when: item.created_at, title: t("od.act.plan", { name: nameOf(item.business_id), plan: t(`od.plan.${item.requested_plan}` as MessageKey) }), badge: <RequestBadge status={item.status} /> })),
    ...owned.filter((item) => item.approval_requested_at).map((item) => ({ id: `a${item.id}`, icon: "send", when: item.approval_requested_at ?? undefined, title: t("od.act.approval", { name: item.name }), badge: <StateBadge state={listingState(item)} /> })),
  ].sort((x, y) => (y.when ?? "").localeCompare(x.when ?? ""));

  return (
    <>
    <OwnerStats owned={owned} />
    <div className={`cdLayout ${gsHidden ? "noGs" : ""}`}>
      <section className="cdPanel">
        <header className="cdHead">
          <h1>{t("cd.title")}</h1>
          <div className="cdHeadActions">
            <Link className="cdBtn outline" to="/mysobo/owner/plans"><Icon name="card" size={16} />{t("cd.managePlans")}</Link>
            <div className="cdCreate">
              <button type="button" className="cdBtn dark" aria-expanded={menu} onClick={() => setMenu((open) => !open)}><Icon name="plus" size={16} />{t("cd.create")}<Icon name="chevron" size={14} /></button>
              {menu && (
                <div className="cdMenu" role="menu">
                  <Link role="menuitem" to="/mysobo/owner/add"><span className="wizTileIcon"><Icon name="store" size={16} /></span><span><b>{t("cd.createBusiness")}</b><small>{t("cd.createBusinessHint")}</small></span></Link>
                  <Link role="menuitem" to="/mysobo/owner/offers"><span className="wizTileIcon"><Icon name="tag" size={16} /></span><span><b>{t("cd.createOffer")}</b><small>{t("cd.createOfferHint")}</small></span></Link>
                </div>
              )}
            </div>
          </div>
        </header>
        <nav className="cdTabs" role="tablist">
          {(["listings", "offers", "activity"] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "on" : ""} onClick={() => setTab(item)}>
              {t(item === "listings" ? "cd.tabListings" : item === "offers" ? "cd.tabOffers" : "cd.tabActivity")}
            </button>
          ))}
        </nav>

        {tab === "listings" && (
          <>
            <label className="cdSearch"><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("cd.search")} aria-label={t("cd.search")} /></label>
            <div className="cdOwnerRow">
              <span className="odAvatar small">{ownerName.charAt(0).toUpperCase()}</span>
              <span>{ownerName}</span>
              {firstLive && <a className="cdLink" href={`/business/${firstLive.slug}`}>{t("cd.viewPage")} <Icon name="ext" size={14} /></a>}
            </div>
            {isLoading ? <p className="mutedText">{t("owner.loading")}</p> : list.length ? (
              <ul className="cdCards">
                {list.map((business) => {
                  const state = listingState(business);
                  return (
                    <li key={business.id} className={`cdCard ${state}`}>
                      <img className="cdThumb" src={coverFor(business)} alt="" />
                      <div className="cdCardText">
                        <p className="cdCardTitle">{business.name}</p>
                        <p className="cdCardMeta">{t(`kind.${business.kind}` as MessageKey)} · {business.category?.name ?? t("owner.uncategorized")}{business.review_count ? ` · ★ ${(business.average_rating ?? 0).toFixed(1)}` : ""}</p>
                        <p className="cdCardMeta"><StateBadge state={state} /> <PlanBadge plan={planOf(business)} /></p>
                      </div>
                      <div className="cdCardActions">
                        {state === "live" ? (
                          <button type="button" className="cdBtn outline small" onClick={() => void copyLink(business)}><Icon name="copy" size={15} />{copied === business.id ? t("cd.copied") : t("cd.copyLink")}</button>
                        ) : state === "draft" ? (
                          <button type="button" className="cdBtn small" onClick={() => askApproval(business)}><Icon name="send" size={15} />{t("od.sendApproval")}</button>
                        ) : <span className="cdCardMeta">{t("od.waitingShort")}</span>}
                        <Link className="cdIconBtn" to={`/mysobo/owner/businesses?edit=${business.id}`} aria-label={t("od.editListing")}><Icon name="draft" size={17} /></Link>
                      </div>
                      {firstLive?.id === business.id && !tipDone && (
                        <div className="cdTip" role="dialog" aria-label={t("cd.tipTitle")}>
                          <button type="button" className="cdTipClose" aria-label={t("close")} onClick={() => { setTipDone(true); setFlag(TIP_DONE); }}><Icon name="close" size={14} /></button>
                          <p className="cdTipTitle">{t("cd.tipTitle")}</p>
                          <p>{t("cd.tipText")}</p>
                          <div className="cdTipActions">
                            <Link to="/mysobo/owner/help" className="cdLink">{t("cd.learnMore")}</Link>
                            <button type="button" className="cdBtn dark small" onClick={() => { setTipDone(true); setFlag(TIP_DONE); }}>{t("cd.gotIt")}</button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : <Empty text={t("od.emptyListings")} to="add" cta={t("od.nav.add")} />}
          </>
        )}

        {tab === "offers" && (posts.length ? (
          <ul className="cdCards">
            {posts.map((post) => (
              <li key={post.id} className={`cdCard ${post.status === "approved" ? "live" : post.status === "rejected" ? "draft" : "waiting"}`}>
                <div className="cdCardText">
                  <p className="cdCardTitle">{post.title}</p>
                  <p className="cdCardMeta">{nameOf(post.business)} · {date(post.created_at)}</p>
                  {post.body && <p className="cdCardMeta">{post.body}</p>}
                </div>
                <div className="cdCardActions"><RequestBadge status={post.status} /></div>
              </li>
            ))}
          </ul>
        ) : <p className="mutedText cdEmptyText">{t("cd.noOffers")}</p>)}

        {tab === "activity" && (activity.length ? (
          <ul className="odActivity cdActivity">
            {activity.map((item) => (
              <li key={item.id}>
                <span className="odTileIcon green"><Icon name={item.icon} size={16} /></span>
                <div><p>{item.title}</p><p className="odRowMeta">{item.badge} {date(item.when)}</p></div>
              </li>
            ))}
          </ul>
        ) : <p className="mutedText cdEmptyText">{t("od.emptyActivity")}</p>)}
      </section>

      {!gsHidden && (
        <aside className="cdGs" aria-label={t("cd.getStarted")}>
          <div className="cdGsHead">
            <h2>{t("cd.getStarted")}</h2>
            <button type="button" className="cdIconBtn" aria-label={t("close")} onClick={() => { setGsHidden(true); setFlag(GS_HIDE); }}><Icon name="close" size={18} /></button>
          </div>
          <p className="cdGsProgress">{t("cd.progress", { done: doneCount, total: steps.length })}</p>
          <span className="wizBar wide"><span style={{ width: `${(doneCount / steps.length) * 100}%` }} /></span>
          <ul>
            {steps.map((step) => (
              <li key={step.key}>
                <button type="button" className={step.done ? "done" : ""} onClick={step.action}>
                  <img src={step.cover} alt="" />
                  <span><b>{t(step.key)}</b><small>{step.done ? t("cd.done") : t("cd.task")}</small></span>
                  {step.done && <span className="cdCheck"><Icon name="live" size={18} /></span>}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="cdBtn outline small cdDontShow" onClick={() => { setGsHidden(true); setFlag(GS_HIDE); }}>{t("cd.dontShow")}</button>
        </aside>
      )}
    </div>
    </>
  );
}

function OwnerStats({ owned }: { owned: Business[] }) {
  const { t } = useT();
  const { data } = useQuery({ queryKey: ["owner-stats"], queryFn: () => apiGet<{ view: number; call: number; whatsapp: number }>("/owner/stats/") });
  const fields = (b: Business) => [b.description, b.phone, b.whatsapp, b.address, b.category, (b.hours ?? []).length > 0, b.review_count];
  const completeness = owned.length
    ? Math.round(owned.reduce((sum, b) => sum + fields(b).filter(Boolean).length / fields(b).length, 0) / owned.length * 100)
    : 0;
  const tiles = [
    { key: "vf.kViews", value: data?.view, icon: "eye" },
    { key: "vf.kCalls", value: data?.call, icon: "phone" },
    { key: "vf.kWhatsapp", value: data?.whatsapp, icon: "chat" },
    { key: "vf.kComplete", value: `${completeness}%`, icon: "live" },
  ] as const;
  return (
    <section className="ownStats" aria-label={t("od.summary")}>
      {tiles.map((tile) => (
        <article key={tile.key} className="odKpi">
          <div className="odKpiTop"><span>{t(tile.key)}</span><span className="odTileIcon green"><Icon name={tile.icon} size={18} /></span></div>
          <strong>{tile.value ?? "–"}</strong>
          <small>{tile.key === "vf.kComplete" ? t("vf.kCompleteHint") : t("vf.k30")}</small>
        </article>
      ))}
      <Link className="ownStatsCta" to="/mysobo/owner/offers"><Icon name="tag" size={18} />{t("vf.weekendOffer")}</Link>
    </section>
  );
}

type OwnerClaim = { id: string; business: string; status: string; note: string; created_at?: string };

function VerifyListing() {
  const { t } = useT();
  const date = useDate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [proofFor, setProofFor] = useState<Business | null>(null);
  const [proof, setProof] = useState("");
  const [message, setMessage] = useState("");
  const { data: matches = [], isFetching } = useQuery({
    queryKey: ["owner-search", search],
    queryFn: () => apiGet<Business[]>(`/owner/claimable/?q=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 2,
  });
  const { data: requests = [] } = useQuery({ queryKey: ["owner-claims"], queryFn: () => apiGet<OwnerClaim[]>("/owner/claims/") });

  async function submit() {
    if (!proofFor) return;
    setMessage("");
    try {
      await apiPost("/owner/claims/", { business_id: proofFor.id, proof_path: proof.trim() });
      setMessage(t("vf.sent", { name: proofFor.name }));
      setProofFor(null);
      setProof("");
      await queryClient.invalidateQueries({ queryKey: ["owner-claims"] });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t("err.request"));
    }
  }

  return (
    <>
      <PageHead title={t("vf.title")} copy={t("vf.copy")} />
      {message && <p className="successMessage">{message}</p>}
      <div className="odSplit wideLeft">
        <section className="odCard">
          <label className="cdSearch vfSearch"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("vf.searchPh")} aria-label={t("vf.searchPh")} /></label>
          {search.trim().length >= 2 && (
            <ul className="odRows">
              {matches.slice(0, 8).map((business) => (
                <li key={business.id}>
                  <img className="odThumb" src={coverFor(business)} alt="" />
                  <div className="odRowText"><p className="odRowTitle">{business.name}</p><p className="odRowMeta">{business.category?.name ?? t("owner.uncategorized")}{business.address ? ` · ${business.address}` : ""}</p></div>
                  <button type="button" className="odBtn small" onClick={() => setProofFor(business)}>{t("vf.request")}</button>
                </li>
              ))}
              {!isFetching && matches.length === 0 && <li><p className="mutedText">{t("vf.noMatch")}</p><Link className="odBtn small" to="/mysobo/owner/add">{t("od.nav.add")}</Link></li>}
            </ul>
          )}
          {proofFor && (
            <div className="vfProof">
              <p className="odRowTitle">{t("vf.proofTitle", { name: proofFor.name })}</p>
              <p className="odRowMeta">{t("vf.proofHint")}</p>
              <textarea rows={3} value={proof} onChange={(event) => setProof(event.target.value)} placeholder={t("vf.proofPh")} aria-label={t("vf.proofTitle", { name: proofFor.name })} />
              <div className="vfProofActions">
                <button type="button" className="odBtn outline small" onClick={() => setProofFor(null)}>{t("od.notNow")}</button>
                <button type="button" className="odBtn small" onClick={() => void submit()}><Icon name="send" size={15} />{t("vf.submit")}</button>
              </div>
            </div>
          )}
        </section>
        <aside className="odCard">
          <h2>{t("vf.tracker")}</h2>
          {requests.length ? (
            <ul className="odRows compact">
              {requests.map((item) => (
                <li key={item.id}>
                  <div className="odRowText"><p className="odRowTitle">{item.business}</p><p className="odRowMeta">{date(item.created_at)}{item.note ? ` · ${item.note}` : ""}</p></div>
                  {item.status === "approved" ? <span className="odBadge ok">✓ {t("vf.verified")}</span>
                    : item.status === "rejected" ? <span className="odBadge bad">{t("od.status.rejected")}</span>
                      : <span className="odBadge wait">{t("vf.requested")}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="mutedText">{t("vf.none")}</p>}
        </aside>
      </div>
    </>
  );
}

function Empty({ text, to, cta }: { text: string; to: string; cta: string }) {
  return (
    <div className="odEmpty">
      <IconBadge icon={Store} size={64} />
      <p>{text}</p>
      <Link className="odBtn" to={`/mysobo/owner/${to}`}>{cta}</Link>
    </div>
  );
}

/* ---------- My businesses ---------- */

function MyBusinesses({ owned, isLoading, perform, askApproval }: DashData) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).get("edit") ?? "");

  const list = owned.filter((item) => {
    const text = `${item.name} ${item.category?.name ?? ""} ${item.address ?? ""}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase()))
      && (!kind || item.kind === kind)
      && (!state || listingState(item) === state);
  });
  const editingBusiness = owned.find((item) => item.id === editing);

  return (
    <>
      <PageHead title={t("od.nav.businesses")} copy={t("od.businessesCopy")}>
        <Link className="odBtn add" to="/mysobo/owner/add"><Icon name="plus" size={18} />{t("od.nav.add")}</Link>
      </PageHead>
      <section className="odCard odFilters">
        <label className="odSearch"><span className="srOnly">{t("od.searchBusinesses")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("od.searchBusinesses")} /></label>
        <label><span className="srOnly">{t("form.type")}</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">{t("od.allTypes")}</option><option value="service">{t("kind.service")}</option><option value="product">{t("kind.product")}</option><option value="both">{t("kind.both")}</option></select></label>
        <label><span className="srOnly">{t("od.status")}</span><select value={state} onChange={(event) => setState(event.target.value)}><option value="">{t("od.allStatuses")}</option><option value="live">{t("od.state.live")}</option><option value="waiting">{t("od.state.waiting")}</option><option value="draft">{t("od.state.draft")}</option></select></label>
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
          <BusinessExtras business={editingBusiness} perform={perform} />
        </section>
      )}

      {isLoading ? <p className="mutedText">{t("owner.loading")}</p> : list.length ? (
        <section className="odGrid">
          {list.map((business) => {
            const current = listingState(business);
            return (
              <article key={business.id} className="odBizCard">
                <div className="odBizCover">
                  <img src={coverFor(business)} alt="" />
                  <PlanBadge plan={planOf(business)} />
                  <span className="odBizState"><StateBadge state={current} /></span>
                </div>
                <div className="odBizBody">
                  <p className="odRowMeta"><b>{t(`kind.${business.kind}` as MessageKey)}</b> · {business.category?.name ?? t("owner.uncategorized")}</p>
                  <h2>{business.name}</h2>
                  <p className="odClamp">{business.description || t("listing.defaultDesc")}</p>
                  {business.review_count ? <p className="odRowMeta">★ {(business.average_rating ?? 0).toFixed(1)} · {t("od.reviews", { n: business.review_count })}</p> : null}
                  {current === "draft" && business.review_note && (
                    <p className="odNote"><Icon name="note" size={16} /><span><b>{t("od.teamNote")}</b> {business.review_note}</span></p>
                  )}
                </div>
                <div className="odBizActions">
                  <button type="button" className="odBtn outline small" onClick={() => { setEditing(business.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("od.editListing")}</button>
                  {current === "draft"
                    ? <button type="button" className="odBtn small" onClick={() => askApproval(business)}><Icon name="send" size={16} />{t("od.sendApproval")}</button>
                    : current === "live"
                      ? <a className="odBtn small" href={`/business/${business.slug}`}>{t("od.viewPublic")} <Icon name="arrow" size={16} /></a>
                      : <span className="odRowMeta">{t("od.waitingShort")}</span>}
                </div>
              </article>
            );
          })}
        </section>
      ) : owned.length ? <p className="mutedText">{t("cards.noneText")}</p> : <Empty text={t("od.emptyListings")} to="add" cta={t("od.nav.add")} />}
    </>
  );
}

function BusinessExtras({ business, perform }: { business: Business; perform: Perform }) {
  const { t, lang } = useT();
  const locale = lang === "gu" ? "gu-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  const dayName = (dow: number) => new Date(2024, 0, 1 + dow).toLocaleDateString(locale, { weekday: "long" });
  const initial = Array.from({ length: 7 }, (_, dow) => {
    const found = (business.hours ?? []).find((item) => item.dow === dow);
    return { dow, closed: found ? found.closed : dow === 6, opens: found?.opens?.slice(0, 5) ?? "09:00", closes: found?.closes?.slice(0, 5) ?? "20:00" };
  });
  const [rows, setRows] = useState(initial);
  const [hideAddress, setHideAddress] = useState(Boolean(business.hide_address));
  const set = (dow: number, patch: Partial<(typeof rows)[number]>) => setRows((list) => list.map((row) => row.dow === dow ? { ...row, ...patch } : row));
  const copyToAll = (dow: number) => {
    const source = rows.find((row) => row.dow === dow)!;
    setRows((list) => list.map((row) => row.closed && row.dow !== dow ? row : { ...row, opens: source.opens, closes: source.closes }));
  };
  return (
    <div className="r3Extras">
      <h3>{t("r3.hoursTitle")}</h3>
      <p className="odRowMeta">{t("r3.hoursHint")}</p>
      <div className="r3Hours">
        {rows.map((row) => (
          <div key={row.dow} className={`r3Day ${row.closed ? "off" : ""}`}>
            <span className="r3DayName">{dayName(row.dow)}</span>
            <label className="r3Switch"><input type="checkbox" checked={!row.closed} onChange={(event) => set(row.dow, { closed: !event.target.checked })} /><span>{row.closed ? t("lp.closed") : t("r3.open")}</span></label>
            {!row.closed && <>
              <input type="time" value={row.opens} onChange={(event) => set(row.dow, { opens: event.target.value })} aria-label={`${dayName(row.dow)} ${t("r3.opens")}`} />
              <span aria-hidden="true">–</span>
              <input type="time" value={row.closes} onChange={(event) => set(row.dow, { closes: event.target.value })} aria-label={`${dayName(row.dow)} ${t("r3.closes")}`} />
              <button type="button" className="cdIconBtn" title={t("r3.copyAll")} aria-label={t("r3.copyAll")} onClick={() => copyToAll(row.dow)}><Icon name="copy" size={16} /></button>
            </>}
          </div>
        ))}
      </div>
      <button type="button" className="odBtn small" onClick={() => void perform(() => apiPut(`/owner/businesses/${business.id}/hours/`, { hours: rows }), t("r3.hoursSaved"))}>{t("r3.saveHours")}</button>
      <h3>{t("r3.privacy")}</h3>
      <label className="r3Toggle">
        <input type="checkbox" checked={hideAddress} onChange={(event) => {
          const value = event.target.checked;
          setHideAddress(value);
          void perform(() => apiPatch(`/businesses/${business.id}/`, { hide_address: value }), t("owner.updated"));
        }} />
        <span><b>{t("r3.hideAddress")}</b><small>{t("r3.hideAddressHint")}</small></span>
      </label>
    </div>
  );
}

/* ---------- Add business ---------- */

const GOALS: { key: MessageKey; icon: string }[] = [
  { key: "wiz.g.calls", icon: "phone" },
  { key: "wiz.g.prices", icon: "rupee" },
  { key: "wiz.g.offers", icon: "tag" },
  { key: "wiz.g.reviews", icon: "star" },
  { key: "wiz.g.hours", icon: "clock" },
  { key: "wiz.g.reach", icon: "store" },
];

function AddBusiness({ perform, askApproval, owned }: DashData & { user?: PortalUser }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [formKey, setFormKey] = useState(0);
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Business["kind"] | "">("");
  const [goals, setGoals] = useState<string[]>([]);

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "business"}-${Date.now().toString(36)}`;
    const created = await perform(() => apiPost<Business>("/businesses/", {
      name, slug, kind: form.get("kind"), description: form.get("description"),
      phone: form.get("phone"), whatsapp: form.get("whatsapp"), address: form.get("address"),
      category_id: form.get("category_id") || undefined,
      subcategory_id: form.get("subcategory_id") || undefined,
      category_data: categoryDataFromForm(form),
    }), t("od.created"));
    if (created) {
      setFormKey((key) => key + 1);
      navigate("/mysobo/owner/businesses");
    }
  }

  const toggleGoal = (key: string) => setGoals((list) => list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);
  const total = 2;

  return (
    <div className="wiz">
      <div className="wizMain">
        <div className="wizTop">
          <span className="wizStep">{t("wiz.step", { n: step + 1, total })}</span>
          <span className="wizBar"><span style={{ width: `${((step + 1) / total) * 100}%` }} /></span>
        </div>
        {step === 0 ? (
          <>
            <p className="wizHello">{owned.length ? t("wiz.helloBack") : t("wiz.hello")}</p>
            <h1>{t("wiz.q1")}</h1>
            <p className="wizHint">{t("wiz.q1Hint")}</p>
            <div className="wizTiles two" role="radiogroup" aria-label={t("wiz.q1")}>
              {(["service", "product", "both"] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? "on" : ""} onClick={() => setKind(value)}>
                  <span className="wizTileIcon"><Icon name={value === "product" ? "store" : value === "service" ? "user" : "grid"} size={18} /></span>
                  <span><b>{t(`wiz.k.${value}` as MessageKey)}</b><small>{t(`wiz.k.${value}Hint` as MessageKey)}</small></span>
                </button>
              ))}
            </div>
            <h2>{t("wiz.q2")}</h2>
            <p className="wizHint">{t("wiz.q2Hint")}</p>
            <div className="wizTiles" role="group" aria-label={t("wiz.q2")}>
              {GOALS.map((goal) => (
                <button key={goal.key} type="button" aria-pressed={goals.includes(goal.key)} className={goals.includes(goal.key) ? "on" : ""} onClick={() => toggleGoal(goal.key)}>
                  <span className="wizTileIcon"><Icon name={goal.icon} size={18} /></span>
                  <span><b>{t(goal.key)}</b></span>
                </button>
              ))}
            </div>
            <div className="wizNav">
              <span />
              <button type="button" className="odBtn" disabled={!kind} onClick={() => setStep(1)}>{t("wiz.next")} <Icon name="arrow" size={16} /></button>
            </div>
          </>
        ) : (
          <>
            <h1>{t("owner.addBusiness")}</h1>
            <p className="wizHint">{t("od.addCopy")}</p>
            <section className="odCard wizForm"><BusinessForm key={`${formKey}-${kind}`} defaultKind={kind || "service"} onSubmit={createBusiness} /></section>
            <div className="wizNav">
              <button type="button" className="odBtn outline" onClick={() => setStep(0)}>{t("wiz.back")}</button>
              <span />
            </div>
          </>
        )}
      </div>
      <aside className="wizAside" aria-hidden="true">
        <span className="heroShape a" /><span className="heroShape b" />
        <div className="wizAsideCard">
          <div className="wizAsideMap"><PinScene /></div>
          <p className="odRowTitle">{t("wiz.asideTitle")}</p>
          <ol className="odSteps vertical">
            <li><b>1</b>{t("od.after1")}</li>
            <li><b>2</b>{t("od.after2")}</li>
            <li><b>3</b>{t("od.after3")}</li>
          </ol>
        </div>
      </aside>
    </div>
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
      expires_on: form.get("expires_on") || null,
    }), t("owner.offerSent"));
    if (ok !== null) { setFormKey((key) => key + 1); setTitle(""); }
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
              <label>{t("r3.expiry")}<input name="expires_on" type="date" min={new Date().toISOString().slice(0, 10)} /></label>
              <button className="odBtn odFull" type="submit">{t("owner.submitOffer")}</button>
            </form>
          ) : <Empty text={t("od.addToPost")} to="add" cta={t("od.nav.add")} />}
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
                  <div className="odOfferTop"><p className="odEyebrow">{nameOf(post.business)}</p><OfferBadge post={post} /></div>
                  <h3>{post.title}</h3>
                  {post.body && <p>{post.body}</p>}
                  <p className="odRowMeta">{t("od.submittedOn", { date: date(post.created_at) })}{post.expires_on ? ` · ${t("r3.until", { date: date(post.expires_on) })}` : ""}</p>
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
  free: ["r3.f.free1", "r3.f.free2", "r3.f.free3"],
  pro: ["r3.f.pro1", "r3.f.pro2", "r3.f.pro3", "r3.f.pro4"],
  premium: ["r3.f.prem1", "r3.f.prem2", "r3.f.prem3", "r3.f.prem4"],
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
    return <><PageHead title={t("od.nav.plans")} copy={t("od.plansCopy")} /><Empty text={t("od.addBeforePlan")} to="add" cta={t("od.nav.add")} /></>;
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
        <img className="odThumb" src={business ? coverFor(business) : "/covers/shop.svg"} alt="" />
        <div><p className="odRowMeta">{t("od.currentPlanFor", { name: business?.name ?? "" })}</p><p className="odRowTitle">{t(`od.plan.${current}` as MessageKey)}{prices[current] !== undefined && <small> · ₹{prices[current]}/{t("od.month")}</small>}</p></div>
        {business?.plan_expires_on && <p className="odRowMeta">{t("od.renews", { date: date(business.plan_expires_on) })}</p>}
      </section>
      <section className="odPlans">
        {(["free", "pro", "premium"] as PlanKey[]).map((plan) => {
          const isCurrent = plan === current;
          const price = prices[plan];
          return (
            <article key={plan} className={`odPlanCard ${plan} ${isCurrent ? "current" : ""}`}>
              <div className="odPlanHead"><h2>{t(`od.plan.${plan}` as MessageKey)}</h2>{isCurrent && <span className="odBadge ok">{t("od.currentPlan")}</span>}{plan === "pro" && !isCurrent && <span className="odBadge popular">{t("od.popular")}</span>}</div>
              <p className="odPrice">₹{(price ?? 0).toLocaleString("en-IN")}<small>/{t("od.month")}</small></p>
              <p className="odPlanTag">{t(`od.planTag.${plan}` as MessageKey)}</p>
              {plan === "pro" && <p className="r3Promo">🎉 {t("r3.promo")}</p>}
              <ul>{PLAN_FEATURES[plan].map((feature) => <li key={feature}><Icon name="live" size={16} />{t(feature)}</li>)}</ul>
              {isCurrent ? <button type="button" className="odBtn ghost odFull" disabled>{t("od.currentlyActive")}</button>
                : pendingFor?.requested_plan === plan ? <button type="button" className="odBtn ghost odFull" disabled>{t("od.requested")}</button>
                  : <button
                      type="button"
                      className={`odBtn odFull ${plan === "premium" ? "add" : ""}`}
                      disabled={price === undefined || Boolean(pendingFor)}
                      onClick={() => business && perform(() => apiPost("/owner/plans/", { business_id: business.id, plan }), t("owner.planSubmitted"))}
                    >{t("od.requestPlan", { plan: t(`od.plan.${plan}` as MessageKey) })}</button>}
            </article>
          );
        })}
      </section>
      <PricingTable prices={prices} />
      <section className="odCard">
        <div className="odCardHead"><h2>{t("od.requestHistory")}</h2><span className="odRowMeta">{t("od.requestsCount", { n: plans?.requests.length ?? 0 })}</span></div>
        {plans?.requests.length ? (
          <div className="odTableWrap">
            <table className="odTable">
              <thead><tr><th>{t("owner.business")}</th><th>{t("od.requestedPlan")}</th><th>{t("od.submitted")}</th><th>{t("od.status")}</th></tr></thead>
              <tbody>{plans.requests.map((item, index) => (
                <tr key={item.id ?? index}><td>{nameOf(item.business_id)}</td><td>{t(`od.plan.${item.requested_plan}` as MessageKey)}</td><td>{date(item.created_at)}</td><td><RequestBadge status={item.status} /></td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="mutedText">{t("od.noRequests")}</p>}
      </section>
      <Invoices />
    </>
  );
}

type InvoiceRow = { number: string; issued_on: string; business: string; plan: string; amount_paise: number; gst_paise: number; method: string };

function Invoices() {
  const { t } = useT();
  const date = useDate();
  const { data = [] } = useQuery({ queryKey: ["owner-invoices"], queryFn: () => apiGet<InvoiceRow[]>("/owner/invoices/") });
  const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  function download(row: InvoiceRow) {
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) return;
    const esc = (value: string) => value.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch));
    win.document.write(`<!doctype html><title>${esc(row.number)}</title><body style="font-family:Arial,sans-serif;padding:40px;color:#1A231C">
      <h1 style="color:#2B7A4B;margin:0">MySobo<span style="color:#F2A33A">.</span></h1><p style="color:#4A544C">Tax invoice</p>
      <p><b>Invoice:</b> ${esc(row.number)}<br><b>Date:</b> ${esc(row.issued_on)}<br><b>Business:</b> ${esc(row.business)}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:20px"><tr style="background:#EAF8ED"><th align="left" style="padding:8px">Item</th><th align="right" style="padding:8px">Amount</th></tr>
      <tr><td style="padding:8px">MySobo ${esc(row.plan)} plan · ${esc(row.method)}</td><td align="right" style="padding:8px">${rupees(row.amount_paise)}</td></tr>
      <tr><td style="padding:8px">GST</td><td align="right" style="padding:8px">${rupees(row.gst_paise)}</td></tr>
      <tr style="border-top:2px solid #2B7A4B"><td style="padding:8px"><b>Total</b></td><td align="right" style="padding:8px"><b>${rupees(row.amount_paise + row.gst_paise)}</b></td></tr></table>
      <script>window.print()</script></body>`);
    win.document.close();
  }

  return (
    <section className="odCard">
      <div className="odCardHead"><h2>{t("r3.invoices")}</h2></div>
      {data.length ? (
        <div className="odTableWrap">
          <table className="odTable">
            <thead><tr><th>{t("r3.invoiceNo")}</th><th>{t("owner.business")}</th><th>{t("od.submitted")}</th><th>{t("r3.amount")}</th><th aria-label={t("r3.download")} /></tr></thead>
            <tbody>{data.map((row) => (
              <tr key={row.number}><td><code>{row.number}</code></td><td>{row.business}</td><td>{date(row.issued_on)}</td><td>{rupees(row.amount_paise + row.gst_paise)}</td>
                <td><button type="button" className="odBtn outline small" onClick={() => download(row)}>{t("r3.download")}</button></td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="mutedText">{t("r3.noInvoices")}</p>}
    </section>
  );
}


/* ---------- Plan comparison table ---------- */
type Cell = "inc" | "no" | MessageKey;
const COMPARE: { key: MessageKey; cells: [Cell, Cell, Cell] }[] = [
  { key: "pt.badge", cells: ["inc", "inc", "inc"] },
  { key: "pt.oneTap", cells: ["inc", "inc", "inc"] },
  { key: "pt.search", cells: ["inc", "inc", "inc"] },
  { key: "pt.hide", cells: ["inc", "inc", "inc"] },
  { key: "pt.photos", cells: ["pt.v.photos3", "pt.v.photos20", "pt.v.photosAll"] },
  { key: "pt.placement", cells: ["pt.v.standard", "pt.v.priority", "pt.v.top"] },
  { key: "pt.offers", cells: ["pt.v.offer1", "pt.v.offer4", "pt.v.unlimited"] },
  { key: "pt.alerts", cells: ["no", "inc", "inc"] },
  { key: "pt.launch", cells: ["no", "pt.v.boost1", "pt.v.boost2"] },
  { key: "pt.digest", cells: ["no", "no", "pt.v.sponsored"] },
  { key: "pt.analytics", cells: ["pt.v.basic", "pt.v.full", "pt.v.fullReport"] },
];

export function PricingTable({ prices }: { prices?: Record<string, number> }) {
  const { t } = useT();
  const price = (plan: PlanKey, fallback: number) => `₹${(prices?.[plan] ?? fallback).toLocaleString("en-IN")}${plan === "free" ? "" : ` / ${t("pt.mo")}`}`;
  const cell = (value: Cell) => value === "inc"
    ? <span className="ptInc"><Icon name="live" size={16} />{t("pt.included")}</span>
    : value === "no" ? <span className="ptNo" aria-label={t("pt.notIncluded")}>✕</span>
      : <span>{t(value)}</span>;
  return (
    <section className="ptWrap" aria-label={t("pt.title")}>
      <h2>{t("pt.title")}</h2>
      <div className="odTableWrap">
        <table className="ptTable">
          <thead>
            <tr>
              <th scope="col">{t("pt.feature")}</th>
              <th scope="col">{t("od.plan.free")}</th>
              <th scope="col" className="ptPro">{t("od.plan.pro")} <em>({t("pt.popular")})</em></th>
              <th scope="col">{t("od.plan.premium")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="ptPrice"><th scope="row">{t("pt.price")}</th><td>{price("free", 0)}</td><td className="ptPro">{price("pro", 499)}</td><td>{price("premium", 1999)}</td></tr>
            {COMPARE.map((row) => (
              <tr key={row.key}>
                <th scope="row">{t(row.key)}</th>
                <td>{cell(row.cells[0])}</td>
                <td className="ptPro">{cell(row.cells[1])}</td>
                <td>{cell(row.cells[2])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- Profile ---------- */

function Profile({ user }: { user: PortalUser }) {
  const { t, lang, setLang } = useT();
  const queryClient = useQueryClient();
  const { data: prefs } = useQuery({ queryKey: ["prefs"], queryFn: () => apiGet<{ whatsapp_alerts: boolean }>("/me/preferences/") });
  return (
    <>
      <PageHead title={t("od.nav.profile")} copy={t("od.profileCopy")} />
      <div className="odSplit">
        <section className="odCard">
          <h2>{t("od.account")}</h2>
          <dl className="odFacts">
            {user.name && <div><dt>{t("od.name")}</dt><dd>{user.name}</dd></div>}
            {user.email && <div><dt>{t("od.email")}</dt><dd>{user.email}</dd></div>}
            {user.mobile && <div><dt>{t("login.mobile")}</dt><dd>{user.mobile}</dd></div>}
          </dl>
          <p className="odSmall">{t("od.profileNote")}</p>
          <h3 className="r3Sub">{t("r3.notifications")}</h3>
          <label className="r3Toggle">
            <input type="checkbox" checked={prefs?.whatsapp_alerts ?? true} onChange={async (event) => {
              await apiPatch("/me/preferences/", { whatsapp_alerts: event.target.checked });
              await queryClient.invalidateQueries({ queryKey: ["prefs"] });
            }} />
            <span><b>{t("r3.leadAlerts")}</b><small>{t("r3.leadAlertsHint")}</small></span>
          </label>
          <Link className="odBtn outline r3Switch2" to="/mysobo"><Icon name="arrow" size={16} />{t("r3.switchResident")}</Link>
        </section>
        <section className="odCard">
          <h2><Icon name="globe" size={20} /> {t("lang.label")}</h2>
          <div className="odLangs" role="radiogroup" aria-label={t("lang.label")}>
            {LANGUAGES.map((item) => (
              <button key={item.code} type="button" role="radio" aria-checked={lang === item.code} lang={item.code} className={lang === item.code ? "active" : ""} onClick={() => setLang(item.code)}>
                {item.label}{lang === item.code && <Icon name="live" size={18} />}
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

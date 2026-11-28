import { useScrollMainToTop } from "./dashboard";
import { ThemePicker } from "./theme";
import { ApprovalRequests, AvatarPicker, BusinessExtraFields, OffersManager, OnboardingWizard, OwnerInvoices } from "./ownerFlows";
import { Link, useNavigate, useParams } from "react-router-dom";
import { IconBadge } from "./iconBadge";
import { PhotoLibrary } from "./photos";
import { BadgeCheck, Store } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPatch, apiPost, apiPut, type Business, type PortalUser } from "./services/api";
import { LANGUAGES, useT, type MessageKey } from "./i18n";
import { EditBusinessForm, Shell, categoryDataFromForm } from "./App";
import { coverFor } from "./covers";
import { LeafMark } from "./logo";

/*
 * Business owner dashboard at /sobo/business-owner/*.
 * Desktop: grouped sidebar. Phones: bottom tab bar with a "More" sheet.
 * A listing goes live after the owner sends it for approval and the
 * MySobo team approves it. Colours come from the palette tokens in styles.css.
 */

export type PlanKey = "free" | "pro" | "premium";
type ListingState = "live" | "waiting" | "draft";
export type OwnerPlans = {
  plans: { plan: string; monthly_price: number; max_photos: number; max_active_offers: number }[];
  subscriptions: { id: string; business_id: string; plan: string; status: string; expires_on: string | null }[];
  requests: { id?: string; business_id: string; requested_plan: string; status: string; created_at?: string }[];
};
export type OwnerPost = { id: string; business: string; title: string; body: string; status: string; starts_on?: string | null; expires_on?: string | null; created_at?: string };

type Section = { path: string; key: MessageKey; icon: string };
const GROUPS: { label?: MessageKey; items: Section[] }[] = [
  { items: [{ path: "", key: "od.nav.overview", icon: "grid" }] },
  { label: "od.group.listings", items: [
    { path: "businesses", key: "od.nav.businesses", icon: "store" },
    { path: "approvals", key: "ap.nav", icon: "send" },
    { path: "add", key: "od.nav.add", icon: "plus" },
    { path: "photos", key: "ph.nav", icon: "image" },
    { path: "verify", key: "vf.nav", icon: "shield" },
  ] },
  { label: "od.group.grow", items: [
    { path: "offers", key: "od.nav.offers", icon: "tag" },
    { path: "plans", key: "od.nav.plans", icon: "card" },
    { path: "invoices", key: "r3.invoices", icon: "note" },
  ] },
  { label: "od.group.account", items: [
    { path: "profile", key: "od.nav.profile", icon: "user" },
    { path: "help", key: "od.nav.help", icon: "help" },
  ] },
];
const SECTIONS = GROUPS.flatMap((group) => group.items);

const ICONS: Record<string, ReactNode> = {
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
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
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m20.5 16-5-5-8.5 8.5" /></>,
  phone: <><path d="M6.6 3.5h2.6l1.4 4-2 1.3a12 12 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" /></>,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
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

export function useDate() {
  const { lang } = useT();
  const locale = lang === "gu" ? "gu-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  return (value?: string | null) => value ? new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "";
}

export function StateBadge({ state }: { state: ListingState }) {
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

export function OfferBadge({ post }: { post: OwnerPost }) {
  const { t } = useT();
  const expired = Boolean(post.expires_on && post.expires_on < new Date().toISOString().slice(0, 10));
  if (post.status === "approved" && expired) return <span className="odBadge muted">{t("r3.expired")}</span>;
  if (post.status === "approved") return <span className="odBadge ok">{t("r3.live")}</span>;
  if (post.status === "rejected") return <span className="odBadge bad">{t("od.status.rejected")}</span>;
  return <span className="odBadge wait">{t("r3.review")}</span>;
}

export function PlanBadge({ plan }: { plan: PlanKey }) {
  const { t } = useT();
  return <span className={`odPlan ${plan}`}>{plan !== "free" && <Icon name="star" size={12} />}{t(`od.plan.${plan}` as MessageKey)}</span>;
}

export type Perform = <T>(action: () => Promise<T>, success: string) => Promise<T | null>;

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

  useEffect(() => { setMoreOpen(false); }, [section]);
  useScrollMainToTop(section);

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
  const to = (path: string) => path ? `/sobo/business-owner/${path}` : "/sobo/business-owner";
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
      <button type="button" className={["approvals", "photos", "plans", "invoices", "profile", "help"].includes(active.path) ? "active" : ""} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
        <Icon name="more" size={22} /><span>{t("od.tab.more")}</span>
      </button>
      {moreOpen && (
        <div className="odSheet" role="menu">
          {(["approvals", "photos", "plans", "invoices", "profile", "help"] as const).map((path) => {
            const item = SECTIONS.find((entry) => entry.path === path)!;
            return <Link role="menuitem" key={path} to={to(path)} onClick={clear}><Icon name={item.icon} />{t(item.key)}</Link>;
          })}
        </div>
      )}
    </nav>
  );

  return (
    <Shell user={user} onAuthChange={onAuthChange} bottomNav={bottom} dashboard>
      <div className="odLayout">
        <aside className="odSide" aria-label={t("od.workspace")}>
          <Link className="odUser" to={to("profile")} onClick={clear}>
            <span className="odAvatar">{user.avatar ? <img src={user.avatar} alt="" /> : (user.name || user.email || user.username).charAt(0).toUpperCase()}</span>
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
          <p className="odCrumbs"><Link to="/sobo/business-owner">{t("od.portal")}</Link><span aria-hidden="true">›</span><span>{t(active.key)}</span></p>
          {(error || notice) && (
            <div className="odFeedback" role="status">
              {error && <p className="formError">{error}</p>}
              {notice && <p className="successMessage">{notice}</p>}
            </div>
          )}
          {active.path === "" && <Overview user={user} {...data} />}
          {active.path === "businesses" && <MyBusinesses {...data} />}
          {active.path === "add" && <OnboardingWizard {...data} />}
          {active.path === "approvals" && <ApprovalRequests {...data} />}
          {active.path === "invoices" && <><PageHead title={t("r3.invoices")} copy={t("inv.copy")} /><OwnerInvoices /></>}
          {active.path === "photos" && <PhotoLibrary owned={owned} />}
          {active.path === "verify" && <VerifyListing />}
          {active.path === "offers" && <OffersManager {...data} />}
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

export type DashData = {
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

export function PageHead({ title, copy, children }: { title: string; copy?: string; children?: ReactNode }) {
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
        <a className="odBtn odFull" href="/sobo/business-owner?dialog=login">{t("od.startButtonGoogle")}</a>
      </aside>
      <div className="odWelcomeWide"><PricingTable /></div>
    </section>
  );
}

/* ---------- Overview ---------- */

const GS_HIDE = "mysobo-gs-hidden";
const SHARED = "mysobo-link-shared";
const readFlag = (key: string) => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
const setFlag = (key: string) => { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } };

type DayStat = { day: string; view: number; call: number; whatsapp: number };
type OwnerStatsData = {
  view: number; call: number; whatsapp: number;
  daily: DayStat[];
  last14: Record<Metric, number>;
  prev14: Record<Metric, number>;
};
type Metric = "view" | "call" | "whatsapp";

/** Height that makes an element end at the bottom of the window (desktop only). */
function useFitToViewport(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const query = window.matchMedia("(min-width: 1100px) and (min-height: 600px)");
    const measure = () => {
      const node = ref.current;
      if (!node || !query.matches) { setHeight(null); return; }
      const top = node.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(470, window.innerHeight - top - 16));
    };
    measure();
    const late = window.setTimeout(measure, 250);
    window.addEventListener("resize", measure);
    query.addEventListener("change", measure);
    return () => { window.clearTimeout(late); window.removeEventListener("resize", measure); query.removeEventListener("change", measure); };
  }, [enabled]);
  return { ref, style: height ? { height } : undefined };
}

function greetingKey(): MessageKey {
  const hour = new Date().getHours();
  return hour < 12 ? "ov.morning" : hour < 17 ? "ov.afternoon" : "ov.evening";
}

function Overview({ user, owned, plans, posts, isLoading, askApproval }: DashData & { user: PortalUser }) {
  const { t, lang } = useT();
  const date = useDate();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"listings" | "offers" | "activity">("listings");
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState("");
  const [shared, setShared] = useState(() => readFlag(SHARED));
  const [gsHidden, setGsHidden] = useState(() => readFlag(GS_HIDE));
  const { data: stats } = useQuery({ queryKey: ["owner-stats"], queryFn: () => apiGet<OwnerStatsData>("/owner/stats/") });
  const fit = useFitToViewport(true);

  const nameOf = (id: string) => owned.find((item) => item.id === id)?.name ?? "";
  const list = owned.filter((item) => !query || `${item.name} ${item.category?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const firstLive = owned.find((item) => listingState(item) === "live");
  const firstDraft = owned.find((item) => listingState(item) === "draft");
  const firstName = (user.name || user.email || t("od.owner")).split(/[\s@]/)[0];
  const counts = { live: 0, waiting: 0, draft: 0 };
  owned.forEach((item) => { counts[listingState(item)] += 1; });
  const bestPlan = owned.reduce<PlanKey>((best, item) => (PLAN_RANK[planOf(item)] > PLAN_RANK[best] ? planOf(item) : best), "free");
  const fields = (b: Business) => [b.description, b.phone, b.whatsapp, b.address, b.category, (b.hours ?? []).length > 0, (b.photos ?? []).length > 0];
  const completeness = owned.length
    ? Math.round(owned.reduce((sum, b) => sum + fields(b).filter(Boolean).length / fields(b).length, 0) / owned.length * 100)
    : 0;
  const locale = lang === "gu" ? "gu-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  const today = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

  async function copyLink(business: Business) {
    const url = `${window.location.origin}/business/${business.slug}`;
    try { await navigator.clipboard.writeText(url); } catch { window.prompt(t("cd.copyLink"), url); }
    setCopied(business.id);
    setShared(true);
    setFlag(SHARED);
    window.setTimeout(() => setCopied(""), 2000);
  }

  const steps: { key: MessageKey; done: boolean; icon: string; action: () => void }[] = [
    { key: "cd.gs1", done: owned.length > 0, icon: "store", action: () => navigate("/sobo/business-owner/add") },
    { key: "cd.gs2", done: owned.some((item) => listingState(item) !== "draft"), icon: "send", action: () => (firstDraft ? askApproval(firstDraft) : navigate("/sobo/business-owner/businesses")) },
    { key: "cd.gs3", done: shared, icon: "copy", action: () => (firstLive ? void copyLink(firstLive) : navigate("/sobo/business-owner/businesses")) },
    { key: "cd.gs4", done: posts.length > 0, icon: "tag", action: () => navigate("/sobo/business-owner/offers") },
    { key: "cd.gs5", done: owned.some((item) => planOf(item) !== "free") || Boolean(plans?.requests.length), icon: "card", action: () => navigate("/sobo/business-owner/plans") },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  const activity = [
    ...posts.map((item) => ({ id: `p${item.id}`, icon: "tag", when: item.created_at, title: t("od.act.offer", { name: nameOf(item.business) || item.title }), badge: <RequestBadge status={item.status} /> })),
    ...(plans?.requests ?? []).map((item, index) => ({ id: `r${item.id ?? index}`, icon: "card", when: item.created_at, title: t("od.act.plan", { name: nameOf(item.business_id), plan: t(`od.plan.${item.requested_plan}` as MessageKey) }), badge: <RequestBadge status={item.status} /> })),
    ...owned.filter((item) => item.approval_requested_at).map((item) => ({ id: `a${item.id}`, icon: "send", when: item.approval_requested_at ?? undefined, title: t("od.act.approval", { name: item.name }), badge: <StateBadge state={listingState(item)} /> })),
  ].sort((x, y) => (y.when ?? "").localeCompare(x.when ?? ""));

  const kpis: { metric: Metric; key: MessageKey; icon: string }[] = [
    { metric: "view", key: "vf.kViews", icon: "eye" },
    { metric: "call", key: "vf.kCalls", icon: "phone" },
    { metric: "whatsapp", key: "vf.kWhatsapp", icon: "chat" },
  ];

  return (
    <div className={`ov ${gsHidden ? "noGs" : ""}`} ref={fit.ref} style={fit.style}>
      <header className="ovHead">
        <div>
          <h1>{t(greetingKey(), { name: firstName })}</h1>
          <p>{today}</p>
        </div>
        <div className="ovHeadActions">
          <Link className="cdBtn outline" to="/sobo/business-owner/plans"><Icon name="card" size={16} />{t("cd.managePlans")}</Link>
          <div className="cdCreate">
            <button type="button" className="cdBtn dark" aria-expanded={menu} onClick={() => setMenu((open) => !open)}><Icon name="plus" size={16} />{t("cd.create")}<Icon name="chevron" size={14} /></button>
            {menu && (
              <div className="cdMenu" role="menu">
                <Link role="menuitem" to="/sobo/business-owner/add"><span className="wizTileIcon"><Icon name="store" size={16} /></span><span><b>{t("cd.createBusiness")}</b><small>{t("cd.createBusinessHint")}</small></span></Link>
                <Link role="menuitem" to="/sobo/business-owner/offers"><span className="wizTileIcon"><Icon name="tag" size={16} /></span><span><b>{t("cd.createOffer")}</b><small>{t("cd.createOfferHint")}</small></span></Link>
                <Link role="menuitem" to="/sobo/business-owner/photos"><span className="wizTileIcon"><Icon name="image" size={16} /></span><span><b>{t("ov.addPhotos")}</b><small>{t("ov.addPhotosHint")}</small></span></Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="ovKpis" aria-label={t("od.summary")}>
        {kpis.map((kpi) => {
          const now = stats?.last14[kpi.metric];
          const before = stats?.prev14[kpi.metric] ?? 0;
          const change = now === undefined ? null : before === 0 ? (now > 0 ? "new" : null) : Math.round(((now - before) / before) * 100);
          return (
            <article key={kpi.metric} className="ovKpi">
              <div className="ovKpiTop"><span>{t(kpi.key)}</span><span className="ovKpiIcon"><Icon name={kpi.icon} size={17} /></span></div>
              <strong>{now ?? "–"}</strong>
              <small>
                {change === "new" ? <span className="ovTrend up">{t("ov.new")}</span>
                  : typeof change === "number" ? <span className={`ovTrend ${change >= 0 ? "up" : "down"}`}>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}%</span>
                  : null}
                {t("ov.last14")}
              </small>
            </article>
          );
        })}
        <article className="ovKpi">
          <div className="ovKpiTop"><span>{t("vf.kComplete")}</span><span className="ovKpiIcon"><Icon name="live" size={17} /></span></div>
          <strong>{completeness}%</strong>
          <span className="ovMeter" aria-hidden="true"><span style={{ width: `${completeness}%` }} /></span>
        </article>
        <Link className="ovCta" to="/sobo/business-owner/offers"><Icon name="tag" size={20} /><span>{t("vf.weekendOffer")}</span><Icon name="arrow" size={16} /></Link>
      </section>

      <div className="ovGrid">
        <section className="ovCard ovChartCard" aria-labelledby="ov-chart-title">
          <PerformanceChart daily={stats?.daily} />
        </section>

        {!gsHidden && (
          <aside className="ovCard ovGs" aria-label={t("cd.getStarted")}>
            <div className="ovCardHead">
              <h2>{t("cd.getStarted")}</h2>
              <button type="button" className="cdIconBtn" aria-label={t("cd.dontShow")} title={t("cd.dontShow")} onClick={() => { setGsHidden(true); setFlag(GS_HIDE); }}><Icon name="close" size={16} /></button>
            </div>
            <div className="ovGsProgress">
              <span>{t("cd.progress", { done: doneCount, total: steps.length })}</span>
              <span className="ovMeter"><span style={{ width: `${(doneCount / steps.length) * 100}%` }} /></span>
            </div>
            <ul className="ovSteps">
              {steps.map((step) => (
                <li key={step.key}>
                  <button type="button" className={step.done ? "done" : ""} onClick={step.action}>
                    <span className="ovStepIcon">{step.done ? <Icon name="live" size={16} /> : <Icon name={step.icon} size={16} />}</span>
                    <span>{t(step.key)}</span>
                    {!step.done && <Icon name="arrow" size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <section className="ovCard ovList">
          <div className="ovCardHead">
            <nav className="ovTabs" role="tablist" aria-label={t("cd.title")}>
              {(["listings", "offers", "activity"] as const).map((item) => (
                <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "on" : ""} onClick={() => setTab(item)}>
                  {tab === item && <motion.span layoutId="ovTabLine" className="ovTabLine" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                  {t(item === "listings" ? "cd.tabListings" : item === "offers" ? "cd.tabOffers" : "cd.tabActivity")}
                  <em>{item === "listings" ? owned.length : item === "offers" ? posts.length : activity.length}</em>
                </button>
              ))}
            </nav>
            {tab === "listings" && owned.length > 3 && (
              <label className="ovSearch"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("cd.search")} aria-label={t("cd.search")} /></label>
            )}
          </div>
          <div className="ovScroll">
            {tab === "listings" && (isLoading ? <p className="mutedText">{t("owner.loading")}</p> : list.length ? (
              <ul className="ovRows">
                {list.map((business) => {
                  const state = listingState(business);
                  return (
                    <li key={business.id} className="ovRow">
                      <img src={coverFor(business)} alt="" />
                      <div className="ovRowText">
                        <p className="ovRowTitle">{business.name}</p>
                        <p className="ovRowMeta">{business.category?.name ?? t("owner.uncategorized")}{business.review_count ? ` · ★ ${(business.average_rating ?? 0).toFixed(1)}` : ""}</p>
                      </div>
                      <span className="ovRowBadges"><StateBadge state={state} /><PlanBadge plan={planOf(business)} /></span>
                      <div className="ovRowActions">
                        {state === "live" ? (
                          <button type="button" className="cdBtn outline small" onClick={() => void copyLink(business)}><Icon name="copy" size={14} />{copied === business.id ? t("cd.copied") : t("cd.copyLink")}</button>
                        ) : state === "draft" ? (
                          <button type="button" className="cdBtn small" onClick={() => askApproval(business)}><Icon name="send" size={14} />{t("od.sendApproval")}</button>
                        ) : <span className="ovRowMeta">{t("od.waitingShort")}</span>}
                        <Link className="cdIconBtn" to={`/sobo/business-owner/businesses?edit=${business.id}`} aria-label={t("od.editListing")} title={t("od.editListing")}><Icon name="draft" size={16} /></Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : owned.length ? <p className="mutedText ovEmpty">{t("ov.noMatch")}</p> : <Empty text={t("od.emptyListings")} to="add" cta={t("od.nav.add")} />)}

            {tab === "offers" && (posts.length ? (
              <ul className="ovRows">
                {posts.map((post) => (
                  <li key={post.id} className="ovRow">
                    <span className="ovRowIcon"><Icon name="tag" size={16} /></span>
                    <div className="ovRowText">
                      <p className="ovRowTitle">{post.title}</p>
                      <p className="ovRowMeta">{nameOf(post.business)} · {date(post.created_at)}</p>
                    </div>
                    <span className="ovRowBadges"><RequestBadge status={post.status} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="mutedText ovEmpty">{t("cd.noOffers")} <Link className="cdLink" to="/sobo/business-owner/offers">{t("vf.weekendOffer")}</Link></p>)}

            {tab === "activity" && (activity.length ? (
              <ul className="ovRows">
                {activity.map((item) => (
                  <li key={item.id} className="ovRow">
                    <span className="ovRowIcon"><Icon name={item.icon} size={16} /></span>
                    <div className="ovRowText"><p className="ovRowTitle">{item.title}</p><p className="ovRowMeta">{date(item.when)}</p></div>
                    <span className="ovRowBadges">{item.badge}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mutedText ovEmpty">{t("od.emptyActivity")}</p>)}
          </div>
        </section>

        <aside className="ovCard ovPlan">
          <div className="ovCardHead"><h2>{t("ov.status")}</h2></div>
          <ul className="ovStatus">
            <li><b>{counts.live}</b><span>{t("od.state.live")}</span></li>
            <li><b>{counts.waiting}</b><span>{t("od.state.waiting")}</span></li>
            <li><b>{counts.draft}</b><span>{t("od.state.draft")}</span></li>
          </ul>
          <div className="ovPlanRow">
            <span><small>{t("ov.plan")}</small><PlanBadge plan={bestPlan} /></span>
            {bestPlan !== "premium" && <Link className="cdBtn dark small" to="/sobo/business-owner/plans"><Icon name="star" size={14} />{t("cd.upgrade")}</Link>}
          </div>
          <Link className="ovPhotoNudge" to="/sobo/business-owner/photos"><Icon name="image" size={18} /><span>{t("ov.photoNudge")}</span><Icon name="arrow" size={14} /></Link>
        </aside>
      </div>
    </div>
  );
}

/** Single-series line/area chart with a metric switch, crosshair tooltip and keyboard support. */
function PerformanceChart({ daily }: { daily?: DayStat[] }) {
  const { t, lang } = useT();
  const [metric, setMetric] = useState<Metric>("view");
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 200 });
  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(240, width), h: Math.max(140, height) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const locale = lang === "gu" ? "gu-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  const days = daily ?? [];
  const values = days.map((day) => day[metric]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const rawMax = Math.max(0, ...values);
  const niceMax = (() => {
    if (rawMax <= 4) return 4;
    const power = 10 ** Math.floor(Math.log10(rawMax));
    const step = [1, 2, 2.5, 5, 10].find((s) => s * power * 4 >= rawMax) ?? 10;
    return step * power * 4;
  })();
  const pad = { l: 34, r: 12, t: 12, b: 24 };
  const iw = size.w - pad.l - pad.r;
  const ih = size.h - pad.t - pad.b;
  const x = (i: number) => pad.l + (days.length > 1 ? (i / (days.length - 1)) * iw : iw / 2);
  const y = (v: number) => pad.t + ih - (v / niceMax) * ih;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = values.length ? `${line} L${x(values.length - 1).toFixed(1)} ${pad.t + ih} L${x(0).toFixed(1)} ${pad.t + ih} Z` : "";
  const label = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, opts);
  const unit: Record<Metric, MessageKey> = { view: "ov.views", call: "ov.calls", whatsapp: "ov.chats" };
  const stride = size.w < 420 ? 4 : size.w < 620 ? 3 : 2;

  function pick(clientX: number) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || !days.length) return;
    const rel = clientX - rect.left - pad.l;
    setHover(Math.max(0, Math.min(days.length - 1, Math.round((rel / iw) * (days.length - 1)))));
  }

  return (
    <>
      <div className="ovCardHead">
        <div>
          <h2 id="ov-chart-title">{t("ov.performance")}</h2>
          <p className="ovCardSub">{t("ov.totalN", { n: total, what: t(unit[metric]) })}</p>
        </div>
        <div className="ovSeg" role="radiogroup" aria-label={t("ov.metric")}>
          {(["view", "call", "whatsapp"] as const).map((key) => (
            <button key={key} type="button" role="radio" aria-checked={metric === key} className={metric === key ? "on" : ""} onClick={() => { setMetric(key); setHover(null); }}>
              {metric === key && <motion.span layoutId="ovSegPill" className="ovSegPill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span>{t(key === "view" ? "vf.kViews" : key === "call" ? "vf.kCalls" : "vf.kWhatsapp")}</span>
            </button>
          ))}
        </div>
      </div>
      <div
        className="ovChart"
        ref={boxRef}
        tabIndex={0}
        role="img"
        aria-label={t("ov.chartLabel", { n: total, what: t(unit[metric]) })}
        onPointerMove={(event) => pick(event.clientX)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(event) => {
          if (!days.length) return;
          if (event.key === "ArrowRight") { event.preventDefault(); setHover((h) => Math.min(days.length - 1, (h ?? -1) + 1)); }
          if (event.key === "ArrowLeft") { event.preventDefault(); setHover((h) => Math.max(0, (h ?? days.length) - 1)); }
          if (event.key === "Escape") setHover(null);
        }}
        onBlur={() => setHover(null)}
      >
        <svg width={size.w} height={size.h} aria-hidden="true">
          <defs>
            <linearGradient id="ovArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#287A4B" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#287A4B" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={pad.l} x2={size.w - pad.r} y1={y(niceMax * f)} y2={y(niceMax * f)} className={f === 0 ? "ovAxis" : "ovGridLine"} />
              <text x={pad.l - 8} y={y(niceMax * f) + 4} textAnchor="end" className="ovTick">{Math.round(niceMax * f)}</text>
            </g>
          ))}
          {days.map((day, i) => ((i % stride === 0 && days.length - 1 - i >= stride) || i === days.length - 1) && (
            <text key={day.day} x={x(i)} y={size.h - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className="ovTick">{label(day.day, { day: "numeric", month: "short" })}</text>
          ))}
          {values.length > 0 && <path d={area} fill="url(#ovArea)" />}
          {values.length > 0 && <path d={line} className="ovLine" />}
          {hover !== null && days[hover] && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="ovCross" />
              <circle cx={x(hover)} cy={y(values[hover])} r={5} className="ovDot" />
            </g>
          )}
        </svg>
        {hover !== null && days[hover] && (
          <div className="ovTip" style={{ left: Math.min(Math.max(x(hover), 70), size.w - 70), top: Math.max(y(values[hover]) - 12, 8) }}>
            <b>{values[hover]} {t(unit[metric])}</b>
            <span>{label(days[hover].day, { weekday: "short", day: "numeric", month: "short" })}</span>
          </div>
        )}
        {daily && total === 0 && <p className="ovChartEmpty">{t("ov.chartEmpty")}</p>}
        <table className="srOnly">
          <caption>{t("ov.performance")}</caption>
          <thead><tr><th>{t("ov.day")}</th><th>{t("vf.kViews")}</th><th>{t("vf.kCalls")}</th><th>{t("vf.kWhatsapp")}</th></tr></thead>
          <tbody>{days.map((day) => <tr key={day.day}><td>{day.day}</td><td>{day.view}</td><td>{day.call}</td><td>{day.whatsapp}</td></tr>)}</tbody>
        </table>
      </div>
    </>
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
              {!isFetching && matches.length === 0 && <li><p className="mutedText">{t("vf.noMatch")}</p><Link className="odBtn small" to="/sobo/business-owner/add">{t("od.nav.add")}</Link></li>}
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
      <Link className="odBtn" to={`/sobo/business-owner/${to}`}>{cta}</Link>
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
        <Link className="odBtn add" to="/sobo/business-owner/add"><Icon name="plus" size={18} />{t("od.nav.add")}</Link>
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
            extra={<BusinessExtraFields business={editingBusiness} />}
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
                email: form.get("email") ?? "",
                gst_number: String(form.get("gst_number") ?? "").trim().toUpperCase(),
                home_visit: form.get("home_visit") === "on",
                onsite_visit: form.get("onsite_visit") === "on",
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

/* ---------- Plans ---------- */

const PLAN_FEATURES: Record<PlanKey, MessageKey[]> = {
  free: ["r3.f.free3"],
  pro: ["r3.f.pro3", "r3.f.pro4"],
  premium: ["r3.f.prem4", "r3.f.prem2", "r3.f.prem3"],
};

function Plans({ owned, plans, perform }: DashData) {
  const { t } = useT();
  const date = useDate();
  const [selected, setSelected] = useState("");
  const business = owned.find((item) => item.id === selected) ?? owned[0];
  const current = business ? planOf(business) : "free";
  const prices = useMemo(() => Object.fromEntries((plans?.plans ?? []).map((item) => [item.plan, item.monthly_price])), [plans]);
  const limits = useMemo(() => Object.fromEntries((plans?.plans ?? []).map((item) => [item.plan, item])), [plans]) as Partial<Record<PlanKey, { max_photos: number; max_active_offers: number }>>;
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
              <ul>
                {limits[plan] && <li><Icon name="live" size={16} />{t("lim.photos", { n: limits[plan].max_photos })}</li>}
                {limits[plan] && <li><Icon name="live" size={16} />{t("lim.offers", { n: limits[plan].max_active_offers })}</li>}
                {PLAN_FEATURES[plan].map((feature) => <li key={feature}><Icon name="live" size={16} />{t(feature)}</li>)}
              </ul>
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
      <p className="obNote"><Icon name="card" size={16} />{t("inv.howToPay")}</p>
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
      <OwnerInvoices />
    </>
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

type PublicPlanRow = { plan: PlanKey; monthly_price: number; max_photos: number; max_active_offers: number };

export function PricingTable({ prices: given }: { prices?: Record<string, number> }) {
  const { t } = useT();
  // Prices and limits come from the database (admin-editable), so this table never promises more than the server allows.
  const { data } = useQuery({ queryKey: ["public-plans"], queryFn: () => apiGet<{ plans: PublicPlanRow[] }>("/plans/") });
  const rows = Object.fromEntries((data?.plans ?? []).map((row) => [row.plan, row])) as Partial<Record<PlanKey, PublicPlanRow>>;
  const prices = given ?? Object.fromEntries((data?.plans ?? []).map((row) => [row.plan, row.monthly_price]));
  const dynamic: Partial<Record<MessageKey, (plan: PlanKey) => string>> = {
    "pt.photos": (plan) => rows[plan] ? t("pt.v.upTo", { n: rows[plan]!.max_photos }) : "–",
    "pt.offers": (plan) => rows[plan] ? t("pt.v.activeN", { n: rows[plan]!.max_active_offers }) : "–",
  };
  const plansInOrder: PlanKey[] = ["free", "pro", "premium"];
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
                {plansInOrder.map((plan, index) => {
                  const text = dynamic[row.key];
                  return <td key={plan} className={plan === "pro" ? "ptPro" : undefined}>{text ? <span>{text(plan)}</span> : cell(row.cells[index])}</td>;
                })}
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
          <AvatarPicker user={user} />
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
          <ThemePicker user={user} />
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

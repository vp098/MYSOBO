import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { apiGet, apiPost, apiPut, apiUpload, type Business, type PortalUser } from "./services/api";
import { BusinessForm, CategoryManager, Shell, categoryDataFromForm } from "./App";
import { coverFor } from "./covers";
import { LeafMark } from "./logo";
import { AdminInvoices, AdminPricing, type AdminPlan } from "./adminBilling";
import { AdminTickets, type Ticket } from "./support";
import { DashTabbar, useScrollMainToTop } from "./dashboard";
import { ThemePicker } from "./theme";

/*
 * Super Admin operations centre at /sobo/admin/*.
 * Sidebar with live badges; each section uses the existing admin APIs.
 * Staff-facing, so the copy is English.
 */

type Claim = { id: string; business_id: string; business: string; category: string; address: string; user: string; user_email: string; user_mobile: string; proof_path: string; created_at: string };
type AdminBusiness = Business & { owner_name?: string; owner_email?: string };
type Post = { id: string; business: string; title: string; body: string; status: string; created_at: string };
type PlanRequest = { id: string; business: string; requested_by: string; requested_plan: string; created_at: string };
type Plan = AdminPlan;
type Payment = { id: string; business: string; plan: string; amount_paise: number; gst_paise: number; method: string; status: string; paid_on: string; invoice: string };
type ReportRow = { id: string; business: string; business_slug: string; reason: string; reporter: string; status: string; created_at: string };
type AuditRow = { id: number; actor: string; action: string; target_type: string; after: Record<string, unknown> | null; created_at: string };
type Settings = { grace_period_days: number; free_pro_cap: number; approval_sla_hours: number };
type Dashboard = { businesses: number; verified: number; pending_approvals: number; pending_claims: number; pending_posts: number; pending_plan_requests: number; pending_reports: number; revenue_paise: number };

const ICONS: Record<string, ReactNode> = {
  chat: <><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /></>,
  more: <><circle cx="6" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18" cy="12" r="1.4" fill="currentColor" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  shield: <><path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  store: <><path d="M4 9.5 5.5 5h13L20 9.5" /><path d="M5.5 11v8.5h13V11M10 19.5v-4h4v4" /><path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5" /></>,
  tree: <><rect x="9" y="3.5" width="6" height="5" rx="1" /><rect x="3.5" y="15.5" width="6" height="5" rx="1" /><rect x="14.5" y="15.5" width="6" height="5" rx="1" /><path d="M12 8.5v3.5M6.5 15.5V12h11v3.5" /></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  tag: <><path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.4 1.4 0 0 1 0 2l-6.6 6.6a1.4 1.4 0 0 1-2 0z" /><circle cx="8.3" cy="8.3" r="1.5" /></>,
  card: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M3.5 10h17M7 15h3" /></>,
  rupee: <><path d="M7 5h10M7 9h10M9 5c4 0 6 1.6 6 4s-2 4-6 4H8l7 6" /></>,
  receipt: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  flag: <><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  check: <><path d="m6 12.5 4 4 8-9" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  ext: <><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
};
const Icon = ({ name, size = 20 }: { name: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>
);

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const when = (value?: string) => value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
const isVerified = (business: Business) => !business.hidden && (business.verification_level ?? 0) >= 2;

const ACTION_TEXT: Record<string, string> = {
  listing_request_approved: "accepted a listing request",
  listing_request_rejected: "rejected a listing request",
  business_verify: "verified a business",
  business_reject: "rejected a business",
  offer_approved: "approved an offer",
  offer_rejected: "rejected an offer",
  plan_request_approve: "approved a plan request",
  plan_request_reject: "rejected a plan request",
  report_resolved: "resolved a report",
  settings_updated: "updated platform settings",
  field_business_entry: "added a field entry",
  business_approval_requested: "owner requested approval",
};

export function SuperAdminDashboard({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const section = (useParams()["*"] ?? "").split("/")[0];
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const enabled = Boolean(user?.is_superadmin);
  useScrollMainToTop(section);

  const q = <T,>(key: string, url: string) => useQuery({ queryKey: [key], queryFn: () => apiGet<T>(url), enabled });
  const dashboard = q<Dashboard>("admin-dashboard", "/admin/dashboard/").data;
  const businesses = q<AdminBusiness[]>("admin-businesses", "/admin/businesses/").data ?? [];
  const claims = q<Claim[]>("admin-claims", "/admin/claims/").data ?? [];
  const posts = q<Post[]>("admin-posts", "/admin/posts/").data ?? [];
  const planRequests = q<PlanRequest[]>("admin-plan-requests", "/admin/plan-requests/").data ?? [];
  const plans = q<Plan[]>("admin-plans", "/admin/plans/").data ?? [];
  const payments = q<Payment[]>("admin-payments", "/admin/payments/").data ?? [];
  const reports = q<ReportRow[]>("admin-reports", "/admin/reports/").data ?? [];
  const audit = q<AuditRow[]>("admin-audit", "/admin/audit/").data ?? [];
  const settings = q<Settings>("admin-settings", "/admin/settings/").data;
  const activeTickets = q<Ticket[]>("admin-tickets-badge", "/admin/tickets/?status=active").data ?? [];

  async function run(action: () => Promise<unknown>, success: string) {
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await queryClient.invalidateQueries();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request failed.");
    }
  }

  if (!user?.is_superadmin) {
    return (
      <Shell user={user} onAuthChange={onAuthChange} bottomNav={null}>
        <section className="section saGate"><LeafMark size={56} /><h1>Super admin only</h1><p className="mutedText">Sign in with an account that has the super admin role.</p>{!user && <a className="odBtn" href="/sobo/admin?dialog=login">Log in</a>}</section>
      </Shell>
    );
  }

  const pendingApprovals = businesses.filter((item) => item.hidden && item.approval_requested_at);
  const pendingPosts = posts.filter((item) => item.status === "pending");
  const openReports = reports.filter((item) => item.status === "open");
  const SECTIONS: { path: string; label: string; icon: string; badge?: number }[] = [
    { path: "", label: "Overview dashboard", icon: "grid" },
    { path: "verification", label: "Business verification", icon: "shield", badge: pendingApprovals.length + claims.length },
    { path: "businesses", label: "All businesses", icon: "store" },
    { path: "categories", label: "Categories & subcategories", icon: "tree" },
    { path: "catalog", label: "Products & services", icon: "sliders" },
    { path: "offers", label: "Offers & promotions", icon: "tag", badge: pendingPosts.length },
    { path: "plan-requests", label: "Plan & subscription requests", icon: "card", badge: planRequests.length },
    { path: "pricing", label: "Pricing management", icon: "rupee" },
    { path: "payments", label: "Payments & invoices", icon: "receipt" },
    { path: "reports", label: "Reports & complaints", icon: "flag", badge: openReports.length },
    { path: "support", label: "Support tickets", icon: "chat", badge: activeTickets.filter((item) => item.status === "open").length },
    { path: "audit", label: "Admin activity / audit", icon: "clock" },
    { path: "settings", label: "Settings", icon: "gear" },
  ];
  const active = SECTIONS.find((item) => item.path === section) ?? SECTIONS[0];
  const to = (path: string) => path ? `/sobo/admin/${path}` : "/sobo/admin";
  const TAB_PATHS = ["", "verification", "businesses", "payments"];
  const short: Record<string, string> = { "": "Overview", verification: "Verify", businesses: "Businesses", payments: "Payments" };
  const bottom = (
    <DashTabbar
      label="Admin sections"
      moreLabel="More"
      active={active.path}
      to={to}
      icon={(name, size) => <Icon name={name} size={size} />}
      tabs={SECTIONS.filter((item) => TAB_PATHS.includes(item.path)).map((item) => ({ ...item, label: short[item.path] }))}
      more={SECTIONS.filter((item) => !TAB_PATHS.includes(item.path))}
      onNavigate={() => { setNotice(""); setError(""); }}
    />
  );

  return (
    <Shell user={user} onAuthChange={onAuthChange} bottomNav={bottom} dashboard>
      <div className="odLayout saLayout">
        <aside className="odSide saSide" aria-label="Admin navigation">
          <div className="saBrand"><LeafMark size={30} /><div><b>MySobo</b><span><Icon name="shield" size={13} />Operations control</span></div></div>
          <nav>
            {SECTIONS.map((item) => (
              <Link key={item.path} to={to(item.path)} className={item === active ? "active" : ""} aria-current={item === active ? "page" : undefined} onClick={() => { setNotice(""); setError(""); }}>
                <Icon name={item.icon} /><span>{item.label}</span>{item.badge ? <em className="saBadge">{item.badge}</em> : null}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="odMain">
          {(error || notice) && <div className="odFeedback" role="status">{error && <p className="formError">{error}</p>}{notice && <p className="successMessage">{notice}</p>}</div>}

          {active.path === "" && (
            <>
              <header className="saHead"><div><p className="odChip"><Icon name="shield" size={15} />South Bopal · Operations</p><h1>Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1><p className="mutedText">Verify listings, review requests and keep the directory trustworthy.</p></div></header>
              <section className="odKpis saKpis">
                {[
                  { label: "Total businesses", value: dashboard?.businesses, icon: "store", tone: "green", path: "businesses" },
                  { label: "Verified ✓", value: dashboard?.verified, icon: "check", tone: "green", path: "businesses" },
                  { label: "Pending verification", value: dashboard?.pending_approvals, icon: "shield", tone: "marigold", path: "verification" },
                  { label: "Pending listing requests", value: dashboard?.pending_claims, icon: "store", tone: "marigold", path: "verification" },
                  { label: "Pending offers", value: dashboard?.pending_posts, icon: "tag", tone: "indigo", path: "offers" },
                  { label: "Pending plan requests", value: dashboard?.pending_plan_requests, icon: "card", tone: "indigo", path: "plan-requests" },
                  { label: "Open reports", value: dashboard?.pending_reports, icon: "flag", tone: "marigold", path: "reports" },
                  { label: "Total revenue", value: dashboard ? rupees(dashboard.revenue_paise) : undefined, icon: "rupee", tone: "green", path: "payments" },
                ].map((tile) => (
                  <Link key={tile.label} to={to(tile.path)} className="odKpi">
                    <div className="odKpiTop"><span>{tile.label}</span><span className={`odTileIcon ${tile.tone}`}><Icon name={tile.icon} size={18} /></span></div>
                    <strong>{tile.value ?? "–"}</strong>
                  </Link>
                ))}
              </section>
              <div className="odSplit">
                <section className="odCard">
                  <div className="odCardHead"><h2>Needs your attention</h2><Link className="odLink" to={to("verification")}>Open queue</Link></div>
                  <ul className="odRows">
                    {[...claims.map((c) => ({ id: c.id, title: c.business, meta: `Listing requested by ${c.user}`, path: "verification" })),
                      ...pendingApprovals.map((b) => ({ id: b.id, title: b.name, meta: `New listing from ${b.owner_name || "owner"}`, path: "verification" })),
                      ...pendingPosts.map((p) => ({ id: p.id, title: p.title, meta: `Offer · ${p.business}`, path: "offers" })),
                      ...planRequests.map((r) => ({ id: r.id, title: r.business, meta: `Wants ${r.requested_plan}`, path: "plan-requests" })),
                    ].slice(0, 8).map((row) => (
                      <li key={row.id}><div className="odRowText"><p className="odRowTitle">{row.title}</p><p className="odRowMeta">{row.meta}</p></div><Link className="odBtn small outline" to={to(row.path)}>Review</Link></li>
                    ))}
                    {!claims.length && !pendingApprovals.length && !pendingPosts.length && !planRequests.length && <li><p className="mutedText">All caught up. Nothing waiting for review.</p></li>}
                  </ul>
                </section>
                <section className="odCard">
                  <div className="odCardHead"><h2>Recent admin activity</h2><Link className="odLink" to={to("audit")}>Full log</Link></div>
                  <AuditList rows={audit.slice(0, 6)} />
                </section>
              </div>
            </>
          )}

          {active.path === "verification" && <Verification claims={claims} pending={pendingApprovals} run={run} />}
          {active.path === "businesses" && <AllBusinesses businesses={businesses} run={run} />}
          {active.path === "categories" && <><SaHead title="Categories & subcategories" copy="Main categories, nested subcategories, listing type, order, icons and images." /><section className="odCard"><CategoryManager run={run} /></section></>}
          {active.path === "catalog" && <><SaHead title="Products & services" copy="Custom fields per category: label, key, type (text, number, yes/no, choice), show as filter and required. Open a category below and use its fields section." /><section className="odCard"><CategoryManager run={run} /></section></>}
          {active.path === "offers" && <Offers posts={posts} run={run} />}
          {active.path === "plan-requests" && <PlanRequests requests={planRequests} run={run} />}
          {active.path === "pricing" && <AdminPricing plans={plans} run={run} />}
          {active.path === "payments" && <><AdminInvoices run={run} /><PaymentLedger payments={payments} /></>}
          {active.path === "reports" && <Reports reports={reports} run={run} />}
          {active.path === "audit" && <><SaHead title="Admin activity / audit history" copy="Every approval, rejection, payment and settings change, newest first." /><section className="odCard"><AuditList rows={audit} /></section></>}
          {active.path === "support" && <AdminTickets />}
          {active.path === "settings" && <><SettingsForm settings={settings} run={run} /><section className="odCard saTheme"><ThemePicker user={user} /></section></>}
        </div>
      </div>
    </Shell>
  );
}

type Run = (action: () => Promise<unknown>, success: string) => Promise<void>;

function SaHead({ title, copy, children }: { title: string; copy?: string; children?: ReactNode }) {
  return <header className="odPageHead"><div><h1>{title}</h1>{copy && <p>{copy}</p>}</div>{children && <div className="odPageActions">{children}</div>}</header>;
}

function AuditList({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <p className="mutedText">No admin activity yet.</p>;
  return (
    <ul className="odActivity">
      {rows.map((row) => {
        const subject = String(row.after?.business ?? row.after?.title ?? row.after?.name ?? "");
        return (
          <li key={row.id}>
            <span className="odTileIcon green"><Icon name="clock" size={16} /></span>
            <div><p><b>{row.actor}</b> {ACTION_TEXT[row.action] ?? row.action.replace(/_/g, " ")}{subject ? ` · ${subject}` : ""}</p><p className="odRowMeta">{when(row.created_at)}</p></div>
          </li>
        );
      })}
    </ul>
  );
}

function Decision({ onAccept, onReject, acceptLabel = "Accept request & verify ✓" }: { onAccept: () => void; onReject: (note: string) => void; acceptLabel?: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  return rejecting ? (
    <div className="saReject">
      <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason shown to the owner (optional)" aria-label="Rejection reason" />
      <button type="button" className="saBtn danger" onClick={() => onReject(note)}><Icon name="x" size={15} />Reject</button>
      <button type="button" className="saBtn ghost" onClick={() => setRejecting(false)}>Cancel</button>
    </div>
  ) : (
    <div className="saActions">
      <button type="button" className="saBtn ok" onClick={onAccept}><Icon name="check" size={15} />{acceptLabel}</button>
      <button type="button" className="saBtn dangerOutline" onClick={() => setRejecting(true)}><Icon name="x" size={15} />Reject request</button>
    </div>
  );
}

function Verification({ claims, pending, run }: { claims: Claim[]; pending: AdminBusiness[]; run: Run }) {
  return (
    <>
      <SaHead title="Business verification" copy="Listing approval requests from owners, and new listings waiting to go live. Accepting verifies the listing and shows Verified ✓ to residents and the owner." />
      <section className="odCard">
        <div className="odCardHead"><h2>Listing approval requests</h2><span className="saCount">{claims.length}</span></div>
        <p className="mutedText saIntro">An owner asked to manage an existing listing.</p>
        {claims.length ? (
          <ul className="saQueue">
            {claims.map((claim) => (
              <li key={claim.id}>
                <div className="saQueueMain">
                  <p className="odRowTitle">{claim.business} <span className="odBadge wait">Listing requested</span></p>
                  <p className="odRowMeta">{claim.category}{claim.address ? ` · ${claim.address}` : ""}</p>
                  <dl className="saFacts">
                    <div><dt>Requested by</dt><dd>{claim.user}</dd></div>
                    {claim.user_email && <div><dt>Email</dt><dd>{claim.user_email}</dd></div>}
                    {claim.user_mobile && <div><dt>Mobile</dt><dd>{claim.user_mobile}</dd></div>}
                    <div><dt>Proof</dt><dd>{claim.proof_path || "Not attached"}</dd></div>
                    <div><dt>Submitted</dt><dd>{when(claim.created_at)}</dd></div>
                  </dl>
                </div>
                <Decision
                  onAccept={() => run(() => apiPost("/admin/claims/", { claim_id: claim.id, decision: "approved" }), `Accepted. ${claim.business} is now Verified ✓.`)}
                  onReject={(note) => run(() => apiPost("/admin/claims/", { claim_id: claim.id, decision: "rejected", note }), "Listing request rejected.")}
                />
              </li>
            ))}
          </ul>
        ) : <p className="mutedText">No listing requests waiting.</p>}
      </section>
      <section className="odCard">
        <div className="odCardHead"><h2>New listings waiting to go live</h2><span className="saCount">{pending.length}</span></div>
        {pending.length ? (
          <ul className="saQueue">
            {pending.map((business) => (
              <li key={business.id}>
                <img className="cdThumb" src={coverFor(business)} alt="" />
                <div className="saQueueMain">
                  <p className="odRowTitle">{business.name} <span className="odBadge wait">Listing requested</span></p>
                  <p className="odRowMeta">{business.kind} · {business.category?.name ?? "No category"}{business.address ? ` · ${business.address}` : ""}</p>
                  {business.description && <p className="odClamp">{business.description}</p>}
                  <dl className="saFacts">
                    <div><dt>Owner</dt><dd>{business.owner_name || "—"}</dd></div>
                    {business.owner_email && <div><dt>Email</dt><dd>{business.owner_email}</dd></div>}
                    {business.phone && <div><dt>Phone</dt><dd>{business.phone}</dd></div>}
                    <div><dt>Requested</dt><dd>{when(business.approval_requested_at ?? undefined)}</dd></div>
                  </dl>
                </div>
                <Decision
                  acceptLabel="Verify & accept ✓"
                  onAccept={() => run(() => apiPost(`/admin/businesses/${business.id}/verify/`, { decision: "verify" }), `${business.name} is live and Verified ✓.`)}
                  onReject={(note) => run(() => apiPost(`/admin/businesses/${business.id}/verify/`, { decision: "reject", note }), "Listing sent back to the owner.")}
                />
              </li>
            ))}
          </ul>
        ) : <p className="mutedText">No new listings waiting.</p>}
      </section>
    </>
  );
}

function AllBusinesses({ businesses, run }: { businesses: AdminBusiness[]; run: Run }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [formKey, setFormKey] = useState(0);
  const rows = businesses.filter((b) => {
    const text = `${b.name} ${b.category?.name ?? ""} ${b.owner_name ?? ""} ${b.address ?? ""}`.toLowerCase();
    const st = isVerified(b) ? "verified" : b.hidden ? "hidden" : "pending";
    return (!query || text.includes(query.toLowerCase())) && (!status || st === status);
  });

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    await run(() => apiPost("/admin/businesses/", {
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "business"}-${Date.now().toString(36)}`,
      kind: form.get("kind"), category_id: form.get("category_id") || undefined, subcategory_id: form.get("subcategory_id") || undefined,
      category_data: categoryDataFromForm(form), description: form.get("description"),
      phone: form.get("phone"), whatsapp: form.get("whatsapp"), address: form.get("address"),
    }), "Field entry added. Verify it to make it public.");
    setFormKey((key) => key + 1);
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await run(() => apiUpload("/admin/businesses/import/", new FormData(form)), "CSV imported. Imported listings stay hidden until verified.");
    form.reset();
  }

  return (
    <>
      <SaHead title="All businesses" copy={`${businesses.length} listings in the directory.`} />
      <section className="odCard odFilters">
        <label className="odSearch"><span className="srOnly">Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, category, owner or area" /></label>
        <label><span className="srOnly">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="verified">Verified ✓</option><option value="pending">Pending</option><option value="hidden">Hidden</option></select></label>
      </section>
      <section className="odCard">
        <div className="odTableWrap">
          <table className="odTable saTable">
            <thead><tr><th>Business</th><th>Category</th><th>Status</th><th>Plan</th><th>Owner</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b><small>{b.address ?? ""}</small></td>
                  <td>{b.category?.name ?? "—"}</td>
                  <td>{isVerified(b) ? <span className="odBadge ok">Verified ✓</span> : b.hidden ? <span className="odBadge muted">Hidden</span> : <span className="odBadge wait">Pending</span>}</td>
                  <td><span className={`odPlan ${b.plan ?? "free"}`}>{b.plan ?? "free"}</span></td>
                  <td>{b.owner_name || "—"}</td>
                  <td className="saRowActions">
                    {!isVerified(b) && <button type="button" className="saBtn ok small" onClick={() => run(() => apiPost(`/admin/businesses/${b.id}/verify/`, { decision: "verify" }), `${b.name} verified ✓.`)}>Verify ✓</button>}
                    {!b.hidden && <button type="button" className="saBtn dangerOutline small" onClick={() => run(() => apiPost(`/admin/businesses/${b.id}/verify/`, { decision: "reject", note: "Hidden by admin" }), `${b.name} hidden.`)}>Hide</button>}
                    {!b.hidden && <a className="saBtn ghost small" href={`/business/${b.slug}`} aria-label={`Open ${b.name}`}><Icon name="ext" size={14} /></a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="odSplit">
        <section className="odCard"><h2>Add from the field</h2><BusinessForm key={formKey} onSubmit={createEntry} /></section>
        <section className="odCard">
          <h2>Import from CSV</h2>
          <p className="mutedText">Columns: name, kind, category_slug, plus optional phone, whatsapp, address, description. Up to 500 rows, 5 MB.</p>
          <form className="stackForm" onSubmit={importCsv}><input name="file" type="file" accept=".csv,text/csv" required /><button className="odBtn" type="submit">Import CSV</button></form>
        </section>
      </div>
    </>
  );
}

function Offers({ posts, run }: { posts: Post[]; run: Run }) {
  const [filter, setFilter] = useState("pending");
  const rows = posts.filter((p) => !filter || p.status === filter);
  return (
    <>
      <SaHead title="Offers & promotions" copy="Approve owner offers before residents see them.">
        <select className="odSelect" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter"><option value="pending">Under review</option><option value="approved">Live & published</option><option value="rejected">Rejected</option><option value="">All</option></select>
      </SaHead>
      <section className="odCard">
        {rows.length ? (
          <ul className="saQueue">
            {rows.map((post) => (
              <li key={post.id}>
                <div className="saQueueMain">
                  <p className="odEyebrow">{post.business}</p>
                  <p className="odRowTitle">{post.title}</p>
                  {post.body && <p className="odRowMeta">{post.body}</p>}
                  <p className="odRowMeta">{when(post.created_at)}</p>
                </div>
                {post.status === "pending" ? (
                  <div className="saActions">
                    <button type="button" className="saBtn ok" onClick={() => run(() => apiPost("/admin/posts/", { post_id: post.id, decision: "approved" }), "Offer approved and published.")}><Icon name="check" size={15} />Approve</button>
                    <button type="button" className="saBtn dangerOutline" onClick={() => run(() => apiPost("/admin/posts/", { post_id: post.id, decision: "rejected" }), "Offer rejected.")}><Icon name="x" size={15} />Reject</button>
                  </div>
                ) : <span className={`odBadge ${post.status === "approved" ? "ok" : "bad"}`}>{post.status === "approved" ? "Live & published" : "Rejected"}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="mutedText">Nothing here.</p>}
      </section>
    </>
  );
}

function PlanRequests({ requests, run }: { requests: PlanRequest[]; run: Run }) {
  return (
    <>
      <SaHead title="Plan & subscription requests" copy="Approving creates a pending invoice. The plan starts only after you record the payment under Payments & invoices." />
      <section className="odCard">
        {requests.length ? (
          <ul className="saQueue">
            {requests.map((item) => (
              <li key={item.id}>
                <div className="saQueueMain"><p className="odRowTitle">{item.business} <span className={`odPlan ${item.requested_plan}`}>{item.requested_plan}</span></p><p className="odRowMeta">Requested by {item.requested_by} · {when(item.created_at)}</p></div>
                <div className="saActions">
                  <button type="button" className="saBtn ok" onClick={() => run(() => apiPost("/admin/plan-requests/", { request_id: item.id, decision: "approve" }), `Approved. A pending ${item.requested_plan} invoice was created for ${item.business}; the plan starts when you record the payment.`)}><Icon name="check" size={15} />Approve</button>
                  <button type="button" className="saBtn dangerOutline" onClick={() => run(() => apiPost("/admin/plan-requests/", { request_id: item.id, decision: "reject" }), "Plan request rejected.")}><Icon name="x" size={15} />Reject</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="mutedText">No plan requests waiting.</p>}
      </section>
    </>
  );
}

function PaymentLedger({ payments }: { payments: Payment[] }) {
  return (
    <section className="odCard">
      <h2>Payment ledger</h2>
      {payments.length ? (
        <div className="odTableWrap">
          <table className="odTable">
            <thead><tr><th>Date</th><th>Business</th><th>Plan</th><th>Amount</th><th>GST</th><th>Method</th><th>Invoice</th></tr></thead>
            <tbody>{payments.map((p) => <tr key={p.id}><td>{when(p.paid_on)}</td><td>{p.business}</td><td>{p.plan}</td><td>{rupees(p.amount_paise)}</td><td>{rupees(p.gst_paise)}</td><td>{p.method}</td><td><code>{p.invoice}</code></td></tr>)}</tbody>
          </table>
        </div>
      ) : <p className="mutedText">No payments recorded yet.</p>}
    </section>
  );
}

function Reports({ reports, run }: { reports: ReportRow[]; run: Run }) {
  return (
    <>
      <SaHead title="Reports & complaints" copy="Residents flag wrong numbers, closed shops and other problems." />
      <section className="odCard">
        {reports.length ? (
          <ul className="saQueue">
            {reports.map((report) => (
              <li key={report.id}>
                <div className="saQueueMain"><p className="odRowTitle">{report.business} <span className={`odBadge ${report.status === "open" ? "wait" : "ok"}`}>{report.status === "open" ? "Open" : "Resolved"}</span></p><p className="odRowMeta">“{report.reason}” · {report.reporter || "Resident"} · {when(report.created_at)}</p></div>
                <div className="saActions">
                  <a className="saBtn ghost" href={`/business/${report.business_slug}`}><Icon name="ext" size={15} />Open listing</a>
                  {report.status === "open" && <button type="button" className="saBtn ok" onClick={() => run(() => apiPost("/admin/reports/", { report_id: report.id }), "Report resolved.")}><Icon name="check" size={15} />Mark resolved</button>}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="mutedText">No reports. 🎉</p>}
      </section>
    </>
  );
}

function SettingsForm({ settings, run }: { settings?: Settings; run: Run }) {
  if (!settings) return <p className="mutedText">Loading settings…</p>;
  return (
    <>
      <SaHead title="Settings" copy="Platform rules for plans and approvals." />
      <form className="odCard stackForm saSettings" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void run(() => apiPut("/admin/settings/", {
          grace_period_days: Number(form.get("grace_period_days")), free_pro_cap: Number(form.get("free_pro_cap")), approval_sla_hours: Number(form.get("approval_sla_hours")),
        }), "Settings saved.");
      }}>
        <label>Grace period after a plan expires (days)<input name="grace_period_days" type="number" min="0" defaultValue={settings.grace_period_days} /></label>
        <label>Free Pro offer cap (first N verified businesses)<input name="free_pro_cap" type="number" min="0" defaultValue={settings.free_pro_cap} /></label>
        <label>Approval target (hours)<input name="approval_sla_hours" type="number" min="0" defaultValue={settings.approval_sla_hours} /></label>
        <button className="odBtn" type="submit">Save settings</button>
      </form>
    </>
  );
}

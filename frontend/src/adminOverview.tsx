import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "./services/api";
import { money } from "./adminBilling";

/*
 * Admin home: ten panels, every number counted from the database when the
 * page loads (GET /api/admin/overview/). Nothing here is sample data.
 */

type Overview = {
  generated_at: string;
  businesses: { total: number; live: number; hidden: number; verified: number; new_7d: number; service: number; product: number; both: number; services: number; products: number };
  verification: { waiting: number; listing_requests: number; changes_requested: number; oldest_waiting_hours: number | null };
  users: { total: number; owners: number; residents: number; admins: number; new_7d: number; new_30d: number };
  categories: { categories: number; active: number; subcategories: number; in_use: number; top: { name: string; live: number }[] };
  offers: { live: number; pending: number; expired: number; rejected: number };
  plans: { free: number; pro: number; premium: number; pending_requests: number; ending_7d: number };
  billing: { paid_this_month_paise: number; paid_all_time_paise: number; outstanding_paise: number; outstanding: number; overdue: number; overdue_paise: number };
  support: { open: number; in_progress: number; waiting: number; resolved_7d: number; total: number };
  engagement: { views_30d: number; calls_30d: number; whatsapp_30d: number; saves_30d: number; reviews_30d: number };
  reports: { open: number; resolved: number; recent_admin_actions: { actor: string; action: string; at: string }[] };
};

const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Panel({ n, title, to, lead, leadLabel, rows, alert }: {
  n: number; title: string; to: string; lead: string | number; leadLabel: string;
  rows: [string, string | number][]; alert?: boolean;
}) {
  return (
    <Link to={to} className={`aoPanel ${alert ? "alert" : ""}`}>
      <p className="aoTitle"><span>{n}</span>{title}</p>
      <p className="aoLead"><strong>{lead}</strong><small>{leadLabel}</small></p>
      <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </Link>
  );
}

export function AdminOverview({ base }: { base: (path: string) => string }) {
  const { data: o, isLoading, isError, refetch, isFetching } = useQuery({ queryKey: ["admin-overview"], queryFn: () => apiGet<Overview>("/admin/overview/") });
  if (isLoading) return <p className="mutedText">Counting…</p>;
  if (isError || !o) return <p className="formError">Could not load the numbers. <button type="button" className="spLink" onClick={() => void refetch()}>Try again</button></p>;
  return (
    <section aria-label="Platform overview">
      <p className="aoMeta">Live from the database · {when(o.generated_at)} <button type="button" className="spLink" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "Refreshing…" : "Refresh"}</button></p>
      <div className="aoGrid">
        <Panel n={1} title="Businesses" to={base("businesses")} lead={o.businesses.live} leadLabel="live listings" rows={[
          ["All (not deleted)", o.businesses.total], ["Hidden", o.businesses.hidden], ["Verified ✓", o.businesses.verified],
          ["Service / Product / Both", `${o.businesses.service} / ${o.businesses.product} / ${o.businesses.both}`],
          ["Services / products listed", `${o.businesses.services} / ${o.businesses.products}`], ["New in 7 days", o.businesses.new_7d],
        ]} />
        <Panel n={2} title="Verification queue" to={base("verification")} lead={o.verification.waiting} leadLabel="waiting for approval" alert={o.verification.waiting > 0} rows={[
          ["Listing requests", o.verification.listing_requests], ["Sent back for changes", o.verification.changes_requested],
          ["Oldest waiting", o.verification.oldest_waiting_hours === null ? "–" : `${o.verification.oldest_waiting_hours} h`],
        ]} />
        <Panel n={3} title="People" to={base("users")} lead={o.users.total} leadLabel="accounts" rows={[
          ["Residents", o.users.residents], ["Business owners", o.users.owners], ["Admins", o.users.admins],
          ["New in 7 days", o.users.new_7d], ["New in 30 days", o.users.new_30d],
        ]} />
        <Panel n={4} title="Categories" to={base("categories")} lead={o.categories.in_use} leadLabel="categories with live listings" rows={[
          ["Categories (active)", `${o.categories.categories} (${o.categories.active})`], ["Subcategories", o.categories.subcategories],
          ...o.categories.top.slice(0, 3).map((item) => [item.name, item.live] as [string, number]),
        ]} />
        <Panel n={5} title="Offers" to={base("offers")} lead={o.offers.live} leadLabel="live now" alert={o.offers.pending > 0} rows={[
          ["Waiting for review", o.offers.pending], ["Expired", o.offers.expired], ["Rejected", o.offers.rejected],
        ]} />
        <Panel n={6} title="Plans" to={base("plan-requests")} lead={o.plans.pro + o.plans.premium} leadLabel="on a paid plan" alert={o.plans.pending_requests > 0} rows={[
          ["Free / Pro / Premium", `${o.plans.free} / ${o.plans.pro} / ${o.plans.premium}`], ["Plan requests waiting", o.plans.pending_requests],
          ["Paid plans ending in 7 days", o.plans.ending_7d],
        ]} />
        <Panel n={7} title="Revenue & invoices" to={base("payments")} lead={money(o.billing.paid_this_month_paise)} leadLabel="paid this month (incl. GST)" alert={o.billing.overdue > 0} rows={[
          ["Paid all time", money(o.billing.paid_all_time_paise)], ["Awaiting payment", `${o.billing.outstanding} · ${money(o.billing.outstanding_paise)}`],
          ["Overdue", `${o.billing.overdue} · ${money(o.billing.overdue_paise)}`],
        ]} />
        <Panel n={8} title="Support" to={base("support")} lead={o.support.open} leadLabel="new tickets" alert={o.support.open > 0} rows={[
          ["In progress", o.support.in_progress], ["Waiting for the person", o.support.waiting], ["Resolved in 7 days", o.support.resolved_7d], ["All tickets", o.support.total],
        ]} />
        <Panel n={9} title="Engagement (30 days)" to={base("businesses")} lead={o.engagement.calls_30d + o.engagement.whatsapp_30d} leadLabel="calls + WhatsApp taps" rows={[
          ["Listing views", o.engagement.views_30d], ["Calls", o.engagement.calls_30d], ["WhatsApp", o.engagement.whatsapp_30d],
          ["Saves", o.engagement.saves_30d], ["Reviews", o.engagement.reviews_30d],
        ]} />
        <Panel n={10} title="Reports & admin activity" to={base("reports")} lead={o.reports.open} leadLabel="open reports" alert={o.reports.open > 0} rows={[
          ["Resolved reports", o.reports.resolved],
          ...o.reports.recent_admin_actions.slice(0, 3).map((row) => [`${row.actor || "System"} · ${when(row.at)}`, row.action.replace(/_/g, " ")] as [string, string]),
        ]} />
      </div>
    </section>
  );
}

type UserRow = { id: string; name: string; email: string; mobile: string; account_type: string; profile_type: string; super_admin: boolean; businesses: number; tickets_open: number; joined: string; last_login: string | null; active: boolean };

export function AdminUsers({ me }: { me?: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function update(row: UserRow, data: Record<string, unknown>, text: string) {
    setMessage(""); setError("");
    try {
      await apiPatch(`/admin/users/${row.id}/`, data);
      setMessage(text);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The change failed.");
    }
  }
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["admin-users", query, type],
    queryFn: () => apiGet<UserRow[]>(`/admin/users/?q=${encodeURIComponent(query)}${type ? `&type=${type}` : ""}`),
  });
  const day = (value: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "–";
  return (
    <>
      <header className="saHead"><div><h1>People</h1><p className="mutedText">Every account, newest first. Read-only: people manage their own details.</p></div></header>
      <section className="odCard">
        <form className="auSearchRow" onSubmit={(event) => { event.preventDefault(); setQuery(q.trim()); }}>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, email or mobile" aria-label="Search people" />
          <select className="odSelect" value={type} onChange={(event) => setType(event.target.value)} aria-label="Account type">
            <option value="">Everyone</option><option value="resident">Residents</option><option value="business_owner">Business owners</option><option value="admin">Admins</option>
          </select>
          <button className="odBtn small" type="submit">Search</button>
        </form>
        <p className="odRowMeta">{isFetching ? "Loading…" : `${rows.length} ${rows.length === 1 ? "person" : "people"}${rows.length === 200 ? " (first 200)" : ""}`}</p>
        {message && <p className="successMessage" role="status">{message}</p>}
        {error && <p className="formError" role="alert">{error}</p>}
        <div className="odTableWrap">
          <table className="odTable">
            <thead><tr><th>Name</th><th>Email / mobile</th><th>Type</th><th>Listings</th><th>Open tickets</th><th>Joined</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}{!row.active && <span className="odBadge muted"> inactive</span>}</td>
                  <td>{row.email}{row.mobile && <><br /><small className="odRowMeta">{row.mobile}</small></>}</td>
                  <td>{row.account_type === "business_owner" ? "Business owner" : row.account_type === "admin" ? "Admin" : "Resident"}</td>
                  <td>{row.businesses}</td>
                  <td>{row.tickets_open}</td>
                  <td>{day(row.joined)}</td>
                  <td>{day(row.last_login)}</td>
                  <td className="biActions">
                    {row.id !== me && <>
                      <select className="odSelect small" value={row.profile_type} aria-label={`Account type for ${row.name}`}
                        onChange={(event) => void update(row, { account_type: event.target.value }, `${row.name} is now a ${event.target.value === "business_owner" ? "business owner" : "resident"}.`)}>
                        <option value="resident">Resident</option><option value="business_owner">Business owner</option>
                      </select>
                      <button type="button" className={`saBtn small ${row.active ? "dangerOutline" : "ok"}`}
                        onClick={() => { if (window.confirm(`${row.active ? "Deactivate" : "Reactivate"} ${row.name}?${row.active ? " They will be signed out and cannot sign in." : ""}`)) void update(row, { active: !row.active }, `${row.name} ${row.active ? "deactivated" : "reactivated"}.`); }}>
                        {row.active ? "Deactivate" : "Reactivate"}
                      </button>
                      <button type="button" className="saBtn ghost small"
                        onClick={() => { if (window.confirm(row.super_admin ? `Remove Super Admin from ${row.name}?` : `Make ${row.name} a Super Admin? They will control the whole platform.`)) void update(row, { super_admin: !row.super_admin }, `${row.name} ${row.super_admin ? "is no longer" : "is now"} a Super Admin.`); }}>
                        {row.super_admin ? "Remove admin" : "Make admin"}
                      </button>
                    </>}
                    {row.id === me && <small className="odRowMeta">You</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}


type CatalogRow = { id: string; type: "service" | "product"; name: string; business: string; business_slug: string; category: string; active: boolean; available: boolean; price?: string | null; price_min?: string | null; updated_at: string };

/** Every service and product: search, filter and switch inappropriate or duplicate entries off. */
export function AdminCatalog({ run }: { run: (action: () => Promise<unknown>, success: string) => Promise<void> }) {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["admin-catalog", type, status, query],
    queryFn: () => apiGet<CatalogRow[]>(`/admin/catalog/?${new URLSearchParams({ ...(type && { type }), ...(status && { status }), ...(query && { q: query }) })}`),
  });
  return (
    <>
      <header className="saHead"><div><h1>Products & services</h1><p className="mutedText">Every service and product owners have added. Switch off anything inappropriate or duplicated; owners see it as hidden.</p></div></header>
      <section className="odCard">
        <form className="auSearchRow acRow" onSubmit={(event) => { event.preventDefault(); setQuery(q.trim()); }}>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, business or category" aria-label="Search products and services" />
          <select className="odSelect" value={type} onChange={(event) => setType(event.target.value)} aria-label="Type"><option value="">Services and products</option><option value="service">Services</option><option value="product">Products</option></select>
          <select className="odSelect" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status"><option value="">Any status</option><option value="active">Shown</option><option value="inactive">Switched off</option></select>
          <button className="odBtn small" type="submit">Search</button>
        </form>
        <p className="odRowMeta">{isFetching ? "Loading…" : `${rows.length} items`}</p>
        <div className="odTableWrap">
          <table className="odTable">
            <thead><tr><th>Item</th><th>Business</th><th>Category</th><th>Price</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.type}-${row.id}`}>
                  <td><b>{row.name}</b><small>{row.type === "service" ? "Service" : "Product"}</small></td>
                  <td><a className="odLink" href={`/business/${row.business_slug}`}>{row.business}</a></td>
                  <td>{row.category}</td>
                  <td>{(row.type === "service" ? row.price_min : row.price) ? `₹${Number(row.type === "service" ? row.price_min : row.price).toLocaleString("en-IN")}` : "—"}</td>
                  <td><span className={`odBadge ${row.active ? "ok" : "muted"}`}>{row.active ? "Shown" : "Switched off"}</span></td>
                  <td>
                    <button type="button" className={`saBtn small ${row.active ? "dangerOutline" : "ok"}`}
                      onClick={() => run(() => apiPatch(`/admin/catalog/${row.type}/${row.id}/`, { active: !row.active }), `${row.name} ${row.active ? "switched off" : "shown again"}.`)}>
                      {row.active ? "Switch off" : "Show again"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

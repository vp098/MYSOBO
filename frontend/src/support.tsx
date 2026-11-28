import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, X } from "lucide-react";
import { apiGet, apiPost, type Business, type PortalUser } from "./services/api";
import { useT, type MessageKey } from "./i18n";

/*
 * Support: a floating chat that opens tickets (it first asks which plan the
 * person is on), ticket threads with history, and the admin queue.
 */

export type TicketEvent = { id: string; kind: "message" | "status"; body: string; staff: boolean; author: string; from_status: string; to_status: string; created_at: string };
export type Ticket = {
  id: string; code: string; subject: string; description: string; category: string; plan: string;
  status: "open" | "in_progress" | "waiting" | "resolved" | "closed"; business: string; business_id: string | null;
  created_at: string; updated_at: string; resolved_at: string | null; user?: string; user_email?: string; events?: TicketEvent[];
};

const PLANS = ["free", "pro", "premium", "not_sure", "resident"] as const;
const CATEGORIES = ["listing", "billing", "account", "technical", "report", "other"] as const;
export const STATUS_CLASS: Record<Ticket["status"], string> = { open: "wait", in_progress: "wait", waiting: "info", resolved: "ok", closed: "muted" };

function useWhen() {
  const { lang } = useT();
  const locale = lang === "gu" ? "gu-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  return (value: string) => new Date(value).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function TicketStatus({ status }: { status: Ticket["status"] }) {
  const { t } = useT();
  return <span className={`odBadge ${STATUS_CLASS[status]}`}>{t(`sp.st.${status}` as MessageKey)}</span>;
}

/** One ticket's history with a reply box. `staff` switches to the admin reply endpoint. */
export function TicketThread({ ticketId, staff = false, onBack }: { ticketId: string; staff?: boolean; onBack?: () => void }) {
  const { t } = useT();
  const when = useWhen();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const { data: ticket } = useQuery({ queryKey: ["ticket", ticketId], queryFn: () => apiGet<Ticket>(`/support/tickets/${ticketId}/`), refetchInterval: 30_000 });
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [ticket?.events?.length]);

  async function send(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const payload = { ...(body.trim() ? { body: body.trim() } : {}), ...extra };
      const updated = staff
        ? await apiPost<Ticket>(`/admin/tickets/${ticketId}/`, payload)
        : await apiPost<Ticket>(`/support/tickets/${ticketId}/reply/`, payload);
      queryClient.setQueryData(["ticket", ticketId], updated);
      await queryClient.invalidateQueries({ queryKey: [staff ? "admin-tickets" : "my-tickets"] });
      setBody("");
      setNextStatus("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.request"));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (staff) void send(nextStatus ? { status: nextStatus } : {});
    else if (body.trim()) void send();
  }

  if (!ticket) return <p className="mutedText">{t("home.finding")}</p>;
  const closed = ticket.status === "closed";
  return (
    <div className="spThread">
      <div className="spThreadHead">
        {onBack && <button type="button" className="spLink" onClick={onBack}>← {t("sp.back")}</button>}
        <div>
          <p className="spCode">{ticket.code} · {t(`sp.cat.${ticket.category}` as MessageKey)}{ticket.business ? ` · ${ticket.business}` : ""}</p>
          <h3>{ticket.subject}</h3>
          {staff && <p className="odRowMeta">{ticket.user} · {ticket.user_email} · {t(`sp.plan.${ticket.plan}` as MessageKey)}</p>}
        </div>
        <TicketStatus status={ticket.status} />
      </div>
      <div className="spEvents">
        <div className="spMsg mine"><p>{ticket.description}</p><small>{when(ticket.created_at)}</small></div>
        {(ticket.events ?? []).map((event) => event.kind === "status" ? (
          <p key={event.id} className="spStatusLine">{t("sp.statusChanged", { status: t(`sp.st.${event.to_status}` as MessageKey) })} · {when(event.created_at)}</p>
        ) : (
          <div key={event.id} className={`spMsg ${event.staff === staff ? "mine" : "theirs"} ${event.staff ? "team" : ""}`}>
            {event.staff !== staff && <b>{event.author}</b>}
            <p>{event.body}</p>
            <small>{when(event.created_at)}</small>
          </div>
        ))}
        <div ref={end} />
      </div>
      {closed && !staff ? <p className="mutedText">{t("sp.closedNote")}</p> : (
        <form className="spReply" onSubmit={submit}>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={2} maxLength={4000}
            placeholder={ticket.status === "resolved" && !staff ? t("sp.reopenHint") : t("sp.replyPh")} aria-label={t("sp.replyPh")} />
          <div className="spReplyRow">
            {staff ? (
              <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} aria-label="Status">
                <option value="">Keep status</option>
                {(["open", "in_progress", "waiting", "resolved", "closed"] as const).map((value) => <option key={value} value={value}>{t(`sp.st.${value}` as MessageKey)}</option>)}
              </select>
            ) : (
              <button type="button" className="spLink" disabled={busy} onClick={() => void send({ close: true })}>{t("sp.close")}</button>
            )}
            <button type="submit" className="odBtn small" disabled={busy || (!body.trim() && !nextStatus)}><Send size={15} />{staff ? "Send" : t("sp.send")}</button>
          </div>
        </form>
      )}
      {error && <p className="formError">{error}</p>}
    </div>
  );
}

/** The person's own tickets: a list, and the thread of the one picked. */
export function MyTickets({ initial }: { initial?: string }) {
  const { t } = useT();
  const when = useWhen();
  const [open, setOpen] = useState(initial ?? "");
  const { data: tickets = [], isLoading } = useQuery({ queryKey: ["my-tickets"], queryFn: () => apiGet<Ticket[]>("/support/tickets/") });
  if (open) return <TicketThread ticketId={open} onBack={() => setOpen("")} />;
  if (isLoading) return <p className="mutedText">{t("home.finding")}</p>;
  if (!tickets.length) return <p className="mutedText">{t("sp.none")}</p>;
  return (
    <ul className="spList">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <button type="button" onClick={() => setOpen(ticket.id)}>
            <span><b>{ticket.subject}</b><small>{ticket.code} · {when(ticket.updated_at)}</small></span>
            <TicketStatus status={ticket.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}

type Step = "plan" | "category" | "details" | "done";

/** Conversation that opens a ticket. It always starts by asking about the plan. */
function NewRequest({ onCreated }: { onCreated: (ticket: Ticket) => void }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("plan");
  const [plan, setPlan] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: owned = [] } = useQuery({ queryKey: ["owner-businesses"], queryFn: () => apiGet<Business[]>("/owner/businesses/") });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const ticket = await apiPost<Ticket>("/support/tickets/", {
        plan, category,
        subject: form.get("subject"), description: form.get("description"),
        business_id: form.get("business_id") || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
      onCreated(ticket);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="spChat">
      <div className="spMsg theirs team"><b>{t("sp.team")}</b><p>{t("sp.hello")}</p></div>
      <div className="spMsg theirs team"><p>{t("sp.askPlan")}</p></div>
      {step === "plan" ? (
        <div className="spChips">{PLANS.map((value) => <button key={value} type="button" onClick={() => { setPlan(value); setStep("category"); }}>{t(`sp.plan.${value}` as MessageKey)}</button>)}</div>
      ) : <div className="spMsg mine"><p>{t(`sp.plan.${plan}` as MessageKey)}</p></div>}
      {step !== "plan" && <div className="spMsg theirs team"><p>{t("sp.askCategory")}</p></div>}
      {step === "category" && (
        <div className="spChips">{CATEGORIES.map((value) => <button key={value} type="button" onClick={() => { setCategory(value); setStep("details"); }}>{t(`sp.cat.${value}` as MessageKey)}</button>)}</div>
      )}
      {step === "details" && (
        <>
          <div className="spMsg mine"><p>{t(`sp.cat.${category}` as MessageKey)}</p></div>
          <div className="spMsg theirs team"><p>{t("sp.askDetails")}</p></div>
          <form className="spForm" onSubmit={submit}>
            {owned.length > 0 && (
              <label>{t("owner.business")}
                <select name="business_id" defaultValue={owned.length === 1 ? owned[0].id : ""}><option value="">{t("sp.noListing")}</option>{owned.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </label>
            )}
            <label>{t("sp.subject")}<input name="subject" required minLength={4} maxLength={150} /></label>
            <label>{t("sp.description")}<textarea name="description" required minLength={10} maxLength={4000} rows={4} /></label>
            {error && <p className="formError">{error}</p>}
            <div className="spReplyRow">
              <button type="button" className="spLink" onClick={() => setStep("plan")}>{t("sp.startOver")}</button>
              <button type="submit" className="odBtn small" disabled={busy}><Send size={15} />{t("sp.submit")}</button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

/** Floating help button and chat panel, on every page for residents and owners. */
export function SupportChat({ user }: { user?: PortalUser }) {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [created, setCreated] = useState<Ticket | null>(null);
  const [focusTicket, setFocusTicket] = useState("");
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (user?.is_superadmin) return null;

  function login() {
    const next = new URLSearchParams(params);
    next.set("dialog", "login");
    setParams(next);
  }

  return (
    <>
      <button type="button" className={`spFab ${open ? "on" : ""}`} aria-expanded={open} aria-controls="support-panel"
        onClick={() => setOpen((value) => !value)} aria-label={open ? t("close") : t("sp.open")}>
        {open ? <X size={24} /> : <MessageCircle size={24} />}
        {!open && <span>{t("sp.fab")}</span>}
      </button>
      {open && (
        <section id="support-panel" className="spPanel" role="dialog" aria-label={t("sp.title")}>
          <header className="spPanelHead">
            <div><b>{t("sp.title")}</b><small>{t("sp.replyTime")}</small></div>
            <button type="button" className="spIcon" onClick={() => setOpen(false)} aria-label={t("close")}><X size={18} /></button>
          </header>
          {!user ? (
            <div className="spChat">
              <div className="spMsg theirs team"><b>{t("sp.team")}</b><p>{t("sp.hello")}</p></div>
              <div className="spMsg theirs team"><p>{t("sp.loginFirst")}</p></div>
              <button type="button" className="odBtn" onClick={login}>{t("nav.login")}</button>
            </div>
          ) : (
            <>
              <div className="spTabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "new"} className={tab === "new" ? "on" : ""} onClick={() => { setTab("new"); setCreated(null); }}>{t("sp.newTab")}</button>
                <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "on" : ""} onClick={() => { setTab("mine"); setFocusTicket(""); }}>{t("sp.mineTab")}</button>
              </div>
              <div className="spBody">
                {tab === "new" && !created && <NewRequest onCreated={setCreated} />}
                {tab === "new" && created && (
                  <div className="spChat">
                    <div className="spMsg theirs team"><b>{t("sp.team")}</b><p>{t("sp.created", { code: created.code })}</p></div>
                    <button type="button" className="odBtn small" onClick={() => { setFocusTicket(created.id); setTab("mine"); setCreated(null); }}>{t("sp.viewTicket")}</button>
                  </div>
                )}
                {tab === "mine" && <MyTickets key={focusTicket} initial={focusTicket} />}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

/** Admin queue: filter, open a ticket, reply and resolve. */
export function AdminTickets() {
  const { t } = useT();
  const when = useWhen();
  const [status, setStatus] = useState("active");
  const [open, setOpen] = useState("");
  const { data: tickets = [] } = useQuery({ queryKey: ["admin-tickets", status], queryFn: () => apiGet<Ticket[]>(`/admin/tickets/?status=${status}`), refetchInterval: 60_000 });
  return (
    <>
      <header className="saHead"><div><h1>Support tickets</h1><p className="mutedText">Reply as the MySobo team, change the status and resolve requests. Owners see "MySobo team", not your name.</p></div></header>
      <div className="odSplit wideLeft spAdmin">
        <section className="odCard">
          <div className="odCardHead">
            <h2>Queue</h2>
            <select className="odSelect" value={status} onChange={(event) => { setStatus(event.target.value); setOpen(""); }} aria-label="Filter tickets">
              <option value="active">Needs attention</option><option value="">All</option>
              {(["open", "in_progress", "waiting", "resolved", "closed"] as const).map((value) => <option key={value} value={value}>{t(`sp.st.${value}` as MessageKey)}</option>)}
            </select>
          </div>
          {tickets.length ? (
            <ul className="spList">
              {tickets.map((ticket) => (
                <li key={ticket.id} className={open === ticket.id ? "on" : ""}>
                  <button type="button" onClick={() => setOpen(ticket.id)}>
                    <span><b>{ticket.subject}</b><small>{ticket.code} · {ticket.user} · {t(`sp.plan.${ticket.plan}` as MessageKey)} · {t(`sp.cat.${ticket.category}` as MessageKey)} · {when(ticket.updated_at)}</small></span>
                    <TicketStatus status={ticket.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="mutedText">No tickets here.</p>}
        </section>
        <section className="odCard">
          {open ? <TicketThread key={open} ticketId={open} staff /> : <p className="mutedText">Pick a ticket to read and reply.</p>}
        </section>
      </div>
    </>
  );
}

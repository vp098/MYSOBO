import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./services/api";

/*
 * Admin billing: plan prices and limits, invoices, and recording UPI or cash
 * payments. Recording a payment is the only way an invoice becomes paid and a
 * paid plan becomes active.
 */

type Run = (action: () => Promise<unknown>, success: string) => Promise<void>;
export type AdminPlan = { plan: string; monthly_price: number; active: boolean; max_photos: number; max_active_offers: number };
export type InvoiceRow = {
  id: string; number: string; business_id: string; business: string; plan: string;
  period_start: string; period_end: string; issued_on: string; due_on: string;
  amount_paise: number; gst_percent: number; gst_paise: number; total_paise: number;
  status: "pending" | "paid" | "overdue" | "cancelled"; paid_on: string | null; method: string; pdf_url: string;
};

export const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const day = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
const STATUS_CLASS: Record<InvoiceRow["status"], string> = { pending: "wait", paid: "ok", overdue: "bad", cancelled: "muted" };

function Head({ title, copy }: { title: string; copy: string }) {
  return <header className="saHead"><div><h1>{title}</h1><p className="mutedText">{copy}</p></div></header>;
}

export function AdminPricing({ plans, run }: { plans: AdminPlan[]; run: Run }) {
  const order = ["free", "pro", "premium"];
  const rows = [...plans].sort((a, b) => order.indexOf(a.plan) - order.indexOf(b.plan));
  return (
    <>
      <Head title="Pricing and plan limits" copy="Monthly prices before 18% GST, and what each plan allows. Limits are enforced by the server." />
      <section className="odPlans">
        {rows.map((plan) => (
          <form key={plan.plan} className={`odPlanCard ${plan.plan}`} onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run(() => apiPut("/admin/plans/", {
              plan: plan.plan,
              monthly_price: Number(form.get("price")),
              max_photos: Number(form.get("max_photos")),
              max_active_offers: Number(form.get("max_active_offers")),
              active: form.get("active") === "on",
            }), `${plan.plan} plan saved.`);
          }}>
            <div className="odPlanHead"><h2 style={{ textTransform: "capitalize" }}>{plan.plan}</h2></div>
            <label className="saField">Monthly price (₹, before GST)<input name="price" type="number" min="0" step="1" defaultValue={plan.monthly_price} required /></label>
            <p className="odRowMeta">With 18% GST: {money(Math.round(plan.monthly_price * 100 * 1.18))}</p>
            <label className="saField">Photos per listing<input name="max_photos" type="number" min="0" step="1" defaultValue={plan.max_photos} required /></label>
            <label className="saField">Active offers per listing<input name="max_active_offers" type="number" min="0" step="1" defaultValue={plan.max_active_offers} required /></label>
            <label className="saCheck"><input name="active" type="checkbox" defaultChecked={plan.active} /> Available to owners</label>
            <button className={`odBtn odFull ${plan.plan === "premium" ? "add" : ""}`} type="submit">Save</button>
          </form>
        ))}
        {!rows.length && <p className="mutedText">No plans set up yet.</p>}
      </section>
    </>
  );
}

function PayForm({ invoice, run, onDone }: { invoice: InvoiceRow; run: Run; onDone: () => void }) {
  const [method, setMethod] = useState("upi");
  return (
    <form className="biPay" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void run(() => apiPost(`/admin/invoices/${invoice.id}/pay/`, { method, reference: form.get("reference") || "" }),
        `${invoice.number} marked paid. ${invoice.business} is now on ${invoice.plan}.`).then(onDone);
    }}>
      <p className="odRowTitle">Record payment of {money(invoice.total_paise)} for {invoice.number}</p>
      <div className="biPayRow">
        <label className="saField">Method
          <select value={method} onChange={(event) => setMethod(event.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option></select>
        </label>
        <label className="saField">{method === "upi" ? "UPI transaction ID *" : "Receipt note (optional)"}
          <input name="reference" required={method === "upi"} maxLength={200} />
        </label>
      </div>
      <p className="odSmall">Only record money you have actually received. This activates the {invoice.plan} plan.</p>
      <div className="saActions"><button className="saBtn ok" type="submit">Mark paid</button><button className="saBtn ghost" type="button" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

export function AdminInvoices({ run }: { run: Run }) {
  const [status, setStatus] = useState("");
  const [paying, setPaying] = useState<string>("");
  const { data: invoices = [] } = useQuery({
    queryKey: ["admin-invoices", status],
    queryFn: () => apiGet<InvoiceRow[]>(`/admin/invoices/${status ? `?status=${status}` : ""}`),
  });
  const open = invoices.filter((item) => item.status === "pending" || item.status === "overdue");
  return (
    <>
      <Head title="Invoices and payments" copy="Invoices are created when a plan request is approved and each month before renewal. Mark one paid when UPI or cash arrives." />
      <section className="odKpis saKpis biKpis">
        <div className="odKpi"><div className="odKpiTop"><span>Shown</span></div><strong>{invoices.length}</strong></div>
        <div className="odKpi"><div className="odKpiTop"><span>Awaiting payment</span></div><strong>{open.length}</strong></div>
        <div className="odKpi"><div className="odKpiTop"><span>Awaiting (with GST)</span></div><strong>{money(open.reduce((sum, item) => sum + item.total_paise, 0))}</strong></div>
      </section>
      <section className="odCard">
        <div className="odCardHead">
          <h2>Invoices</h2>
          <select className="odSelect" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
        {invoices.length ? (
          <div className="odTableWrap">
            <table className="odTable">
              <thead><tr><th>Invoice</th><th>Business</th><th>Plan</th><th>Period</th><th>Total</th><th>Due</th><th>Status</th><th /></tr></thead>
              <tbody>
                {invoices.map((item) => (
                  <Fragment key={item.id}>
                    <tr>
                      <td><code>{item.number}</code></td>
                      <td>{item.business}</td>
                      <td style={{ textTransform: "capitalize" }}>{item.plan}</td>
                      <td>{day(item.period_start)} – {day(item.period_end)}</td>
                      <td>{money(item.total_paise)}<br /><small className="odRowMeta">{money(item.amount_paise)} + GST {money(item.gst_paise)}</small></td>
                      <td>{day(item.due_on)}</td>
                      <td><span className={`odBadge ${STATUS_CLASS[item.status]}`} style={{ textTransform: "capitalize" }}>{item.status}</span>{item.paid_on && <><br /><small className="odRowMeta">{day(item.paid_on)} · {item.method.toUpperCase()}</small></>}</td>
                      <td className="biActions">
                        <a className="saBtn ghost small" href={item.pdf_url}>PDF</a>
                        {(item.status === "pending" || item.status === "overdue") && <button type="button" className="saBtn ok small" onClick={() => setPaying(item.id)}>Record payment</button>}
                      </td>
                    </tr>
                    {paying === item.id && <tr><td colSpan={8}><PayForm invoice={item} run={run} onDone={() => setPaying("")} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mutedText">No invoices{status ? ` with status ${status}` : ""} yet.</p>}
      </section>
    </>
  );
}

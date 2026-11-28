import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiUploadWithProgress, type Business, type PortalUser } from "./services/api";
import { useT, type MessageKey } from "./i18n";
import { BusinessForm, categoryDataFromForm } from "./App";
import { Icon, OfferBadge, PageHead, StateBadge, listingState, useDate, type DashData, type OwnerPost, type PlanKey } from "./owner";
import { ME_KEY, ROUTES } from "./session";

/*
 * Phase C owner flows: the onboarding wizard (type, plan, business details,
 * photos, submit for approval), approval requests with the team's feedback,
 * offers with edit/delete and dates, and the profile picture.
 */

type PublicPlans = { gst_percent: number; plans: { plan: PlanKey; monthly_price: number; monthly_total: number; max_photos: number; max_active_offers: number }[] };
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const to = (path: string) => `${ROUTES.owner}/${path}`;

function money(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

/** Visit options, business email and GST number: shared by the wizard. */
export function BusinessExtraFields({ business }: { business?: Business }) {
  const { t } = useT();
  const [gst, setGst] = useState(business?.gst_number ?? "");
  const gstBad = gst.length > 0 && !GSTIN.test(gst.toUpperCase());
  return (
    <>
      <fieldset className="obVisits">
        <legend>{t("ob.visitTitle")}</legend>
        <label className="checkLabel"><input type="checkbox" name="home_visit" defaultChecked={business?.home_visit} />{t("ob.homeVisit")}</label>
        <label className="checkLabel"><input type="checkbox" name="onsite_visit" defaultChecked={business?.onsite_visit} />{t("ob.onsiteVisit")}</label>
      </fieldset>
      <label>{t("ob.email")}<input name="email" type="email" autoComplete="email" defaultValue={business?.email ?? ""} /></label>
      <label>
        {t("ob.gst")}
        <input name="gst_number" value={gst} maxLength={15} autoCapitalize="characters" onChange={(event) => setGst(event.target.value.toUpperCase())} aria-invalid={gstBad} />
        <small className={gstBad ? "formError" : "odSmall"}>{t("ob.gstHint")}</small>
      </label>
    </>
  );
}

type Draft = Record<string, unknown>;

export function OnboardingWizard({ owned }: DashData) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Business["kind"] | "">("");
  const [plan, setPlan] = useState<PlanKey>("free");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const { data: pricing } = useQuery({ queryKey: ["public-plans"], queryFn: () => apiGet<PublicPlans>("/plans/") });
  // A new listing starts on Free until a paid plan's payment is recorded.
  const FREE_PHOTO_LIMIT = pricing?.plans.find((row) => row.plan === "free")?.max_photos ?? 3;
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
  const total = 5;

  function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const gst = String(form.get("gst_number") ?? "").trim().toUpperCase();
    if (gst && !GSTIN.test(gst)) { setError(t("ob.gstHint")); return; }
    setError("");
    setDraft({
      name: String(form.get("name") ?? "").trim(),
      kind: form.get("kind") || kind,
      description: form.get("description"),
      phone: form.get("phone"),
      whatsapp: form.get("whatsapp"),
      address: form.get("address"),
      email: form.get("email") || "",
      gst_number: gst,
      home_visit: form.get("home_visit") === "on",
      onsite_visit: form.get("onsite_visit") === "on",
      category_id: form.get("category_id") || undefined,
      subcategory_id: form.get("subcategory_id") || undefined,
      category_data: categoryDataFromForm(form),
    });
    setStep(3);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list); // copy now: the input is cleared right after
    setFiles((current) => [...current, ...picked].slice(0, FREE_PHOTO_LIMIT));
  }

  async function submit() {
    if (!draft) return;
    setError("");
    try {
      setBusy(t("ob.creating"));
      const name = String(draft.name);
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "business"}-${Date.now().toString(36)}`;
      const created = await apiPost<Business>("/businesses/", { ...draft, slug });
      if (files.length) {
        setBusy(t("ob.uploading"));
        const form = new FormData();
        files.forEach((file) => form.append("files", file, file.name));
        await apiUploadWithProgress(`/owner/businesses/${created.id}/photos/`, form, () => undefined);
      }
      if (plan !== "free") {
        setBusy(t("ob.requestingPlan"));
        await apiPost("/owner/plans/", { business_id: created.id, plan });
      }
      setBusy(t("ob.sending"));
      await apiPost(`/owner/businesses/${created.id}/request-approval/`);
      await queryClient.invalidateQueries();
      navigate(`${to("approvals")}?new=${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.request"));
    } finally {
      setBusy("");
    }
  }

  const planRow = pricing?.plans.find((row) => row.plan === plan);

  return (
    <div className="wiz obWiz">
      <div className="wizMain">
        <div className="wizTop">
          <span className="wizStep">{t("wiz.step", { n: step + 1, total })}</span>
          <span className="wizBar"><span style={{ width: `${((step + 1) / total) * 100}%` }} /></span>
        </div>
        {error && <p className="formError" role="alert">{error}</p>}

        {step === 0 && (
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
            <div className="wizNav"><span /><button type="button" className="odBtn" disabled={!kind} onClick={() => setStep(1)}>{t("wiz.next")} <Icon name="arrow" size={16} /></button></div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>{t("ob.planTitle")}</h1>
            <p className="wizHint">{t("ob.planHint")}</p>
            <div className="obPlans" role="radiogroup" aria-label={t("ob.planTitle")}>
              {(pricing?.plans ?? []).map((row) => (
                <button key={row.plan} type="button" role="radio" aria-checked={plan === row.plan} className={plan === row.plan ? "on" : ""} onClick={() => setPlan(row.plan)}>
                  <b>{t(`od.plan.${row.plan}` as MessageKey)}</b>
                  <span className="obPrice">₹{money(row.monthly_price)}<small> / {t("od.month")}</small></span>
                  <small>{row.monthly_price ? t("land.withGst", { total: money(row.monthly_total), gst: pricing?.gst_percent ?? 18 }) : t("land.freeForever")}</small>
                  <small className="obTag">{t(`od.planTag.${row.plan}` as MessageKey)}</small>
                </button>
              ))}
            </div>
            {plan !== "free" && <p className="obNote"><Icon name="clock" size={16} />{t("ob.planPending")}</p>}
            <div className="wizNav">
              <button type="button" className="odBtn outline" onClick={() => setStep(0)}>{t("wiz.back")}</button>
              <button type="button" className="odBtn" onClick={() => setStep(2)}>{t("wiz.next")} <Icon name="arrow" size={16} /></button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>{t("ob.infoTitle")}</h1>
            <p className="wizHint">{t("od.addCopy")}</p>
            <section className="odCard wizForm">
              <BusinessForm defaultKind={kind || "service"} onSubmit={saveDetails} extra={<BusinessExtraFields />} submitLabel={t("wiz.next")} />
            </section>
            <div className="wizNav"><button type="button" className="odBtn outline" onClick={() => setStep(1)}>{t("wiz.back")}</button><span /></div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>{t("ob.photosTitle")}</h1>
            <p className="wizHint">{t("ob.photosHint", { n: FREE_PHOTO_LIMIT })}</p>
            <div className="obPhotos">
              {previews.map((url, index) => (
                <figure key={url}>
                  <img src={url} alt="" />
                  <button type="button" className="odBtn small outline" onClick={() => setFiles((list) => list.filter((_, i) => i !== index))}>{t("ob.remove")}</button>
                </figure>
              ))}
              {files.length < FREE_PHOTO_LIMIT && (
                <label className="obPick">
                  <Icon name="image" size={24} />
                  <span>{t("ob.pick")}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
                </label>
              )}
            </div>
            <p className="odSmall">{t("ob.photoCount", { n: files.length, max: FREE_PHOTO_LIMIT })}</p>
            <div className="wizNav">
              <button type="button" className="odBtn outline" onClick={() => setStep(2)}>{t("wiz.back")}</button>
              <button type="button" className="odBtn" onClick={() => setStep(4)}>{t("wiz.next")} <Icon name="arrow" size={16} /></button>
            </div>
          </>
        )}

        {step === 4 && draft && (
          <>
            <h1>{t("ob.reviewTitle")}</h1>
            <p className="wizHint">{t("ob.reviewHint")}</p>
            <dl className="odFacts obReview">
              <div><dt>{t("ob.r.name")}</dt><dd>{String(draft.name)}</dd></div>
              <div><dt>{t("ob.r.type")}</dt><dd>{t(`wiz.k.${String(draft.kind || kind)}` as MessageKey)}</dd></div>
              <div><dt>{t("ob.r.plan")}</dt><dd>{t(`od.plan.${plan}` as MessageKey)}{planRow && planRow.monthly_price ? ` · ₹${money(planRow.monthly_total)} / ${t("od.month")}` : ""}</dd></div>
              <div><dt>{t("ob.visitTitle")}</dt><dd>{[draft.home_visit && t("ob.homeVisit"), draft.onsite_visit && t("ob.onsiteVisit")].filter(Boolean).join(" · ") || "–"}</dd></div>
              {Boolean(draft.address) && <div><dt>{t("form.address")}</dt><dd>{String(draft.address)}</dd></div>}
              {Boolean(draft.phone) && <div><dt>{t("form.phone")}</dt><dd>{String(draft.phone)}</dd></div>}
              {Boolean(draft.email) && <div><dt>{t("ob.email")}</dt><dd>{String(draft.email)}</dd></div>}
              {Boolean(draft.gst_number) && <div><dt>{t("ob.gstShort")}</dt><dd>{String(draft.gst_number)}</dd></div>}
              <div><dt>{t("ob.r.photos")}</dt><dd>{files.length}</dd></div>
            </dl>
            <div className="wizNav">
              <button type="button" className="odBtn outline" disabled={Boolean(busy)} onClick={() => setStep(3)}>{t("wiz.back")}</button>
              <button type="button" className="odBtn" disabled={Boolean(busy)} onClick={() => void submit()}>{busy || t("ob.submit")}</button>
            </div>
          </>
        )}
      </div>
      <aside className="wizAside" aria-hidden="true">
        <span className="heroShape a" /><span className="heroShape b" />
        <div className="wizAsideCard">
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

/** Listing approval requests: where each listing stands, the team's feedback, send again. */
export function ApprovalRequests({ owned, isLoading, perform }: DashData) {
  const { t } = useT();
  const date = useDate();
  const fresh = new URLSearchParams(window.location.search).get("new");
  const rows = [...owned].sort((a, b) => (b.approval_requested_at ?? b.created_at ?? "").localeCompare(a.approval_requested_at ?? a.created_at ?? ""));
  return (
    <>
      <PageHead title={t("ap.title")} copy={t("ap.copy")} />
      {fresh && <p className="successMessage">{t("ob.done")}</p>}
      {isLoading ? <p className="mutedText">{t("home.finding")}</p> : rows.length ? (
        <ul className="apList">
          {rows.map((business) => {
            const state = listingState(business);
            const changes = state === "draft" && Boolean(business.review_note);
            return (
              <li key={business.id} className="odCard">
                <div className="apTop">
                  <div><h3>{business.name}</h3><p className="odRowMeta">{business.approval_requested_at ? t("od.submittedOn", { date: date(business.approval_requested_at) }) : t("ap.notSent")}</p></div>
                  {changes ? <span className="odBadge bad">{t("ap.changes")}</span> : <StateBadge state={state} />}
                </div>
                {business.review_note && (
                  <div className="apNote"><Icon name="chat" size={16} /><div><b>{t("ap.feedback")}</b><p>{business.review_note}</p></div></div>
                )}
                <div className="apActions">
                  <Link className="odBtn small outline" to={`${to("businesses")}?edit=${business.id}`}>{t("od.editListing")}</Link>
                  {state === "draft" && (
                    <button type="button" className="odBtn small" onClick={() => void perform(() => apiPost(`/owner/businesses/${business.id}/request-approval/`), t("od.approvalSent", { name: business.name }))}>
                      {changes ? t("ap.resubmit") : t("ap.send")}
                    </button>
                  )}
                  {state === "live" && <a className="odBtn small outline" href={ROUTES.business(business.slug)}>{t("od.viewPublic")}</a>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="mutedText">{t("ap.empty")} <Link className="odLink" to={to("add")}>{t("od.nav.add")}</Link></p>}
    </>
  );
}

type OfferFilter = "all" | "active" | "review" | "expired";

function offerState(post: OwnerPost): OfferFilter {
  const today = new Date().toISOString().slice(0, 10);
  if (post.expires_on && post.expires_on < today) return "expired";
  if (post.status === "approved") return "active";
  return "review";
}

/** Offers: create, edit, delete, start and end dates, plan limits enforced by the server. */
export function OffersManager({ owned, posts, perform }: DashData) {
  const { t } = useT();
  const date = useDate();
  const [editing, setEditing] = useState<OwnerPost | null>(null);
  const [filter, setFilter] = useState<OfferFilter>("all");
  const [formKey, setFormKey] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const nameOf = (id: string) => owned.find((item) => item.id === id)?.name ?? "";
  const shown = posts.filter((post) => filter === "all" || offerState(post) === filter)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      title: form.get("title"), body: form.get("body"),
      starts_on: form.get("starts_on") || null, expires_on: form.get("expires_on") || null,
    };
    const ok = editing
      ? await perform(() => apiPatch(`/owner/posts/${editing.id}/`, body), t("of.updated"))
      : await perform(() => apiPost("/owner/posts/", { ...body, business_id: form.get("business_id") }).catch((cause: unknown) => {
        // The server explains plan limits in English; show it in the person's language.
        if (cause instanceof ApiError && cause.status === 409) throw new Error(t("of.limitReached"));
        throw cause;
      }), t("owner.offerSent"));
    if (ok !== null) { setEditing(null); setFormKey((key) => key + 1); }
  }

  return (
    <>
      <PageHead title={t("od.nav.offers")} copy={t("of.copy")} />
      <div className="odSplit">
        <section className="odCard">
          <h2>{editing ? t("of.edit") : t("owner.postOffer")}</h2>
          {owned.length ? (
            <form key={`${formKey}-${editing?.id ?? "new"}`} className="stackForm" onSubmit={submit}>
              {!editing && <label>{t("owner.business")} *<select name="business_id" required defaultValue={owned.length === 1 ? owned[0].id : ""}><option value="">{t("owner.chooseListing")}</option>{owned.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
              <label>{t("owner.offerTitle")} *<input name="title" required maxLength={200} defaultValue={editing?.title} placeholder={t("od.offerTitlePh")} /></label>
              <label>{t("owner.details")} *<textarea name="body" required rows={4} defaultValue={editing?.body} placeholder={t("od.offerBodyPh")} /></label>
              <div className="ofDates">
                <label>{t("of.starts")}<input name="starts_on" type="date" defaultValue={editing?.starts_on ?? ""} /></label>
                <label>{t("of.ends")}<input name="expires_on" type="date" min={today} defaultValue={editing?.expires_on ?? ""} /></label>
              </div>
              <p className="odSmall">{t("of.limitNote2")}</p>
              <div className="apActions">
                <button className="odBtn" type="submit">{editing ? t("of.save") : t("owner.submitOffer")}</button>
                {editing && <button className="odBtn outline" type="button" onClick={() => setEditing(null)}>{t("of.cancel")}</button>}
              </div>
            </form>
          ) : <p className="mutedText">{t("od.addToPost")}</p>}
        </section>
        <section className="odCard">
          <div className="odCardHead">
            <h2>{t("od.submittedOffers")}</h2>
            <div className="ofTabs" role="tablist">
              {(["all", "active", "review", "expired"] as const).map((key) => (
                <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? "on" : ""} onClick={() => setFilter(key)}>{t(`of.f.${key}` as MessageKey)}</button>
              ))}
            </div>
          </div>
          {shown.length ? (
            <ul className="odOffers">
              {shown.map((post) => (
                <li key={post.id}>
                  <div className="odOfferTop"><p className="odEyebrow">{nameOf(post.business)}</p><OfferBadge post={post} /></div>
                  <h3>{post.title}</h3>
                  {post.body && <p>{post.body}</p>}
                  <p className="odRowMeta">
                    {post.starts_on ? t("of.from", { date: date(post.starts_on) }) : t("od.submittedOn", { date: date(post.created_at) })}
                    {post.expires_on ? ` · ${t("r3.until", { date: date(post.expires_on) })}` : ""}
                  </p>
                  <div className="apActions">
                    <button type="button" className="odBtn small outline" onClick={() => setEditing(post)}>{t("of.edit")}</button>
                    <button type="button" className="odBtn small outline danger" onClick={() => {
                      if (window.confirm(t("of.confirmDelete", { title: post.title }))) void perform(() => apiDelete(`/owner/posts/${post.id}/`), t("of.deleted"));
                    }}>{t("of.delete")}</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="mutedText">{t("od.noOffers")}</p>}
        </section>
      </div>
    </>
  );
}

/** Profile picture with upload and remove. */
export function AvatarPicker({ user }: { user: PortalUser }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      await apiUploadWithProgress("/me/avatar/", form, () => undefined);
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.request"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError("");
    try {
      await apiDelete("/me/avatar/");
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("err.request"));
    }
  }

  const initial = (user.name || user.email || user.username).charAt(0).toUpperCase();
  return (
    <div className="avPick">
      <span className="avBig">{user.avatar ? <img src={user.avatar} alt="" /> : initial}</span>
      <div>
        <b>{t("pf.photo")}</b>
        <div className="apActions">
          <label className="odBtn small outline">{busy ? t("ob.uploading") : t("pf.upload")}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
          {user.avatar && <button type="button" className="odBtn small outline" onClick={() => void remove()}>{t("ob.remove")}</button>}
        </div>
        {error && <p className="formError">{error}</p>}
      </div>
    </div>
  );
}


type OwnerInvoice = {
  id: string; number: string; business: string; plan: PlanKey; period_start: string; period_end: string;
  issued_on: string; due_on: string; amount_paise: number; gst_percent: number; gst_paise: number; total_paise: number;
  status: "pending" | "paid" | "overdue" | "cancelled"; paid_on: string | null; method: string; pdf_url: string;
};

const INVOICE_BADGE: Record<OwnerInvoice["status"], { cls: string; key: MessageKey }> = {
  pending: { cls: "wait", key: "inv.s.pending" },
  paid: { cls: "ok", key: "inv.s.paid" },
  overdue: { cls: "bad", key: "inv.s.overdue" },
  cancelled: { cls: "muted", key: "inv.s.cancelled" },
};

/** Monthly invoices with GST, status and PDF download. */
export function OwnerInvoices() {
  const { t } = useT();
  const date = useDate();
  const { data = [], isLoading } = useQuery({ queryKey: ["owner-invoices"], queryFn: () => apiGet<OwnerInvoice[]>("/owner/invoices/") });
  const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const open = data.filter((item) => item.status === "pending" || item.status === "overdue");
  return (
    <section className="odCard">
      <div className="odCardHead"><h2>{t("r3.invoices")}</h2></div>
      {open.length > 0 && <p className="obNote"><Icon name="clock" size={16} />{t("inv.payNote", { n: open.length, total: rupees(open.reduce((sum, item) => sum + item.total_paise, 0)) })}</p>}
      {isLoading ? <p className="mutedText">{t("home.finding")}</p> : data.length ? (
        <div className="odTableWrap">
          <table className="odTable">
            <thead><tr><th>{t("inv.number")}</th><th>{t("owner.business")}</th><th>{t("inv.period")}</th><th>{t("inv.total")}</th><th>{t("inv.due")}</th><th>{t("od.status")}</th><th /></tr></thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td><code>{item.number}</code><br /><small className="odRowMeta">{t(`od.plan.${item.plan}` as MessageKey)}</small></td>
                  <td>{item.business}</td>
                  <td>{date(item.period_start)} – {date(item.period_end)}</td>
                  <td>{rupees(item.total_paise)}<br /><small className="odRowMeta">{t("inv.split", { base: rupees(item.amount_paise), gst: rupees(item.gst_paise), pct: item.gst_percent })}</small></td>
                  <td>{date(item.due_on)}</td>
                  <td><span className={`odBadge ${INVOICE_BADGE[item.status].cls}`}>{t(INVOICE_BADGE[item.status].key)}</span>{item.paid_on && <><br /><small className="odRowMeta">{date(item.paid_on)}</small></>}</td>
                  <td><a className="odBtn small outline" href={item.pdf_url}>{t("inv.pdf")}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mutedText">{t("r3.noInvoices")}</p>}
    </section>
  );
}

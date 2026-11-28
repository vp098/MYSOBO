import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { loginPath } from "./auth";
import { IconBadge } from "./iconBadge";
import { Lightbox } from "./photos";
import { SearchX } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  apiDelete,
  apiGet,
  apiPost,
  type Business,
  type BusinessProduct,
  type BusinessService,
  type PortalUser,
  type Review,
} from "./services/api";
import { useT } from "./i18n";
import { Shell } from "./App";
import { coverFor } from "./covers";

/*
 * Resident listing page at /business/:slug.
 * Guests see a masked phone number and are asked to log in to see it, call,
 * WhatsApp or write a review. The API itself hides contact details from guests.
 */

type ListingBusiness = Business & { contact_locked?: boolean; phone_masked?: string; whatsapp_masked?: string };
type Page<T> = { results: T[] } | T[];
const rows = <T,>(page?: Page<T>) => (Array.isArray(page) ? page : page?.results ?? []);

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
const PhoneIcon = () => <Svg><path d="M6.6 3.5h2.6l1.4 4-2 1.3a12 12 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" /></Svg>;
const ChatIcon = () => <Svg><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /><path d="M9 10.5c.5 1.6 1.9 3 3.5 3.5l1.2-1.2 1.8.8v1.4a1 1 0 0 1-1.1 1A6.5 6.5 0 0 1 8 9.6a1 1 0 0 1 1-1.1h1.4l.8 1.8z" /></Svg>;
const LockIcon = () => <Svg><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Svg>;
const BackIcon = () => <Svg size={22}><path d="M15 5l-7 7 7 7" /></Svg>;
const ShareIcon = () => <Svg><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" /></Svg>;
const HeartIcon = ({ on }: { on: boolean }) => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;

function digits(phone: string) {
  let value = phone.replace(/\D/g, "");
  if (value.length === 11 && value.startsWith("0")) value = value.slice(1);
  return value;
}
const telHref = (phone: string) => `tel:+91${digits(phone).slice(-10)}`;
const waHref = (phone: string) => `https://wa.me/91${digits(phone).slice(-10)}`;
const pretty = (phone: string) => { const d = digits(phone).slice(-10); return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : phone; };
const money = (value: string | number | null | undefined) => value == null || value === "" ? "" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function ListingPage({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const { slug = "" } = useParams();
  const { t, lang } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const signedIn = Boolean(user);
  const locale = lang === "gu" ? "gu-IN" : lang === "hi" ? "hi-IN" : "en-IN";

  const { data: business, isLoading, isError } = useQuery({
    queryKey: ["listing", slug, signedIn],
    queryFn: () => apiGet<ListingBusiness>(`/businesses/${encodeURIComponent(slug)}/`),
  });
  const viewed = useRef("");
  useEffect(() => {
    if (business && viewed.current !== business.id) {
      viewed.current = business.id;
      void apiPost(`/businesses/${encodeURIComponent(business.slug)}/events/`, { type: "view" }).catch(() => undefined);
    }
  }, [business]);
  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", slug, signedIn],
    queryFn: () => apiGet<Review[]>(`/businesses/${encodeURIComponent(slug)}/reviews/`),
    enabled: Boolean(business),
  });
  const { data: saved } = useQuery({
    queryKey: ["saved", slug, user?.id],
    queryFn: () => apiGet<{ saved: boolean }>(`/businesses/${encodeURIComponent(slug)}/saved/`),
    enabled: Boolean(business && signedIn),
  });
  const { data: offers = [] } = useQuery({
    queryKey: ["listing-offers", slug],
    queryFn: () => apiGet<{ id: string; title: string; body: string; expires_on: string | null }[]>(`/businesses/${encodeURIComponent(slug)}/offers/`),
    enabled: Boolean(business),
  });
  const { data: services } = useQuery({
    queryKey: ["listing-services", business?.id],
    queryFn: () => apiGet<Page<BusinessService>>(`/services/?business_id=${business!.id}`),
    enabled: Boolean(business && business.kind !== "product"),
  });
  const { data: products } = useQuery({
    queryKey: ["listing-products", business?.id],
    queryFn: () => apiGet<Page<BusinessProduct>>(`/products/?business_id=${business!.id}`),
    enabled: Boolean(business && business.kind !== "service"),
  });

  function askLogin() {
    // Protected boundary: phone number, full description, reviews. Come back here after signing in.
    navigate(loginPath(`${location.pathname}${location.search}`));
  }

  function contact(type: "call" | "whatsapp", href: string) {
    void apiPost(`/businesses/${encodeURIComponent(slug)}/events/`, { type }).catch(() => undefined);
    if (type === "whatsapp") window.open(href, "_blank", "noopener,noreferrer");
    else window.location.assign(href);
  }

  async function toggleSaved() {
    if (!signedIn) return askLogin();
    const url = `/businesses/${encodeURIComponent(slug)}/saved/`;
    if (saved?.saved) await apiDelete(url); else await apiPost(url);
    await queryClient.invalidateQueries({ queryKey: ["saved", slug] });
    await queryClient.invalidateQueries({ queryKey: ["my-saved"] });
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: business?.name, url });
      else { await navigator.clipboard.writeText(url); setMessage(t("lp.copied")); }
    } catch { /* share sheet closed */ }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) { setMessage(t("lp.pickRating")); return; }
    const form = event.currentTarget;
    const body = new FormData(form).get("review");
    try {
      await apiPost(`/businesses/${encodeURIComponent(slug)}/reviews/`, { rating, body });
      await queryClient.invalidateQueries({ queryKey: ["reviews", slug] });
      await queryClient.invalidateQueries({ queryKey: ["listing", slug] });
      setMessage(t("listing.thanks"));
      setRating(0);
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("err.review"));
    }
  }

  const today = (new Date().getDay() + 6) % 7;
  const dayName = (dow: number) => new Date(2024, 0, 1 + dow).toLocaleDateString(locale, { weekday: "long" });
  const hm = (value: string | null) => {
    if (!value) return "";
    const [h, m] = value.split(":").map(Number);
    return new Date(2024, 0, 1, h, m).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  };
  const hours = [...(business?.hours ?? [])].sort((a, b) => a.dow - b.dow);
  const todayHours = hours.find((item) => item.dow === today);
  const now = new Date().toTimeString().slice(0, 5);
  const openNow = Boolean(todayHours && !todayHours.closed && todayHours.opens && todayHours.closes && todayHours.opens.slice(0, 5) <= now && now < todayHours.closes.slice(0, 5));
  const catalog = business?.kind === "product" ? rows(products) : [...rows(services), ...rows(products)];
  const alreadyReviewed = reviews.some((review) => review.mine);
  const gallery = business?.photos ?? [];
  const kindLabel = business ? t(business.kind === "product" ? "kind.product" : business.kind === "both" ? "kind.both" : "kind.service") : "";

  const tabs = [
    { key: "overview", label: t("lv.overview"), show: true },
    { key: "catalog", label: business?.kind === "product" ? t("lp.products") : business?.kind === "both" ? t("lp.servicesProducts") : t("lp.services"), show: catalog.length > 0, count: catalog.length },
    { key: "offers", label: t("r3.offersOnListing"), show: offers.length > 0, count: offers.length },
    { key: "photos", label: t("lp.photos"), show: gallery.length > 0, count: gallery.length },
    { key: "hours", label: t("lp.hours"), show: hours.length > 0 },
    { key: "reviews", label: t("listing.reviews"), show: true, count: reviews.length },
  ].filter((tab) => tab.show);
  const activeTab = tabs.some((tab) => tab.key === params.get("tab")) ? params.get("tab")! : "overview";
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [activeTab]);
  function openTab(key: string) {
    const next = new URLSearchParams(params);
    if (key === "overview") next.delete("tab"); else next.set("tab", key);
    setParams(next, { replace: true });
  }

  const contactCard = business ? (
    <section className="lvCard lvContact" aria-label={t("lp.contact")}>
      <p className="lvLabel">{t("lp.contact")}</p>
      {business.contact_locked ? (
        <>
          <div className="lvPhone"><span className="lvRound"><LockIcon /></span><div><small>{t("lp.phone")}</small><b className="masked">{business.phone_masked || "XXXXX XXXXX"}</b></div></div>
          <p className="lvMuted">{t("lp.lockedText")}</p>
          <button type="button" className="lvBtn primary" onClick={askLogin}>{t("lp.loginToSee")}</button>
        </>
      ) : business.phone ? (
        <>
          <div className="lvPhone"><span className="lvRound"><PhoneIcon /></span><div><small>{t("lp.phone")}</small><b>{pretty(business.phone)}</b></div></div>
          <div className="lvBtnRow">
            <button type="button" className="lvBtn primary" onClick={() => contact("call", telHref(business.phone))}><PhoneIcon />{t("listing.call")}</button>
            {business.whatsapp && <button type="button" className="lvBtn" onClick={() => contact("whatsapp", waHref(business.whatsapp))}><ChatIcon />{t("listing.whatsapp")}</button>}
          </div>
        </>
      ) : <p className="lvMuted">{t("lp.noPhone")}</p>}
    </section>
  ) : null;

  const facts = business ? (
    <section className="lvCard">
      <p className="lvLabel">{t("lv.details")}</p>
      <dl className="lvFacts">
        {business.address && !business.hide_address && <div><dt>{t("form.address")}</dt><dd>{business.address}</dd></div>}
        {todayHours && <div><dt>{t("lp.today")}</dt><dd><span className={openNow ? "lvDot open" : "lvDot"} />{todayHours.closed ? t("lp.closed") : `${hm(todayHours.opens)} – ${hm(todayHours.closes)}`}</dd></div>}
        <div><dt>{t("lv.type")}</dt><dd>{kindLabel}</dd></div>
        {(business.home_visit || business.onsite_visit) && <div><dt>{t("ob.visitTitle")}</dt><dd>{[business.home_visit && t("cards.homeVisit"), business.onsite_visit && t("lv.onsite")].filter(Boolean).join(" · ")}</dd></div>}
        <div><dt>{t("lv.status")}</dt><dd>{business.verified ? <span className="lvVerified">✓ {t("vf.verified")}</span> : t("lv.notVerified")}</dd></div>
      </dl>
    </section>
  ) : null;

  return (
    <Shell user={user} onAuthChange={onAuthChange} dashboard>
      {isLoading ? <div className="lvState"><p className="lpMuted">{t("listing.loading")}</p></div> : isError || !business ? (
        <div className="lvState"><div className="lpEmpty"><IconBadge icon={SearchX} /><h1>{t("listing.unavailable")}</h1><Link className="obBtn" to="/mysobo">{t("nav.explore")}</Link></div></div>
      ) : (
        <div className="lv">
          <aside className="lvSide" aria-label={business.name}>
            <button type="button" className="lvBack" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/mysobo"))}><BackIcon />{t("lp.back")}</button>
            <div className="lvIdentity">
              <span className="lvLogo">{business.logo ? <img src={business.logo} alt="" /> : business.name.charAt(0).toUpperCase()}</span>
              <div><b>{business.name}</b><small>{business.subcategory?.name || business.category?.name || kindLabel}</small></div>
            </div>
            <nav className="lvNav" aria-label={t("lv.sections")}>
              {tabs.map((tab) => (
                <button key={tab.key} type="button" className={tab.key === activeTab ? "on" : ""} aria-current={tab.key === activeTab ? "page" : undefined} onClick={() => openTab(tab.key)}>
                  <span>{tab.label}</span>{tab.count ? <em>{tab.count}</em> : null}
                </button>
              ))}
            </nav>
          </aside>

          <section className="lvMain">
            <header className="lvHead">
              <button type="button" className="lvThumb" disabled={!gallery.length} onClick={() => setViewer(Math.max(0, gallery.indexOf(business.cover_image ?? "")))} aria-label={t("lp.photos")}>
                <img src={coverFor(business)} alt="" />
              </button>
              <div className="lvTitle">
                <p className="lvCrumb">{business.category && <Link to={`/${business.kind === "product" ? "products" : "services"}/${business.category.slug}`}>{business.category.name}</Link>}{business.subcategory && <> › <span>{business.subcategory.name}</span></>}</p>
                <h1>{business.name}{business.verified && <span className="lvVerified">✓ {t("vf.verified")}</span>}</h1>
                <p className="lvMeta">
                  {business.review_count ? <span className="lvStars">★ {(business.average_rating ?? 0).toFixed(1)} <em>({t("cards.reviews", { n: business.review_count })})</em></span> : <span>{t("ln.noReviews")}</span>}
                  {todayHours && <span className={openNow ? "lvOpen" : "lvClosed"}>{openNow ? t("lp.openNow") : t("lp.closedNow")}</span>}
                  {business.address && !business.hide_address && <span className="lvArea">{business.address}</span>}
                </p>
              </div>
              <div className="lvActions">
                <button type="button" className="lvIcon" onClick={() => void share()} aria-label={t("lp.share")}><ShareIcon /></button>
                <button type="button" className={`lvIcon ${saved?.saved ? "on" : ""}`} onClick={() => void toggleSaved()} aria-pressed={Boolean(saved?.saved)} aria-label={saved?.saved ? t("listing.saved") : t("listing.save")}><HeartIcon on={Boolean(saved?.saved)} /></button>
              </div>
            </header>
            <nav className="lvTabs" aria-label={t("lv.sections")}>
              {tabs.map((tab) => (
                <button key={tab.key} type="button" className={tab.key === activeTab ? "on" : ""} onClick={() => openTab(tab.key)}>{tab.label}{tab.count ? <em>{tab.count}</em> : null}</button>
              ))}
            </nav>

            <div className="lvBody" ref={body}>
              {message && <p className="lpMessage" role="status">{message}</p>}
              {activeTab === "overview" && (
                <div className="lvOverview">
                  <div className="lvNarrowOnly">{contactCard}</div>
                  <section className="lvCard">
                    <p className="lvLabel">{t("lp.about")}</p>
                    <p className="lvText">{business.description || t("cards.inSouthBopal", { kind: kindLabel })}</p>
                    {business.description_locked && <button type="button" className="lvLink" onClick={askLogin}>{t("cards.readMore")}</button>}
                  </section>
                  {offers.length > 0 && (
                    <button type="button" className="lvCard lvOfferTeaser" onClick={() => openTab("offers")}>
                      <span className="lvOfferTag">%</span><span><b>{offers[0].title}</b><small>{offers.length > 1 ? t("lv.moreOffers", { n: offers.length - 1 }) : offers[0].body}</small></span><span aria-hidden="true">→</span>
                    </button>
                  )}
                  {gallery.length > 0 && (
                    <section className="lvCard">
                      <div className="lvCardHead"><p className="lvLabel">{t("lp.photos")}</p>{gallery.length > 4 && <button type="button" className="lvLink" onClick={() => openTab("photos")}>{t("lp.seeAll", { n: gallery.length })}</button>}</div>
                      <ul className="lvStrip">{gallery.slice(0, 4).map((url, index) => <li key={url}><button type="button" onClick={() => setViewer(index)} aria-label={t("ph.previewN", { n: index + 1 })}><img src={url} alt="" loading="lazy" /></button></li>)}</ul>
                    </section>
                  )}
                  {catalog.length > 0 && (
                    <section className="lvCard">
                      <div className="lvCardHead"><p className="lvLabel">{tabs.find((tab) => tab.key === "catalog")?.label}</p>{catalog.length > 4 && <button type="button" className="lvLink" onClick={() => openTab("catalog")}>{t("rd.seeAll")}</button>}</div>
                      <CatalogTable items={catalog.slice(0, 4)} />
                    </section>
                  )}
                  <div className="lvNarrowOnly">{facts}</div>
                </div>
              )}
              {activeTab === "catalog" && <section className="lvCard"><CatalogTable items={catalog} /></section>}
              {activeTab === "offers" && (
                <ul className="lvOffers">
                  {offers.map((offer) => (
                    <li key={offer.id} className="lvCard">
                      <span className="lvOfferTag">%</span>
                      <div><b>{offer.title}</b>{offer.body && <p className="lvMuted">{offer.body}</p>}
                        {offer.expires_on && <p className="lvMuted">{t("r3.until", { date: new Date(offer.expires_on).toLocaleDateString(locale, { day: "numeric", month: "short" }) })}</p>}</div>
                    </li>
                  ))}
                </ul>
              )}
              {activeTab === "photos" && (
                <ul className="lvGallery">{gallery.map((url, index) => <li key={url}><button type="button" onClick={() => setViewer(index)} aria-label={t("ph.previewN", { n: index + 1 })}><img src={url} alt="" loading="lazy" /></button></li>)}</ul>
              )}
              {activeTab === "hours" && (
                <section className="lvCard">
                  <ul className="lvHours">
                    {hours.map((item) => (
                      <li key={item.dow} className={item.dow === today ? "today" : ""}>
                        <span>{dayName(item.dow)}{item.dow === today && <em>{t("lp.today")}</em>}</span>
                        <span>{item.closed ? t("lp.closed") : `${hm(item.opens)} – ${hm(item.closes)}`}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {activeTab === "reviews" && (
                <div className="lvReviewsWrap">
                  <section className="lvCard">
                    {reviews.length ? (
                      <ul className="lpReviews">
                        {reviews.map((review) => (
                          <li key={review.id}>
                            <span className="lpAvatar">{(review.user_name || "?").charAt(0).toUpperCase()}</span>
                            <div>
                              <p className="lpItem">{review.user_name}</p>
                              <p className="lpReviewStars" aria-label={t("listing.stars", { n: review.rating })}>{"★".repeat(review.rating)}<span>{"★".repeat(5 - review.rating)}</span></p>
                              {review.body && <p className="lpText">{review.body}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="lvMuted">{t("listing.noReviews")}</p>}
                  </section>
                  <section className="lvCard">
                    {!signedIn ? (
                      <div className="lpGate"><span className="lvRound"><LockIcon /></span><p>{t("lp.loginToReviewText")}</p><button type="button" className="lvBtn" onClick={askLogin}>{t("lp.loginToReview")}</button></div>
                    ) : alreadyReviewed ? <p className="lvMuted">{t("lv.reviewed")}</p> : (
                      <form className="lpReviewForm" onSubmit={submitReview}>
                        <p className="lvLabel">{t("lp.yourRating")}</p>
                        <div className="lpStarPick" role="radiogroup" aria-label={t("lp.yourRating")}>
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={t("listing.stars", { n: value })} className={value <= rating ? "on" : ""} onClick={() => setRating(value)}>★</button>
                          ))}
                        </div>
                        <textarea name="review" rows={3} placeholder={t("listing.reviewPh")} aria-label={t("listing.yourReview")} />
                        <button className="lvBtn primary" type="submit">{t("listing.post")}</button>
                      </form>
                    )}
                  </section>
                </div>
              )}
            </div>
          </section>

          <aside className="lvRight" aria-label={t("lp.contact")}>
            {contactCard}
            {facts}
          </aside>
          {viewer !== null && gallery[viewer] && <Lightbox urls={gallery} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
        </div>
      )}
    </Shell>
  );
}

function CatalogTable({ items }: { items: (BusinessService | BusinessProduct)[] }) {
  const { t } = useT();
  return (
    <table className="lvTable">
      <tbody>
        {items.map((item) => {
          const isProduct = "price" in item;
          const price = isProduct ? money((item as BusinessProduct).price) : money((item as BusinessService).price_min);
          const detail = isProduct ? [(item as BusinessProduct).brand, (item as BusinessProduct).model].filter(Boolean).join(" · ") : item.description;
          return (
            <tr key={item.id}>
              <td><b>{item.name}</b>{detail && <small>{detail}</small>}</td>
              <td className="lvPrice">{price ? (isProduct ? price : t("lp.from", { price })) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

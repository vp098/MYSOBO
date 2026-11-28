import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, MapPin, Plus, Star } from "lucide-react";
import { Shell } from "./App";
import { LeafField } from "./leaves";
import { SmartSearch } from "./smartSearch";
import { coverFor } from "./covers";
import { useT } from "./i18n";
import { apiGet, type Business, type Category, type PortalUser } from "./services/api";
import { ROUTES } from "./session";
import { loginPath } from "./auth";

/*
 * Landing page at /sobo. First screen: headline, search and the two main
 * types (Service Based / Product Based) on the left, the leaf animation on the
 * right. Below: three recently joined business profiles and six trusted
 * listings. Everything comes from the database; empty slots invite owners to
 * list their business instead of showing made-up records.
 */

type Page<T> = { results: T[] } | T[];
const rows = <T,>(data?: Page<T>) => (Array.isArray(data) ? data : data?.results ?? []);

function useListings(ordering: string, extra = "") {
  return useQuery({
    queryKey: ["landing-listings", ordering, extra],
    queryFn: () => apiGet<Page<Business>>(`/businesses/?ordering=${ordering}${extra}`),
    staleTime: 60_000,
  });
}

function CategoryRow({ kind }: { kind: "service" | "product" }) {
  const { t } = useT();
  const { data } = useQuery({ queryKey: ["categories", kind], queryFn: () => apiGet<Category[]>(`/categories/?kind=${kind}`), staleTime: 5 * 60_000 });
  const top = (data ?? []).filter((item) => kind === "service" ? item.supports_services : item.supports_products)
    .sort((a, b) => (b.listing_count ?? 0) - (a.listing_count ?? 0) || a.priority - b.priority).slice(0, 6);
  const base = kind === "service" ? "/services" : "/products";
  return (
    <div className="lnCats">
      <Link className="lnCatsLabel" to={kind === "service" ? "/services" : "/products"}>{t(kind === "service" ? "main.service" : "main.product")} <ArrowRight size={14} /></Link>
      <div className="lnChips">
        {top.map((item) => (
          <Link key={item.id} to={`${base}/${item.slug}`} className="lnChip">
            {item.name}{item.listing_count ? <em>{item.listing_count}</em> : null}
          </Link>
        ))}
        {!data && Array.from({ length: 4 }, (_, i) => <span key={i} className="lnChip skeleton" aria-hidden="true" />)}
      </div>
    </div>
  );
}

function InviteCard({ wide = false }: { wide?: boolean }) {
  const { t } = useT();
  return (
    <Link to={loginPath(undefined, true, true)} className={`lnInvite ${wide ? "wide" : ""}`}>
      <span className="lnInviteIcon"><Plus size={22} /></span>
      <b>{t("ln.inviteTitle")}</b>
      <small>{t("ln.inviteText")}</small>
    </Link>
  );
}

function ProfileCard({ business }: { business: Business }) {
  const { t, lang } = useT();
  const joined = business.created_at ? new Date(business.created_at).toLocaleDateString(lang === "en" ? "en-IN" : `${lang}-IN`, { month: "short", year: "numeric" }) : "";
  const initial = business.name.charAt(0).toUpperCase();
  const categoryHref = business.category ? `/${business.kind === "product" ? "products" : "services"}/${business.category.slug}` : ROUTES.discover;
  return (
    <article className="lnProfile">
      <div className="lnProfileCover"><img src={coverFor(business)} alt="" loading="lazy" /></div>
      <span className="lnAvatar">{business.logo ? <img src={business.logo} alt="" /> : initial}</span>
      <h3>{business.name}{business.verified && <BadgeCheck size={16} className="lnTick" aria-label={t("vf.verified")} />}</h3>
      <p className="lnProfileMeta">{business.subcategory?.name || business.category?.name || t(business.kind === "product" ? "kind.product" : "kind.service")}</p>
      {joined && <p className="lnJoined">{t("ln.joined", { date: joined })}</p>}
      <div className="lnProfileActions">
        <Link className="lnBtn small" to={ROUTES.business(business.slug)}>{t("ln.viewProfile")}</Link>
        {business.category && <Link className="lnLink" to={categoryHref}>{t("ln.browse", { name: business.category.name })}</Link>}
      </div>
    </article>
  );
}

function TrustedCard({ business }: { business: Business }) {
  const { t } = useT();
  return (
    <Link to={ROUTES.business(business.slug)} className="lnTrusted">
      <span className="lnTrustedImg">
        <img src={coverFor(business)} alt="" loading="lazy" />
        {business.offer && <span className="bizOffer">{business.offer.title}</span>}
      </span>
      <span className="lnTrustedBody">
        <span className="lnTrustedCat">{business.subcategory?.name || business.category?.name || ""}</span>
        <b>{business.name}{business.verified && <BadgeCheck size={15} className="lnTick" aria-label={t("vf.verified")} />}</b>
        <span className="lnTrustedMeta">
          {business.review_count ? <span className="lnStars"><Star size={14} fill="currentColor" />{(business.average_rating ?? 0).toFixed(1)} <em>({business.review_count})</em></span> : <span className="lnNew">{t("ln.noReviews")}</span>}
          {business.address && !business.hide_address && <span className="lnArea"><MapPin size={13} />{business.address}</span>}
        </span>
      </span>
    </Link>
  );
}

export function Landing({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const { t } = useT();
  const recent = useListings("recent");
  const trusted = useListings("relevance", "&verified=true");
  const fallback = useListings("rating");
  const recentRows = rows(recent.data).slice(0, 3);
  const trustedPool = rows(trusted.data);
  const trustedRows = (trustedPool.length >= 6 ? trustedPool : [...trustedPool, ...rows(fallback.data).filter((item) => !trustedPool.some((v) => v.id === item.id))]).slice(0, 6);

  return (
    <Shell user={user} onAuthChange={onAuthChange} bottomNav={null} wide>
      <section className="lnHero">
        <div className="lnCopy">
          {/* No entrance animation here: this text is what people see first (fast LCP). */}
          <h1>{t("ln.title1")} <em>{t("ln.title2")}</em></h1>
          <p className="lnSub">{t("ln.sub")}</p>
          <div className="lnSearch"><SmartSearch size="large" /></div>
          <div className="lnCatBlock">
            <CategoryRow kind="service" />
            <CategoryRow kind="product" />
          </div>
        </div>
        <div className="lnArt"><LeafField /></div>
      </section>

      <section className="lnSection" aria-labelledby="ln-browse">
        <div className="lnHead">
          <div><h2 id="ln-browse">{t("ln.browseTitle")}</h2><p>{t("ln.browseSub")}</p></div>
          <Link className="lnLink" to={ROUTES.discover}>{t("ln.exploreAll")} <ArrowRight size={15} /></Link>
        </div>
        <div className="lnProfiles">
          {recent.isLoading ? Array.from({ length: 3 }, (_, i) => <div key={i} className="lnProfile skeleton" aria-hidden="true" />)
            : <>{recentRows.map((business) => <ProfileCard key={business.id} business={business} />)}
              {Array.from({ length: Math.max(0, 3 - recentRows.length) }, (_, i) => <InviteCard key={`invite-${i}`} />)}</>}
        </div>
      </section>

      <section className="lnSection" aria-labelledby="ln-trusted">
        <div className="lnHead">
          <div><h2 id="ln-trusted">{t("ln.trustedTitle")}</h2><p>{t("ln.trustedSub")}</p></div>
          <Link className="lnLink" to={`${ROUTES.discover}#results`}>{t("ln.seeAllListings")} <ArrowRight size={15} /></Link>
        </div>
        <div className="lnTrustedGrid">
          {trusted.isLoading ? Array.from({ length: 6 }, (_, i) => <div key={i} className="lnTrusted skeleton" aria-hidden="true" />)
            : <>{trustedRows.map((business) => <TrustedCard key={business.id} business={business} />)}
              {trustedRows.length < 6 && <InviteCard wide />}</>}
        </div>
      </section>
    </Shell>
  );
}

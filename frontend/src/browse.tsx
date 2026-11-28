import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Package, Search, Wrench } from "lucide-react";
import { Shell } from "./App";
import { coverForCategory } from "./covers";
import { IconBadge } from "./iconBadge";
import { useT } from "./i18n";
import { apiGet, type Category, type PortalUser } from "./services/api";
import { ROUTES } from "./session";

/*
 * /services and /products: every active category of that type, from the
 * database (admins manage them). Landing → Service/Product → category →
 * subcategory → listing. Same fixed app layout as the category pages.
 */
export function BrowseKind({ kind, user, onAuthChange }: { kind: "service" | "product"; user?: PortalUser; onAuthChange: () => void }) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["categories", kind],
    queryFn: () => apiGet<Category[]>(`/categories/?kind=${kind}`),
    staleTime: 5 * 60_000,
  });
  const other = useQuery({
    queryKey: ["categories", kind === "service" ? "product" : "service"],
    queryFn: () => apiGet<Category[]>(`/categories/?kind=${kind === "service" ? "product" : "service"}`),
    staleTime: 5 * 60_000,
  });
  const all = useMemo(() => (data ?? []).filter((item) => (kind === "service" ? item.supports_services : item.supports_products)), [data, kind]);
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? all.filter((item) => item.name.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle)
      || item.subcategories.some((sub) => sub.name.toLowerCase().includes(needle)))
    : all;
  const sorted = [...shown].sort((a, b) => (b.listing_count ?? 0) - (a.listing_count ?? 0) || a.priority - b.priority || a.name.localeCompare(b.name));
  const base = kind === "service" ? "/services" : "/products";
  const total = all.reduce((sum, item) => sum + (item.listing_count ?? 0), 0);
  const count = (list?: Category[], k?: "service" | "product") => (list ?? []).filter((item) => (k === "service" ? item.supports_services : item.supports_products)).length;

  return (
    <Shell user={user} onAuthChange={onAuthChange} dashboard>
      <div className="cxLayout">
        <aside className="cxSide bxSide" aria-label={t("bx.types")}>
          <p className="cxLabel">{t("bx.types")}</p>
          <nav className="cxNav">
            {(["service", "product"] as const).map((value) => (
              <Link key={value} to={value === "service" ? "/services" : "/products"} className={value === kind ? "active" : ""} aria-current={value === kind ? "page" : undefined}>
                <span className="bxType">{value === "service" ? <Wrench size={16} /> : <Package size={16} />}{t(value === "service" ? "main.service" : "main.product")}</span>
                <em>{value === kind ? all.length : count(other.data, value)}</em>
              </Link>
            ))}
          </nav>
          <label className="bxFind">
            <span className="cxLabel">{t("bx.findCategory")}</span>
            <span className="bxFindBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("bx.findPh")} /></span>
          </label>
          <p className="lvMuted bxHint">{t("bx.hint")}</p>
        </aside>
        <section className="cxMain">
          <header className="cxHead">
            <nav className="cxCrumbs" aria-label={t("cat.breadcrumb")}>
              <span><Link to={ROUTES.landing}>{t("cat.home")}</Link></span>
              <span><span aria-hidden="true">›</span><strong>{t(kind === "service" ? "main.service" : "main.product")}</strong></span>
            </nav>
            <div className="cxTitleRow">
              <div className="cxTitle">
                <h1>{t(kind === "service" ? "main.service" : "main.product")}</h1>
                <p>{isLoading ? t("cat.loading") : t("bx.summary", { n: all.length, listings: total })}</p>
              </div>
              <label className="bxFindBox bxFindTop"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("bx.findPh")} aria-label={t("bx.findCategory")} /></label>
            </div>
            <div className="cxChips">
              {(["service", "product"] as const).map((value) => (
                <Link key={value} className={`cxChip ${value === kind ? "on" : ""}`} to={value === "service" ? "/services" : "/products"}>{t(value === "service" ? "main.service" : "main.product")}</Link>
              ))}
            </div>
          </header>
          <div className="cxBody">
            {isLoading ? <div className="cxSkeletons">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton bxSkeleton" />)}</div>
              : isError ? <div className="cxEmpty"><p>{t("cat.loadError")}</p><button type="button" className="odBtn outline" onClick={() => void refetch()}>{t("retry")}</button></div>
                : sorted.length ? (
                  <div className="bxGrid">
                    {sorted.map((item) => (
                      <Link key={item.id} to={`${base}/${item.slug}`} className="bxCard">
                        <span className="bxImg"><img src={item.image || item.icon_image || coverForCategory(item.slug, item.name)} alt="" loading="lazy" /></span>
                        <span className="bxText">
                          <b>{item.name}</b>
                          <small>{item.description || t("bx.defaultDesc", { name: item.name })}</small>
                          <span className="bxMeta">
                            <em>{t("listings.count", { n: item.listing_count ?? 0 })}</em>
                            {item.subcategories.length > 0 && <em>{t("bx.subs", { n: item.subcategories.length })}</em>}
                          </span>
                        </span>
                        <ArrowRight size={18} className="bxGo" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="cxEmpty"><IconBadge icon={Search} /><h2>{t("bx.noneTitle")}</h2><p>{needle ? t("search.none", { q: query }) : t("bx.noneText")}</p>
                    {needle && <button type="button" className="odBtn outline" onClick={() => setQuery("")}>{t("cat.clearAll")}</button>}</div>
                )}
          </div>
        </section>
      </div>
    </Shell>
  );
}

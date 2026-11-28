import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Folder, Search, Store } from "lucide-react";
import { apiGet } from "./services/api";
import { useT } from "./i18n";
import { ROUTES } from "./session";

/*
 * Search box with instant suggestions from the real database
 * (GET /api/search/suggest/). Typing waits 250 ms before asking the server,
 * and repeated queries come from the React Query cache.
 */

type Suggest = {
  businesses: { slug: string; name: string; kind: string; category: string; subcategory: string; verified: boolean }[];
  categories: { slug: string; name: string; kind: "service" | "product" }[];
  subcategories?: { slug: string; name: string; category: string; category_slug: string }[];
  words: string[];
  corrected?: boolean;
};

type Option = { key: string; label: string; meta: string; href: string; icon: "biz" | "cat"; verified?: boolean };

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function SmartSearch({ initial = "", kind, onSubmit, size = "large", autoFocus = false }: {
  initial?: string;
  kind?: "service" | "product";
  onSubmit?: (query: string) => void;
  size?: "large" | "medium";
  autoFocus?: boolean;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const listId = useId();
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const query = useDebounced(value.trim(), 250);
  const enabled = query.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["suggest", query, kind ?? ""],
    queryFn: () => apiGet<Suggest>(`/search/suggest/?q=${encodeURIComponent(query)}${kind ? `&kind=${kind}` : ""}`),
    enabled,
    staleTime: 60_000,
  });

  useEffect(() => { setValue(initial); }, [initial]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const options: Option[] = enabled && data ? [
    ...data.businesses.map((item) => ({
      key: `b-${item.slug}`, label: item.name, meta: item.subcategory || item.category, href: ROUTES.business(item.slug), icon: "biz" as const, verified: item.verified,
    })),
    ...(data.subcategories ?? []).map((item) => ({
      key: `s-${item.slug}`, label: item.name, meta: item.category, href: `/categories/${item.category_slug}/${item.slug}`, icon: "cat" as const,
    })),
    ...data.categories.map((item) => ({
      key: `c-${item.slug}`, label: item.name, meta: t("search.category"), href: `/${item.kind === "product" ? "products" : "services"}/${item.slug}`, icon: "cat" as const,
    })),
  ].slice(0, 9) : [];

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (active >= 0 && options[active]) { navigate(options[active].href); setOpen(false); return; }
    const text = value.trim();
    setOpen(false);
    if (onSubmit) onSubmit(text);
    else navigate(text ? `${ROUTES.discover}?q=${encodeURIComponent(text)}${kind ? `&kind=${kind}` : ""}#results` : ROUTES.discover);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
    else if (event.key === "Escape") { setOpen(false); setActive(-1); }
  }

  const showPanel = open && enabled && (options.length > 0 || (!isFetching && data));
  return (
    <div className={`smartSearch ${size}`} ref={box}>
      <form role="search" onSubmit={submit} className="ssForm">
        <Search size={size === "large" ? 22 : 18} className="ssIcon" aria-hidden="true" />
        <input
          value={value}
          maxLength={120}
          autoFocus={autoFocus}
          onChange={(event) => { setValue(event.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={t("search.smartPh")}
          aria-label={t("search.label")}
          role="combobox"
          aria-expanded={Boolean(showPanel)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        />
        {value && <button type="button" className="ssClear" aria-label={t("close")} onClick={() => { setValue(""); setActive(-1); }}>×</button>}
        <button type="submit" className="ssGo">{t("search.button")}</button>
      </form>
      {showPanel && (
        <div className="ssPanel">
          {data?.corrected && data.words.length > 0 && <p className="ssHint">{t("search.showing", { words: data.words.join(" ") })}</p>}
          {options.length ? (
            <ul id={listId} role="listbox">
              {options.map((option, index) => (
                <li key={option.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}
                  className={index === active ? "on" : ""} onMouseDown={(event) => { event.preventDefault(); navigate(option.href); setOpen(false); }}>
                  <span className={`ssBadge ${option.icon}`}>{option.icon === "biz" ? <Store size={16} /> : <Folder size={16} />}</span>
                  <span className="ssText"><b>{option.label}{option.verified && <BadgeCheck size={14} className="ssVerified" />}</b><small>{option.meta}</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="ssEmpty">{t("search.none", { q: query })}</p>}
          <button type="button" className="ssAll" onMouseDown={(event) => { event.preventDefault(); submit(); }}>{t("search.seeAll", { q: value.trim() })}</button>
        </div>
      )}
    </div>
  );
}

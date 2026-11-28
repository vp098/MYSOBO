import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./owner";

/*
 * Shared pieces of the Calendly-style dashboards (resident, business owner,
 * admin). On desktop the page is a fixed viewport: top bar, sidebar and a main
 * area that scrolls on its own (see `.app.dash` in styles.css). On phones the
 * sidebar is hidden and DashTabbar sits at the bottom.
 */

type IconFn = (name: string, size?: number) => ReactNode;
const defaultIcon: IconFn = (name, size) => <Icon name={name} size={size} />;

export type DashItem = { path: string; label: string; icon: string; badge?: number };

/** Scrolls the dashboard's own main area (and the window, on phones) to the top when the section changes. */
export function useScrollMainToTop(key: string) {
  useEffect(() => {
    document.querySelector(".app.dash .odMain")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [key]);
}

export function DashSidebar({ head, groups, active, to, onNavigate, footer, label, icon = defaultIcon }: {
  icon?: IconFn;
  head?: ReactNode;
  groups: { label?: string; items: DashItem[] }[];
  active: string;
  to: (path: string) => string;
  onNavigate?: () => void;
  footer?: ReactNode;
  label: string;
}) {
  return (
    <aside className="odSide" aria-label={label}>
      {head}
      {groups.map((group, index) => (
        <div className="odGroup" key={index}>
          {group.label && <p className="odSideLabel">{group.label}</p>}
          <nav>
            {group.items.map((item) => (
              <Link key={item.path} to={to(item.path)} className={item.path === active ? "active" : ""}
                aria-current={item.path === active ? "page" : undefined} onClick={onNavigate}>
                {icon(item.icon)}<span>{item.label}</span>{item.badge ? <em>{item.badge}</em> : null}
              </Link>
            ))}
          </nav>
        </div>
      ))}
      {footer && <div className="odSideBottom">{footer}</div>}
    </aside>
  );
}

/** Phone bottom tab bar: up to four tabs, the rest under "More". */
export function DashTabbar({ tabs, more = [], active, to, moreLabel, label, onNavigate, icon = defaultIcon }: {
  icon?: IconFn;
  tabs: DashItem[];
  more?: DashItem[];
  active: string;
  to: (path: string) => string;
  moreLabel: string;
  label: string;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [active]);
  return (
    <nav className="odTabbar" aria-label={label}>
      {tabs.map((item) => (
        <Link key={item.path} to={to(item.path)} className={item.path === active ? "active" : ""}
          aria-current={item.path === active ? "page" : undefined} onClick={onNavigate}>
          {icon(item.icon, 22)}<span>{item.label}</span>{item.badge ? <em className="odTabBadge">{item.badge}</em> : null}
        </Link>
      ))}
      {more.length > 0 && (
        <button type="button" className={more.some((item) => item.path === active) ? "active" : ""} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {icon("more", 22)}<span>{moreLabel}</span>
        </button>
      )}
      {open && (
        <div className="odSheet" role="menu">
          {more.map((item) => (
            <Link role="menuitem" key={item.path} to={to(item.path)} onClick={onNavigate}>
              {icon(item.icon)}{item.label}{item.badge ? <em className="saBadge">{item.badge}</em> : null}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

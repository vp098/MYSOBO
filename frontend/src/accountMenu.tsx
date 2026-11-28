import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, LayoutDashboard, LogOut } from "lucide-react";
import { useT } from "./i18n";
import type { PortalUser } from "./services/api";

/** Avatar button in the top bar with the person's dashboard and log out. */
export function AccountMenu({ user, onLogout }: { user: PortalUser; onLogout: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  const name = user.name || user.email || user.username;
  return (
    <div className="acctMenu" ref={box}>
      <button type="button" className="acctButton" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="acctAvatar">{user.avatar ? <img src={user.avatar} alt="" /> : name.charAt(0).toUpperCase()}</span>
        <span className="acctName">{name.split(" ")[0]}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="acctDrop" role="menu">
          <p className="acctWho"><b>{name}</b>{user.email && <small>{user.email}</small>}</p>
          <Link role="menuitem" to={user.home} onClick={() => setOpen(false)}><LayoutDashboard size={16} />{t("nav.dashboard")}</Link>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onLogout(); }}><LogOut size={16} />{t("nav.logout")}</button>
        </div>
      )}
    </div>
  );
}

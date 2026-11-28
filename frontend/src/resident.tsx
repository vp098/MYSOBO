import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Heart, LockKeyhole } from "lucide-react";
import { apiGet, type Business, type PortalUser } from "./services/api";
import { BusinessCards, Shell } from "./App";
import { DashSidebar, DashTabbar, useScrollMainToTop, type DashItem } from "./dashboard";
import { IconBadge } from "./iconBadge";
import { LANGUAGES, useT } from "./i18n";
import { ROUTES } from "./session";
import { ThemePicker } from "./theme";

/** Resident dashboard at /sobo/resident/*. Phase F adds search, offers, tickets and activity. */
export function ResidentDashboard({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const { t } = useT();
  const section = (useParams()["*"] ?? "").split("/")[0] || "saved";
  useScrollMainToTop(section);

  if (!user) {
    return (
      <Shell user={user} onAuthChange={onAuthChange}>
        <section className="section savedPage">
          <div className="emptyState"><IconBadge icon={LockKeyhole} /><p>{t("saved.signIn")}</p><Link className="button" to={`${ROUTES.resident}?dialog=login`}>{t("nav.login")}</Link></div>
        </section>
      </Shell>
    );
  }

  const items: DashItem[] = [
    { path: "saved", label: t("nav.saved"), icon: "heart" },
    { path: "settings", label: t("cd.settings"), icon: "gear" },
  ];
  const active = items.some((item) => item.path === section) ? section : "saved";
  const to = (path: string) => `${ROUTES.resident}/${path}`;
  const explore: DashItem = { path: "__explore", label: t("nav.explore"), icon: "search" };
  const toAny = (path: string) => (path === "__explore" ? ROUTES.discover : to(path));

  return (
    <Shell user={user} onAuthChange={onAuthChange} dashboard
      bottomNav={<DashTabbar label={t("nav.home")} moreLabel={t("od.tab.more")} active={active} to={toAny} tabs={[explore, ...items]} />}>
      <div className="odLayout">
        <DashSidebar
          label={t("nav.home")}
          head={<div className="odUser"><span className="odAvatar">{(user.name || user.email || user.username).charAt(0).toUpperCase()}</span><span className="odUserName">{user.name || user.email}</span></div>}
          groups={[{ items: [explore, ...items] }]}
          active={active}
          to={toAny}
        />
        <div className="odMain">
          {active === "saved" && <Saved />}
          {active === "settings" && <Settings user={user} />}
        </div>
      </div>
    </Shell>
  );
}

function Saved() {
  const { t } = useT();
  const { data = [], isLoading } = useQuery({ queryKey: ["my-saved"], queryFn: () => apiGet<Business[]>("/me/saved/"), retry: false });
  return (
    <section className="savedPage">
      <h1>{t("saved.title")}</h1>
      <p className="mutedText">{t("saved.copy")}</p>
      {isLoading ? <p className="emptyState">{t("home.finding")}</p>
        : data.length ? <BusinessCards businesses={data} />
          : <div className="emptyState"><IconBadge icon={Heart} /><p>{t("saved.empty")}</p><Link className="button" to={ROUTES.discover}>{t("nav.explore")}</Link></div>}
    </section>
  );
}

function Settings({ user }: { user: PortalUser }) {
  const { t, lang, setLang } = useT();
  return (
    <section className="odCard">
      <h2>{t("cd.settings")}</h2>
      <fieldset className="themePicker">
        <legend>{t("lang.label")}</legend>
        <div className="themeOptions">
          {LANGUAGES.map((item) => (
            <button key={item.code} type="button" lang={item.code} className={lang === item.code ? "on" : ""} aria-pressed={lang === item.code} onClick={() => setLang(item.code)}>{item.label}</button>
          ))}
        </div>
      </fieldset>
      <ThemePicker user={user} />
    </section>
  );
}

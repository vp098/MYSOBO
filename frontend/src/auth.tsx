import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Building2, Home, ShieldCheck, Sparkles } from "lucide-react";
import { LanguageSwitch, useT } from "./i18n";
import { Logo } from "./logo";
import { GoogleSignIn } from "./google";
import { LeafField } from "./leaves";
import { ROUTES, useMe, type LoginResult } from "./session";
import type { PortalUser } from "./services/api";

/*
 * /signup and /login. Google is the only way in. On sign-up the person first
 * picks Resident or Business owner; that becomes their role. After signing in
 * they go back to the page that asked (?next=) or to their own dashboard.
 */

/** Only same-site paths are allowed as a return address. */
function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login") || value.startsWith("/signup")) return "";
  return value;
}

export function loginPath(next?: string, signup = false, owner = false) {
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  if (owner) params.set("as", "owner");
  const query = params.toString();
  return `${signup ? "/signup" : "/login"}${query ? `?${query}` : ""}`;
}

export function AuthPage({ mode }: { mode: "signup" | "login" }) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { data: me } = useMe();
  const [accountType, setAccountType] = useState<"resident" | "business_owner">(params.get("as") === "owner" ? "business_owner" : "resident");
  const next = safeNext(params.get("next"));
  const signup = mode === "signup";

  if (me) return <Navigate to={next || me.home} replace />;

  async function done(result: LoginResult) {
    await queryClient.invalidateQueries();
    navigate(next || result.home || ROUTES.discover, { replace: true });
  }

  const switchHref = loginPath(next || undefined, !signup, accountType === "business_owner");

  return (
    <div className="gaPage">
      <section className="gaCol">
        <header className="gaTop">
          <Link to={ROUTES.landing} aria-label={t("nav.home")}><Logo size={30} /></Link>
          <LanguageSwitch />
        </header>
        <div className="gaCard">
          <h1>{signup ? t("au.signupTitle") : t("au.loginTitle")}</h1>
          <p className="gaSub">{signup ? t("au.signupSubG") : t("au.loginSubG")}</p>

          {signup && (
            <div className="gaRoles" role="radiogroup" aria-label={t("au.typeLabel")}>
              {([
                ["resident", Home, "au.typeResident", "au.typeResidentHint"],
                ["business_owner", Building2, "au.typeOwner", "au.typeOwnerHint"],
              ] as const).map(([value, Icon, label, hint]) => (
                <button key={value} type="button" role="radio" aria-checked={accountType === value}
                  className={accountType === value ? "on" : ""} onClick={() => setAccountType(value)}>
                  <span className="gaRoleIcon"><Icon size={20} /></span>
                  <span><b>{t(label)}</b><small>{t(hint)}</small></span>
                </button>
              ))}
            </div>
          )}

          <GoogleSignIn key={accountType} signup={signup} accountType={signup ? accountType : undefined} onSuccess={(result) => void done(result)} />
          <p className="gaFine">{t("login.googleConsent")}</p>
          <p className="gaSwitch">
            {signup ? t("auth.haveAccount") : t("auth.noAccount")} <Link to={switchHref}>{signup ? t("auth.logIn") : t("au.createFree")}</Link>
          </p>
        </div>
        <footer className="gaFoot">{t("au.footer")}</footer>
      </section>
      <aside className="gaAside" aria-hidden="true">
        <LeafField compact />
        <div className="gaAsideCard">
          <p className="gaChip"><Sparkles size={14} />{t("auth.asideChip")}</p>
          <h2>{t("au.asideTitle")}</h2>
          <ul>
            <li><BadgeCheck size={18} />{t("au.perk5")}</li>
            <li><ShieldCheck size={18} />{t("au.perkGoogle")}</li>
            <li><Home size={18} />{t("auth.perk1")}</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

/** Old links used ?dialog=login / ?dialog=signup. Send them to the new pages, coming back here afterwards. */
export function useLegacyLoginRedirect(user?: PortalUser) {
  const location = useLocation();
  const [params] = useSearchParams();
  const dialog = params.get("dialog");
  if (user || (dialog !== "login" && dialog !== "signup")) return null;
  const rest = new URLSearchParams(params);
  rest.delete("dialog");
  const goHome = rest.get("go") === "home";
  rest.delete("go");
  const owner = rest.get("as") === "owner";
  rest.delete("as");
  const here = `${location.pathname}${rest.toString() ? `?${rest}` : ""}`;
  return loginPath(goHome ? undefined : here, dialog === "signup", owner);
}

import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Bookmark, Cake, GraduationCap, HeartPulse, Phone, Scissors, Search, ShoppingBasket, Store, Tag, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Shell } from "./App";
import { NeighbourhoodHub, fadeUp, stagger } from "./hub";
import { LeafMark } from "./logo";
import { useT, type MessageKey } from "./i18n";
import { apiGet, type PortalUser } from "./services/api";
import { ROUTES } from "./session";

type PublicPlans = { gst_percent: number; plans: { plan: "free" | "pro" | "premium"; monthly_price: number; monthly_total: number }[] };

const ORBIT_OUTER: LucideIcon[] = [HeartPulse, GraduationCap, Wrench, Scissors];
const ORBIT_INNER: LucideIcon[] = [ShoppingBasket, Cake, Store];
const FEATURES: Record<string, MessageKey[]> = {
  free: ["od.feat.free1", "od.feat.free2", "od.feat.free3"],
  pro: ["od.feat.pro1", "od.feat.pro2", "od.feat.pro3", "od.feat.pro4"],
  premium: ["od.feat.prem1", "od.feat.prem2", "od.feat.prem3", "od.feat.prem4"],
};

/** Circular brand mark: the MySobo leaf at the centre, local services and shops circling it. */
function Orbit() {
  const reduce = useReducedMotion();
  const ring = (icons: LucideIcon[], radius: number, seconds: number, reverse = false) => (
    <motion.div
      className="orbRing"
      style={{ width: radius * 2, height: radius * 2 }}
      animate={reduce ? undefined : { rotate: reverse ? -360 : 360 }}
      transition={{ duration: seconds, repeat: Infinity, ease: "linear" }}
    >
      {icons.map((Icon, index) => {
        const angle = (index / icons.length) * Math.PI * 2;
        return (
          <motion.span
            key={index}
            className="orbChip"
            style={{ left: radius + Math.cos(angle) * radius, top: radius + Math.sin(angle) * radius }}
            animate={reduce ? undefined : { rotate: reverse ? 360 : -360 }}
            transition={{ duration: seconds, repeat: Infinity, ease: "linear" }}
          >
            <Icon size={22} strokeWidth={1.8} />
          </motion.span>
        );
      })}
    </motion.div>
  );
  return (
    <div className="orb" aria-hidden="true">
      {ring(ORBIT_OUTER, 190, 60)}
      {ring(ORBIT_INNER, 118, 44, true)}
      <div className="orbCore"><LeafMark size={64} /></div>
    </div>
  );
}

/** Public landing page at /sobo. */
export function Landing({ user, onAuthChange }: { user?: PortalUser; onAuthChange: () => void }) {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const reduce = useReducedMotion();
  const { data: pricing } = useQuery({ queryKey: ["public-plans"], queryFn: () => apiGet<PublicPlans>("/plans/") });
  const money = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 });

  function signUpAsOwner() {
    const next = new URLSearchParams(params);
    next.set("dialog", "signup");
    next.set("as", "owner");
    next.set("go", "home");
    setParams(next);
  }

  const steps: [LucideIcon, MessageKey, MessageKey][] = [
    [Search, "land.step1", "land.step1Text"],
    [BadgeCheck, "land.step2", "land.step2Text"],
    [Phone, "land.step3", "land.step3Text"],
  ];

  return (
    <Shell user={user} onAuthChange={onAuthChange} bottomNav={null}>
      <section className="land">
        <motion.div className="landCopy" initial={reduce ? false : "hidden"} animate="show" variants={stagger}>
          <motion.p variants={fadeUp} className="landChip"><LeafMark size={16} />{t("land.chip")}</motion.p>
          <motion.h1 variants={fadeUp}>{t("land.title1")} <em>{t("land.title2")}</em></motion.h1>
          <motion.p variants={fadeUp} className="landSub">{t("land.sub")}</motion.p>
          <motion.div variants={fadeUp} className="landCtas">
            <Link className="landBtn primary" to={ROUTES.discover}><Search size={18} />{t("land.ctaFind")}</Link>
            {user
              ? <Link className="landBtn" to={user.home}>{t("nav.dashboard")}</Link>
              : <button type="button" className="landBtn" onClick={signUpAsOwner}><Store size={18} />{t("land.ctaList")}</button>}
          </motion.div>
          <motion.p variants={fadeUp} className="landFine">{t("land.fine")}</motion.p>
        </motion.div>
        <div className="orbWrap"><Orbit /></div>
      </section>

      <section className="section landTwo">
        <article className="landCard">
          <span className="landCardIcon"><Search size={22} /></span>
          <h2>{t("land.residentsTitle")}</h2>
          <ul>
            <li><BadgeCheck size={17} />{t("land.res1")}</li>
            <li><Phone size={17} />{t("land.res2")}</li>
            <li><Bookmark size={17} />{t("land.res3")}</li>
          </ul>
          <Link className="landLink" to={ROUTES.discover}>{t("land.ctaFind")} →</Link>
        </article>
        <article className="landCard owner">
          <span className="landCardIcon"><Store size={22} /></span>
          <h2>{t("land.ownersTitle")}</h2>
          <ul>
            <li><Store size={17} />{t("land.own1")}</li>
            <li><Tag size={17} />{t("land.own2")}</li>
            <li><BadgeCheck size={17} />{t("land.own3")}</li>
          </ul>
          {user
            ? <Link className="landLink" to={ROUTES.owner}>{t("nav.business")} →</Link>
            : <button type="button" className="landLink" onClick={signUpAsOwner}>{t("land.ctaList")} →</button>}
        </article>
      </section>

      <section className="section landSteps">
        <h2>{t("land.howTitle")}</h2>
        <ol>
          {steps.map(([Icon, title, text], index) => (
            <li key={title}><span className="landStepNo">{index + 1}</span><Icon size={22} /><b>{t(title)}</b><p>{t(text)}</p></li>
          ))}
        </ol>
      </section>

      <NeighbourhoodHub />

      {pricing && pricing.plans.length > 0 && (
        <section className="section landPricing" id="pricing">
          <h2>{t("land.pricingTitle")}</h2>
          <p className="mutedText">{t("land.pricingSub", { gst: pricing.gst_percent })}</p>
          <div className="landPlans">
            {pricing.plans.map((plan) => (
              <article key={plan.plan} className={`landPlan ${plan.plan === "pro" ? "pick" : ""}`}>
                <h3>{t(`od.plan.${plan.plan}` as MessageKey)}</h3>
                <p className="landPrice"><b>₹{money(plan.monthly_price)}</b><span>/ {t("od.month")}</span></p>
                <p className="landGst">{plan.monthly_price ? t("land.withGst", { total: money(plan.monthly_total), gst: pricing.gst_percent }) : t("land.freeForever")}</p>
                <ul>{(FEATURES[plan.plan] ?? []).map((key) => <li key={key}><BadgeCheck size={16} />{t(key)}</li>)}</ul>
              </article>
            ))}
          </div>
          <p className="landFine">{t("land.payNote")}</p>
        </section>
      )}

      <section className="section landEnd">
        <h2>{t("land.endTitle")}</h2>
        <div className="landCtas">
          <Link className="landBtn primary" to={ROUTES.discover}>{t("land.ctaFind")}</Link>
          {!user && <button type="button" className="landBtn" onClick={signUpAsOwner}>{t("land.ctaList")}</button>}
        </div>
      </section>
    </Shell>
  );
}

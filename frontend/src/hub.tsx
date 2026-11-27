import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useId, type ReactNode } from "react";
import { useT, type MessageKey } from "./i18n";

/** Spoke positions in a 1000 x 560 box; the hub sits at the centre (500, 280). */
const SPOKES: { key: MessageKey; x: number; y: number; tone: "marigold" | "white" | "peach" | "mint" }[] = [
  { key: "hub.shops", x: 455, y: 40, tone: "white" },
  { key: "hub.cafes", x: 820, y: 95, tone: "peach" },
  { key: "hub.tutors", x: 830, y: 410, tone: "mint" },
  { key: "hub.services", x: 470, y: 520, tone: "white" },
  { key: "hub.doctors", x: 150, y: 455, tone: "mint" },
  { key: "hub.residents", x: 180, y: 110, tone: "marigold" },
];
const CX = 500;
const CY = 280;
const HUB_R = 72;

/** Start each spoke at the hub's edge, not its centre. */
function spokeStart(x: number, y: number) {
  const dx = x - CX;
  const dy = y - CY;
  const len = Math.hypot(dx, dy);
  return { x: CX + (dx / len) * (HUB_R + 6), y: CY + (dy / len) * (HUB_R + 6) };
}

export function NeighbourhoodHub() {
  const { t } = useT();
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const viewport = { once: true, amount: 0.35 };

  return (
    <section className="hubSection" aria-labelledby="hub-title">
      <motion.div
        className="hubCopy"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewport}
        transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
      >
        <h2 id="hub-title">{t("hub.title1")} <em>{t("hub.title2")}</em></h2>
        <p>{t("hub.sub")}</p>
      </motion.div>

      <div className="hubStage" role="img" aria-label={t("hub.diagram")}>
        <svg className="hubLines" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
          {SPOKES.map((spoke, index) => {
            const start = spokeStart(spoke.x, spoke.y);
            const d = `M${start.x} ${start.y} L${spoke.x} ${spoke.y}`;
            return (
              <g key={spoke.key}>
                <mask id={`${uid}-m${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="560">
                  <motion.path
                    d={d}
                    stroke="white"
                    strokeWidth="10"
                    fill="none"
                    initial={reduce ? false : { pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={viewport}
                    transition={{ duration: 0.7, delay: 0.35 + index * 0.12, ease: "easeOut" }}
                  />
                </mask>
                <path d={d} className="hubLine" mask={`url(#${uid}-m${index})`} />
                {!reduce && (
                  <circle r="4" className="hubPulse">
                    <animateMotion dur={`${2.6 + (index % 3) * 0.4}s`} begin={`${1.4 + index * 0.35}s`} repeatCount="indefinite" path={d} />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        <motion.div
          className="hubCore"
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={viewport}
          transition={{ type: "spring", stiffness: 160, damping: 16 }}
        >
          {!reduce && <span className="hubRing" aria-hidden="true" />}
          {!reduce && <span className="hubRing late" aria-hidden="true" />}
          <svg className="hubLeaf" viewBox="0 0 100 124" width="47" height="58" aria-hidden="true">
            <path d="M50 3C57 13 91 22 93 52c2 27-25 47-43 63C32 99 5 79 7 52 9 22 43 13 50 3z" fill="#FCFEFB" />
            <path d="M48 21c-4 25 6 46 2 92" fill="none" stroke="#287A4B" strokeWidth="4.2" strokeLinecap="round" />
            <circle cx="50" cy="116" r="6.5" fill="#F2A33A" />
          </svg>
        </motion.div>

        {SPOKES.map((spoke, index) => (
          <Chip key={spoke.key} x={spoke.x} y={spoke.y} tone={spoke.tone} index={index} reduce={!!reduce}>
            {t(spoke.key)}
          </Chip>
        ))}
      </div>

      <motion.ul
        className="hubEssence"
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 1.2 } } }}
      >
        {(["hub.e1", "hub.e2", "hub.e3", "hub.e4"] as MessageKey[]).map((key) => (
          <motion.li key={key} variants={reduce ? undefined : fadeUp}>{t(key)}</motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

function Chip({ x, y, tone, index, reduce, children }: { x: number; y: number; tone: string; index: number; reduce: boolean; children: ReactNode }) {
  return (
    <motion.span
      className={`hubChip ${tone}`}
      style={{ left: `${x / 10}%`, top: `${(y / 560) * 100}%` }}
      initial={reduce ? false : { opacity: 0, scale: 0.7 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.75 + index * 0.12 }}
    >
      <motion.span
        className="hubChipInner"
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 3.4 + (index % 3) * 0.6, repeat: Infinity, ease: "easeInOut", delay: index * 0.3 }}
        whileHover={{ scale: 1.06 }}
      >
        {children}
      </motion.span>
    </motion.span>
  );
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0, 0, 1] } },
};

/** Parent variants: children using `fadeUp` appear one after another. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

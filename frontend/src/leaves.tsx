import { LeafMark } from "./logo";

/*
 * Brand illustration: leaves gathering, floating, rotating and circling the
 * MySobo leaf. Pure SVG + CSS transforms (GPU friendly). It holds still when
 * the person prefers reduced motion (see .lf* rules in styles.css).
 */

const LEAF = "M0 -26 C 15 -16 15 14 0 26 C -15 14 -15 -16 0 -26 Z";
const VEIN = "M0 -20 L0 22";
const PALETTE = ["#287A4B", "#3A9160", "#5BAF7C", "#86C99D", "#F2A33A", "#1F613B"];

type Leaf = { angle: number; size: number; color: number; delay: number };
const OUTER: Leaf[] = Array.from({ length: 8 }, (_, i) => ({ angle: i * 45 + 10, size: 1 + (i % 3) * 0.18, color: i % PALETTE.length, delay: -i * 1.3 }));
const INNER: Leaf[] = Array.from({ length: 6 }, (_, i) => ({ angle: i * 60 + 35, size: 0.78 + (i % 2) * 0.16, color: (i + 2) % PALETTE.length, delay: -i * 0.9 }));
const DRIFT = [
  { x: 90, y: 120, s: 0.7, c: 3, d: 0 },
  { x: 500, y: 90, s: 0.6, c: 4, d: -3 },
  { x: 520, y: 470, s: 0.8, c: 1, d: -6 },
  { x: 70, y: 470, s: 0.65, c: 2, d: -2 },
];

function LeafShape({ color, size }: { color: number; size: number }) {
  return (
    <g className="lfLeaf" style={{ transform: `scale(${size})` }}>
      <path d={LEAF} fill={PALETTE[color]} />
      <path d={VEIN} stroke="rgba(255,255,255,.55)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Ring({ leaves, radius, className }: { leaves: Leaf[]; radius: number; className: string }) {
  return (
    <g className={`lfRing ${className}`}>
      {leaves.map((leaf, index) => (
        <g key={index} transform={`rotate(${leaf.angle} 300 300) translate(300 ${300 - radius})`}>
          <g className="lfSpinWrap" style={{ animationDelay: `${leaf.delay}s` }}>
            <LeafShape color={leaf.color} size={leaf.size} />
          </g>
        </g>
      ))}
    </g>
  );
}

export function LeafField({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`lfStage ${compact ? "compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 600 600" className="lfSvg" role="presentation">
        <defs>
          <radialGradient id="lf-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#EAF8ED" stopOpacity="1" />
            <stop offset="70%" stopColor="#EAF8ED" stopOpacity=".55" />
            <stop offset="100%" stopColor="#EAF8ED" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="300" cy="300" r="290" fill="url(#lf-glow)" />
        <circle cx="300" cy="300" r="215" className="lfTrack" />
        <circle cx="300" cy="300" r="135" className="lfTrack" />
        <g className="lfGather">
          <Ring leaves={OUTER} radius={215} className="outer" />
          <Ring leaves={INNER} radius={135} className="inner" />
        </g>
        {DRIFT.map((leaf, index) => (
          <g key={index} transform={`translate(${leaf.x} ${leaf.y})`}>
            <g className="lfDrift" style={{ animationDelay: `${leaf.d}s` }}>
              <LeafShape color={leaf.c} size={leaf.s} />
            </g>
          </g>
        ))}
      </svg>
      <div className="lfCore"><LeafMark size={compact ? 44 : 72} /></div>
    </div>
  );
}

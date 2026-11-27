import { useId } from "react";

/*
 * MySobo logo, "Rooted nearby": a neem leaf that is also a map pin. Its
 * centre vein is a street, and the marigold dot marks the spot.
 * Wordmark: "My" in italic serif, "Sobo" upright, then a marigold dot.
 */

export function LeafMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`leafMark ${className}`} viewBox="0 0 100 124" width={size * (100 / 124)} height={size} aria-hidden="true">
      <path d="M50 3C57 13 91 22 93 52c2 27-25 47-43 63C32 99 5 79 7 52 9 22 43 13 50 3z" fill="#2B7A4B" />
      <path d="M48 21c-4 25 6 46 2 92" fill="none" stroke="#EAF8ED" strokeWidth="4.2" strokeLinecap="round" />
      <circle cx="50" cy="116" r="6.5" fill="#F2A33A" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`} lang="en">
      <i>My</i>Sobo<b aria-hidden="true">.</b>
    </span>
  );
}

/** Horizontal lockup: leaf + MySobo. */
export function Logo({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`logo ${className}`} style={{ fontSize: size }}>
      <LeafMark size={size * 1.05} />
      <Wordmark />
    </span>
  );
}

/**
 * The leaf pin dropped on a small neighbourhood map, with a marigold pulse
 * where it lands. Used on the welcome screen, sign-up header and home hero.
 */
export function PinScene({ className = "" }: { className?: string }) {
  // Unique ids per instance: a hidden copy elsewhere on the page must not own the gradient or shadow.
  const uid = useId().replace(/:/g, "");
  const sky = `psSky${uid}`;
  const shadow = `psShadow${uid}`;
  return (
    <svg className={`pinScene ${className}`} viewBox="0 0 360 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7FCF8" />
          <stop offset="1" stopColor="#CDEFD5" />
        </linearGradient>
        <filter id={shadow} x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#0F3A22" floodOpacity=".22" />
        </filter>
      </defs>
      <rect width="360" height="260" fill={`url(#${sky})`} />
      {/* blocks */}
      <g fill="#EAF8ED" stroke="#B1DFBF" strokeWidth="1">
        <rect x="14" y="40" width="86" height="64" rx="12" />
        <rect x="14" y="170" width="86" height="80" rx="12" />
        <rect x="150" y="22" width="78" height="70" rx="12" />
        <rect x="272" y="40" width="80" height="78" rx="12" />
        <rect x="276" y="176" width="78" height="76" rx="12" />
      </g>
      {/* streets: the leaf's vein continues as a road */}
      <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
        <path d="M-10 140C70 118 150 160 210 146S320 112 370 128" strokeWidth="14" />
        <path d="M124 -10C134 70 112 150 130 270" strokeWidth="12" />
        <path d="M252 -10C244 80 268 168 256 270" strokeWidth="12" />
      </g>
      <path d="M-10 140C70 118 150 160 210 146S320 112 370 128" fill="none" stroke="#B1DFBF" strokeWidth="1.5" strokeDasharray="6 8" />
      {/* little homes and trees */}
      <g>
        <path d="M34 82l14-12 14 12v16H34z" fill="#86C99D" /><rect x="44" y="88" width="8" height="10" fill="#EAF8ED" />
        <path d="M168 66l12-10 12 10v14h-24z" fill="#86C99D" />
        <path d="M296 92l13-11 13 11v15h-26z" fill="#86C99D" />
        <path d="M34 214l14-12 14 12v16H34z" fill="#86C99D" />
        <circle cx="80" cy="60" r="9" fill="#5BAF7C" /><circle cx="208" cy="40" r="8" fill="#5BAF7C" />
        <circle cx="330" cy="200" r="10" fill="#5BAF7C" /><circle cx="300" cy="230" r="7" fill="#86C99D" />
        <circle cx="78" cy="196" r="8" fill="#5BAF7C" />
      </g>
      {/* other nearby places */}
      <g>
        <circle cx="62" cy="128" r="6" fill="#2B7A4B" stroke="#fff" strokeWidth="3" />
        <circle cx="300" cy="150" r="6" fill="#2B7A4B" stroke="#fff" strokeWidth="3" />
        <circle cx="214" cy="214" r="6" fill="#F2A33A" stroke="#fff" strokeWidth="3" />
      </g>
      {/* pulse where the pin lands */}
      <g fill="none" stroke="#F2A33A" strokeWidth="2.5">
        <ellipse cx="180" cy="192" rx="14" ry="5">
          <animate attributeName="rx" values="14;70" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="ry" values="5;22" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values=".9;0" dur="2.6s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="180" cy="192" rx="14" ry="5">
          <animate attributeName="rx" values="14;70" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
          <animate attributeName="ry" values="5;22" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values=".9;0" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
        </ellipse>
      </g>
      <ellipse cx="180" cy="194" rx="26" ry="7" fill="#0F3A22" opacity=".16" />
      {/* the leaf pin */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" dur="3.2s" repeatCount="indefinite" />
        <g transform="translate(134 85) scale(.92)" filter={`url(#${shadow})`}>
          <path d="M50 3C57 13 91 22 93 52c2 27-25 47-43 63C32 99 5 79 7 52 9 22 43 13 50 3z" fill="#2B7A4B" />
          <path d="M48 21c-4 25 6 46 2 92" fill="none" stroke="#EAF8ED" strokeWidth="4.2" strokeLinecap="round" />
          <circle cx="50" cy="116" r="7" fill="#F2A33A" stroke="#fff" strokeWidth="2.5" />
        </g>
      </g>
    </svg>
  );
}

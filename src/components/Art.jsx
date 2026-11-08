import { useId } from "react";

const hex = (c, fallback) => (/^#[0-9a-fA-F]{3,8}$/.test(c || "") ? c : fallback);

export default function Art({ kind, pal = [] }) {
  const uid = useId().replace(/:/g, "");
  const a = hex(pal[0], "#222a3d");
  const b = hex(pal[1], "#7C93FF");
  const c = hex(pal[2], "#F0A81E");
  const svg = { viewBox: "0 0 160 90", preserveAspectRatio: "xMidYMid slice", "aria-hidden": true };
  const defs = (
    <defs>
      <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={a} />
        <stop offset="1" stopColor={b} />
      </linearGradient>
      <radialGradient id={`r${uid}`}>
        <stop offset="0" stopColor={b} />
        <stop offset="1" stopColor={c} stopOpacity="0" />
      </radialGradient>
    </defs>
  );

  if (kind === "road")
    return (
      <svg {...svg}>
        {defs}
        <rect width="160" height="90" fill={`url(#g${uid})`} />
        <circle cx="112" cy="40" r="14" fill={c} />
        <rect y="50" width="160" height="40" fill="#f2e6d8" opacity=".93" />
        <polygon points="73,50 87,50 132,90 28,90" fill="#2a2f3d" opacity=".88" />
        <path d="M80 53v5M80 62v8M80 75v12" stroke="#f2e6d8" strokeWidth="1.5" />
      </svg>
    );

  if (kind === "glitch") {
    const bars = [[8, 10, 70], [22, 6, 100], [34, 14, 50], [52, 8, 120], [64, 5, 80], [76, 10, 60]];
    return (
      <svg {...svg}>
        <rect width="160" height="90" fill={a} />
        {bars.map(([y, h, w], i) => (
          <rect key={i} x={w - 30 + i * 6} y={y} width={w} height={h / 2 + 2} fill={i % 2 ? c : b} opacity=".85" />
        ))}
        <circle cx="80" cy="45" r="22" fill="none" stroke={c} strokeWidth="2.5" />
        <circle cx="84" cy="45" r="22" fill="none" stroke={b} strokeWidth="2.5" opacity=".8" />
      </svg>
    );
  }

  if (kind === "sails")
    return (
      <svg {...svg}>
        {defs}
        <rect width="160" height="90" fill={`url(#g${uid})`} />
        <polygon points="62,14 62,58 34,58" fill={c} />
        <polygon points="68,22 68,58 100,58" fill={c} opacity=".85" />
        <path d="M28 60h80l-10 10H38z" fill="#1a2238" />
        <path d="M0 72q20-8 40 0t40 0 40 0 40 0v18H0z" fill={b} opacity=".8" />
        <path d="M0 80q20-6 40 0t40 0 40 0 40 0v10H0z" fill="#1a2238" opacity=".55" />
      </svg>
    );

  if (kind === "bloom")
    return (
      <svg {...svg}>
        {defs}
        <rect width="160" height="90" fill={a} />
        <circle cx="80" cy="45" r="46" fill={`url(#r${uid})`} opacity=".35" />
        {Array.from({ length: 8 }, (_, i) => {
          const an = (i * Math.PI) / 4;
          const cx = 80 + Math.cos(an) * 14;
          const cy = 45 + Math.sin(an) * 14;
          return (
            <ellipse key={i} cx={cx} cy={cy} rx="18" ry="8" transform={`rotate(${i * 45} ${cx} ${cy})`} fill={i % 2 ? b : c} opacity=".7" />
          );
        })}
        <circle cx="80" cy="45" r="7" fill="#F5E9A8" />
      </svg>
    );

  return (
    <svg {...svg}>
      {defs}
      <rect width="160" height="90" fill={`url(#g${uid})`} />
      {[22, 62, 102].map((x, i) => (
        <g key={x}>
          <rect x={x} y={12 + i * 4} width="36" height="66" rx="6" fill={c} />
          <rect x={x + 3} y={15 + i * 4} width="30" height="60" rx="4" fill={i === 1 ? a : "#10131B"} />
          <circle cx={x + 18} cy={45 + i * 4} r="7" fill={c} opacity=".9" />
        </g>
      ))}
    </svg>
  );
}
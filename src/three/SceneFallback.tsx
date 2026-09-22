/** Static illustration shown when WebGL is unavailable or a scene fails — the page stays fully usable. */
export function SceneFallback({ compact = false }: { compact?: boolean }) {
  return (
    <svg viewBox="0 0 800 420" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="kd-fb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--bg))" />
          <stop offset="100%" stopColor="rgb(var(--sunken))" />
        </linearGradient>
      </defs>
      <rect width="800" height="420" fill="url(#kd-fb-sky)" />
      <circle cx="640" cy="110" r="34" fill="rgb(var(--warn) / 0.35)" />
      <path d="M0 300 C160 250 320 270 460 255 C600 240 700 262 800 250 L800 420 L0 420 Z" fill="rgb(var(--accent) / 0.22)" />
      <path d="M0 340 C200 310 420 330 800 305 L800 420 L0 420 Z" fill="rgb(var(--accent) / 0.35)" />
      {!compact &&
        Array.from({ length: 40 }, (_, i) => (
          <path key={i} d={`M${10 + i * 20} 420 q 6 -46 ${i % 2 ? 10 : -6} -70`} stroke="rgb(var(--accent) / 0.55)" strokeWidth="2" fill="none" />
        ))}
      <g transform="translate(560 420)">
        <path d="M0 0 C 0 -80 4 -150 2 -210" stroke="rgb(var(--accent))" strokeWidth="4" fill="none" />
        <path d="M2 -60 C 40 -90 70 -90 96 -70" stroke="rgb(var(--accent))" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M2 -110 C -36 -140 -66 -140 -90 -118" stroke="rgb(var(--accent))" strokeWidth="6" fill="none" strokeLinecap="round" />
        <ellipse cx="2" cy="-236" rx="9" ry="30" fill="rgb(var(--warn) / 0.7)" />
      </g>
    </svg>
  );
}

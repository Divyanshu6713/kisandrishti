/** Static rooftop illustration: shown while the 3D scene loads, without WebGL, or after a scene error. */
export function RooftopFallback() {
  const pots = [180, 260, 340, 420, 500, 580];
  return (
    <svg viewBox="0 0 800 420" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="kd-roof-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--bg))" />
          <stop offset="100%" stopColor="rgb(var(--sunken))" />
        </linearGradient>
      </defs>
      <rect width="800" height="420" fill="url(#kd-roof-sky)" />
      <circle cx="660" cy="96" r="30" fill="rgb(var(--warn) / 0.3)" />
      {/* neighbouring blocks */}
      <path d="M0 250 h90 v-60 h70 v60 h120 v-40 h80 v40 h260 v-70 h90 v70 h90 v170 H0Z" fill="rgb(var(--line) / 0.7)" />
      {/* parapet + slab */}
      <rect x="40" y="300" width="720" height="120" fill="rgb(var(--sunken))" />
      <rect x="40" y="288" width="720" height="16" rx="3" fill="rgb(var(--surface))" />
      {/* water tank */}
      <rect x="660" y="196" width="64" height="80" rx="10" fill="rgb(var(--ink) / 0.78)" />
      <rect x="652" y="276" width="80" height="12" fill="rgb(var(--line))" />
      {pots.map((x, i) => (
        <g key={x} transform={`translate(${x} 318)`}>
          <path d="M-22 0 h44 l-6 40 h-32Z" fill="rgb(var(--clay))" />
          <ellipse cx="0" cy="-8" rx={20 + (i % 2) * 4} ry={18 + (i % 3) * 3} fill="rgb(var(--accent) / 0.75)" />
          {i % 2 === 0 && <circle cx="8" cy="-4" r="4.5" fill="rgb(var(--danger) / 0.8)" />}
        </g>
      ))}
    </svg>
  );
}

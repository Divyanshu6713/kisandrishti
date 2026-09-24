/**
 * Onboarding illustrations. Flat shapes drawn only with theme tokens so they sit in the same
 * visual family as the 3D scenes' fallbacks and switch with light/dark.
 */

export function FieldArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="180" fill="rgb(var(--sunken))" />
      <circle cx="252" cy="44" r="18" fill="rgb(var(--warn) / 0.35)" />
      <path d="M0 96 C70 78 140 88 200 82 C250 77 290 84 320 80 V180 H0Z" fill="rgb(var(--accent) / 0.18)" />
      <path d="M0 112 C90 98 190 106 320 96 V180 H0Z" fill="rgb(var(--earth) / 0.22)" />
      {/* crop rows converging to the horizon */}
      {Array.from({ length: 9 }, (_, i) => {
        const x = 20 + i * 35;
        return <path key={i} d={`M${160 + (x - 160) * 0.35} 104 L${x} 180`} stroke="rgb(var(--accent) / 0.55)" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 7" />;
      })}
      {/* farmhouse + tree */}
      <g transform="translate(58 70)">
        <rect x="0" y="12" width="30" height="20" fill="rgb(var(--surface))" />
        <path d="M-4 14 L15 0 L34 14Z" fill="rgb(var(--clay))" />
      </g>
      <g transform="translate(268 60)">
        <rect x="-2" y="18" width="4" height="22" fill="rgb(var(--earth))" />
        <circle cx="0" cy="14" r="14" fill="rgb(var(--accent) / 0.7)" />
      </g>
    </svg>
  );
}

export function RooftopArt({ className }: { className?: string }) {
  const pots = [92, 132, 172, 212];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="180" fill="rgb(var(--sunken))" />
      <circle cx="60" cy="40" r="16" fill="rgb(var(--warn) / 0.35)" />
      {/* skyline */}
      <path d="M0 100 h40 v-26 h36 v26 h60 v-18 h40 v18 h70 v-34 h34 v34 h40 v80 H0Z" fill="rgb(var(--line) / 0.8)" />
      {/* terrace */}
      <rect x="0" y="118" width="320" height="62" fill="rgb(var(--earth) / 0.16)" />
      <rect x="0" y="110" width="320" height="10" fill="rgb(var(--surface))" />
      {/* water tank */}
      <rect x="254" y="62" width="34" height="40" rx="6" fill="rgb(var(--ink) / 0.75)" />
      <rect x="250" y="102" width="42" height="8" fill="rgb(var(--line))" />
      {pots.map((x, i) => (
        <g key={x} transform={`translate(${x} 138)`}>
          <path d="M-13 0 h26 l-4 24 h-18Z" fill="rgb(var(--clay))" />
          <ellipse cx="0" cy="-8" rx={12 + (i % 2) * 3} ry={13 + (i % 3) * 2} fill="rgb(var(--accent) / 0.8)" />
          {i % 2 === 0 && <circle cx="5" cy="-4" r="3.2" fill="rgb(var(--danger) / 0.85)" />}
        </g>
      ))}
      {/* trough of greens */}
      <rect x="26" y="146" width="44" height="16" rx="2" fill="rgb(var(--clay) / 0.85)" />
      {[32, 40, 48, 56, 64].map((x) => (
        <ellipse key={x} cx={x} cy="144" rx="5" ry="6" fill="rgb(var(--accent) / 0.7)" />
      ))}
    </svg>
  );
}

/** Quiet field horizon pinned to the bottom of onboarding screens. */
export function HorizonBackdrop() {
  return (
    <svg viewBox="0 0 1440 160" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-28 w-full sm:h-36" aria-hidden>
      <path d="M0 70 C240 40 480 60 720 52 C960 44 1200 62 1440 48 V160 H0Z" fill="rgb(var(--accent) / 0.09)" />
      <path d="M0 104 C320 84 700 100 1440 86 V160 H0Z" fill="rgb(var(--accent) / 0.12)" />
    </svg>
  );
}

/** Every colour is a CSS variable (see src/styles/tokens.css) so both themes switch centrally. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        sunken: v('sunken'),
        line: v('line'),
        ink: { DEFAULT: v('ink'), 2: v('ink-2'), 3: v('ink-3') },
        accent: { DEFAULT: v('accent'), soft: v('accent-soft'), ink: v('on-accent') },
        earth: { DEFAULT: v('earth'), soft: v('earth-soft') },
        clay: { DEFAULT: v('clay'), soft: v('clay-soft') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
      },
      fontFamily: {
        // Manrope has no Devanagari glyphs: Hindi falls through to the platform's Devanagari UI font.
        sans: ['"Manrope Variable"', 'Manrope', '"Noto Sans Devanagari"', '"Nirmala UI"', '"Kohinoor Devanagari"', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        // Deliberately small scale: label / sm / base / lead / h3 / h2 / h1 / display
        label: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.9375rem', { lineHeight: '1.6rem' }],
        lead: ['1.0625rem', { lineHeight: '1.75rem' }],
        h3: ['1.125rem', { lineHeight: '1.6rem', letterSpacing: '-0.01em' }],
        h2: ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.02em' }],
        h1: ['2rem', { lineHeight: '2.5rem', letterSpacing: '-0.025em' }],
        display: ['clamp(2.5rem, 5.4vw, 4.5rem)', { lineHeight: '1.04', letterSpacing: '-0.035em' }],
      },
      // panel = large primary surfaces (onboarding, hero cards) · card = cards · ctl = controls. Pills only for chips.
      borderRadius: { panel: '1.5rem', card: '1.125rem', ctl: '0.75rem' },
      boxShadow: { soft: 'var(--shadow-soft)', lift: 'var(--shadow-lift)' },
      maxWidth: { content: '76rem', prose: '38rem' },
      transitionTimingFunction: { calm: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [],
};

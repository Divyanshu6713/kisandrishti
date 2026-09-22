import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { useTheme } from '@/theme/ThemeProvider';

export const BRAND = {
  name: 'Kisan Drishti',
  tagline: 'Intelligent Farming. Better Decisions.',
};

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="18" fill="rgb(var(--accent))" />
      <path d="M32 50V25" stroke="rgb(var(--on-accent))" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M32 35c-8 0-13-5-13-13 8 0 13 5 13 13Z" fill="rgb(var(--on-accent))" />
      <path d="M32 31c0-8 5-13 13-13 0 8-5 13-13 13Z" fill="rgb(var(--on-accent))" opacity=".72" />
      <circle cx="32" cy="14" r="3" fill="rgb(var(--on-accent))" opacity=".9" />
    </svg>
  );
}

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('group inline-flex items-center gap-2.5 rounded-ctl', className)} aria-label={`${BRAND.name} home`}>
      <LogoMark className="h-8 w-8 transition-transform duration-500 ease-calm group-hover:rotate-[-6deg]" />
      <span className="text-[1.05rem] font-bold tracking-tight">{BRAND.name}</span>
    </Link>
  );
}

/** Light/dark switch with a sliding knob. Persisted by ThemeProvider. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      onClick={toggle}
      className={cn('relative inline-flex h-8 w-[3.6rem] shrink-0 items-center rounded-full border border-line bg-sunken p-0.5 transition-colors hover:border-ink-3/40', className)}
    >
      <Sun className="absolute left-2 h-3.5 w-3.5 text-ink-3" aria-hidden />
      <Moon className="absolute right-2 h-3.5 w-3.5 text-ink-3" aria-hidden />
      <motion.span
        className="relative z-10 grid h-6 w-6 place-items-center rounded-full bg-surface shadow-soft"
        animate={{ x: dark ? 26 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
      >
        {dark ? <Moon className="h-3.5 w-3.5 text-accent" aria-hidden /> : <Sun className="h-3.5 w-3.5 text-warn" aria-hidden />}
      </motion.span>
    </button>
  );
}

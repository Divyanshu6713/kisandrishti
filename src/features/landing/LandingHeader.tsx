import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Logo, ThemeToggle } from '@/components/layout/brand';

const LINKS = [
  { href: '#journey', label: 'How it works' },
  { href: '#organic', label: 'Organic' },
  { href: '#intelligence', label: 'Intelligence' },
];

export function LandingHeader({ onEnter }: { onEnter: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={cn('fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-500', scrolled ? 'border-b border-line/60 bg-bg/80 backdrop-blur-md' : 'border-b border-transparent')}>
      <div className="container-page flex h-16 items-center gap-6 sm:h-[4.5rem]">
        <Logo />
        <nav aria-label="Sections" className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-ctl px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <button type="button" onClick={onEnter} className="btn-primary hidden sm:inline-flex">
            Enter demo
          </button>
        </div>
      </div>
    </header>
  );
}

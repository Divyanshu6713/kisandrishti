import { motion, useReducedMotion } from 'framer-motion';
import { Home as HomeIcon, Info, LogOut, Menu, RotateCcw, Sparkles, Tractor } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { lazyPage as lazy } from '@/lib/lazyPage';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { FarmContextProvider } from '@/hooks/useFarmContext';
import { ENGINE } from '@/services';
import { useFarmStore } from '@/state/farmStore';
import { toast } from '@/state/toastStore';
import { useUiStore } from '@/state/uiStore';
import { useAuthStore } from '@/state/authStore';
import { useGardenStore } from '@/state/gardenStore';
import { usePrefs, type FarmingMode } from '@/state/prefsStore';
import { useLang, useT } from '@/i18n';
import { Drawer } from '@/components/ui/overlay';
import { EASE } from '@/components/ui/motion';
import { Skeleton } from '@/components/ui/primitives';
import { LanguageToggle, Logo, ThemeToggle } from './brand';
import { FarmSwitcher } from './FarmSwitcher';
import { GardenSwitcher } from './GardenSwitcher';
import { NAV_ADVISERS, NAV_PRIMARY, NAV_ROOFTOP, NAV_TOOLS, ENGINE_ICON, TRANSLATED_PATHS, modeOfPath, type NavItem } from './nav';
import { TourBar } from './TourBar';
import { preloadAppPages } from '@/lib/preload';

const AssistantPanel = lazy(() => import('@/features/assistant/AssistantPanel'));

function NavGroup({ title, items, onNavigate }: { title?: string; items: NavItem[]; onNavigate?: () => void }) {
  const t = useT();
  return (
    <div>
      {title && <p className="eyebrow mb-2 px-3">{title}</p>}
      <ul className="space-y-0.5">
        {items.map(({ to, key, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-ctl px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-surface text-ink shadow-soft' : 'text-ink-2 hover:bg-sunken hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent" aria-hidden />}
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2')} aria-hidden />
                  {t(key)}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Account() {
  const t = useT();
  const user = useAuthStore((s) => s.session?.user);
  const [leaving, setLeaving] = useState(false);
  if (!user) return null;
  const initials = user.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex items-center gap-2.5 rounded-ctl px-1">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-label font-bold text-accent" aria-hidden>
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
          {user.displayName}
          {user.isDemo && <span className="chip bg-accent-soft px-1.5 py-0 text-[0.625rem] text-accent">DEMO</span>}
        </p>
        <p className="truncate text-label text-ink-3">{user.identifier ?? 'Demo session'}</p>
      </div>
      <button
        type="button"
        className="btn-ghost shrink-0 p-2"
        disabled={leaving}
        onClick={() => {
          setLeaving(true);
          void useAuthStore.getState().signOut();
        }}
        aria-label={t('shell.logout')}
        title={t('shell.logout')}
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Field | Rooftop. Same shell and brand; the navigation and home change with the choice. */
function ModeSwitch({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const mode = usePrefs((s) => s.mode) ?? 'field';
  const setMode = usePrefs((s) => s.setMode);
  const navigate = useNavigate();
  const options: { id: FarmingMode; icon: typeof Tractor }[] = [
    { id: 'field', icon: Tractor },
    { id: 'rooftop', icon: HomeIcon },
  ];
  return (
    <div>
      <p className="eyebrow mb-2 px-1">{t('shell.mode')}</p>
      <div role="radiogroup" aria-label={t('shell.mode')} className="grid grid-cols-2 gap-1 rounded-ctl border border-line bg-sunken/60 p-1">
        {options.map(({ id, icon: Icon }) => {
          const on = mode === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (on) return;
                setMode(id);
                navigate(id === 'rooftop' ? '/app/garden' : '/app');
                onNavigate?.();
              }}
              className={cn('inline-flex items-center justify-center gap-1.5 rounded-[0.55rem] px-2 py-1.5 text-sm font-semibold transition-colors', on ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink-2')}
            >
              <Icon className={cn('h-4 w-4', on ? (id === 'rooftop' ? 'text-clay' : 'text-accent') : '')} aria-hidden />
              {t(id === 'field' ? 'shell.mode.field' : 'shell.mode.rooftop')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const mode = usePrefs((s) => s.mode) ?? 'field';
  const resetDemo = useFarmStore((s) => s.resetDemo);
  const resetGarden = useGardenStore((s) => s.resetDemo);
  const rooftop = mode === 'rooftop';
  return (
    <div className="flex h-full flex-col gap-7 px-4 py-6">
      <div className="space-y-4">
        <ModeSwitch onNavigate={onNavigate} />
        {rooftop ? <GardenSwitcher /> : <FarmSwitcher />}
      </div>
      <nav aria-label="Main" className="flex flex-col gap-7">
        {rooftop ? (
          <>
            <NavGroup items={NAV_ROOFTOP} onNavigate={onNavigate} />
            <NavGroup title={t('shell.advisers')} items={NAV_ADVISERS} onNavigate={onNavigate} />
          </>
        ) : (
          <>
            <NavGroup items={NAV_PRIMARY} onNavigate={onNavigate} />
            <NavGroup title={t('shell.tools')} items={NAV_TOOLS} onNavigate={onNavigate} />
          </>
        )}
      </nav>
      <div className="mt-auto space-y-3 border-t border-line pt-5">
        <div className="flex items-start gap-2.5 px-1 text-label text-ink-3" title={ENGINE.description}>
          <ENGINE_ICON className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {t('shell.demoData')}
            <br />
            {t('shell.noModel')}
          </span>
        </div>
        <button
          type="button"
          className="btn-ghost w-full justify-start px-1 text-label"
          onClick={() => {
            if (rooftop) {
              resetGarden();
              toast('Demo rooftop reset', 'Changes and done tasks for the demo rooftop were cleared.', 'info');
            } else {
              resetDemo();
              toast('Demo farm reset', 'Saved scans, notes and plans for the demo farm were cleared.', 'info');
            }
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t(rooftop ? 'shell.resetGarden' : 'shell.resetFarm')}
        </button>
        <div className="border-t border-line pt-4">
          <Account />
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const { navOpen, setNav, openAssistant } = useUiStore();
  const t = useT();
  const lang = useLang();
  const mode = usePrefs((s) => s.mode) ?? 'field';
  const setMode = usePrefs((s) => s.setMode);

  // Deep links carry their mode: opening /app/garden/… switches the shell to rooftop, and back.
  useEffect(() => {
    const m = modeOfPath(location.pathname);
    if (m && m !== mode) setMode(m);
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  // Download every page's code in the background once the app is idle, so no click waits on the network.
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => preloadAppPages(), { timeout: 3000 });
    else setTimeout(preloadAppPages, 1500);
  }, []);

  return (
    <FarmContextProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line/80 bg-bg lg:flex">
          <div className="px-6 pt-6">
            <Logo />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none">
            <SidebarBody />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/80 backdrop-blur-md">
            <div className="container-page flex h-16 items-center gap-3">
              <button type="button" className="btn-ghost -ml-2 p-2 lg:hidden" onClick={() => setNav(true)} aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </button>
              <Logo className="lg:hidden" wordmarkClassName="hidden min-[480px]:inline" />
              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                {/* The assistant reads the field context, so it is offered in field mode only. */}
                {mode === 'field' && (
                  <button type="button" className="btn-secondary py-2" onClick={() => openAssistant()}>
                    <Sparkles className="h-4 w-4 text-accent" aria-hidden />
                    <span className="hidden sm:inline">{t('shell.ask')}</span>
                    <span className="sm:hidden">{t('shell.askShort')}</span>
                  </button>
                )}
                <LanguageToggle />
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main id="main" className="container-page pb-32 pt-8 sm:pt-12">
            {/* Enter-only transition: the new page renders immediately (no waiting on the old page's
                exit animation), so a click can never be held up by a transition. */}
            <motion.div
              key={location.pathname}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {lang === 'hi' && !TRANSLATED_PATHS.has(location.pathname) && (
                <p className="mb-5 flex items-start gap-2 rounded-ctl bg-sunken/60 px-3.5 py-2.5 text-sm text-ink-2" lang="hi">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                  {t('common.englishOnly')}
                </p>
              )}
              {/* Untranslated pages are marked English so :lang(hi) typography and screen readers treat them correctly. */}
              <div lang={lang === 'hi' && !TRANSLATED_PATHS.has(location.pathname) ? 'en' : undefined}>
                <RouteErrorBoundary resetKey={location.pathname}>
                  <Suspense fallback={<PageSkeleton />}>
                    <Outlet />
                  </Suspense>
                </RouteErrorBoundary>
              </div>
            </motion.div>
          </main>
        </div>
      </div>

      <Drawer open={navOpen} onClose={() => setNav(false)} title={<Logo />} side="left">
        <SidebarBody onNavigate={() => setNav(false)} />
      </Drawer>

      <Suspense fallback={null}>
        <AssistantPanel />
      </Suspense>
      <TourBar />
    </FarmContextProvider>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Skeleton className="h-48 md:col-span-2" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

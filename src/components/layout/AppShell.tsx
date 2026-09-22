import { motion, useReducedMotion } from 'framer-motion';
import { Menu, RotateCcw, Sparkles } from 'lucide-react';
import { Suspense, useEffect } from 'react';
import { lazyPage as lazy } from '@/lib/lazyPage';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { NavLink, Outlet, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { FarmContextProvider } from '@/hooks/useFarmContext';
import { ENGINE } from '@/services';
import { useFarmStore } from '@/state/farmStore';
import { toast } from '@/state/toastStore';
import { useUiStore } from '@/state/uiStore';
import { Drawer } from '@/components/ui/overlay';
import { EASE } from '@/components/ui/motion';
import { Skeleton } from '@/components/ui/primitives';
import { Logo, ThemeToggle } from './brand';
import { FarmSwitcher } from './FarmSwitcher';
import { NAV_PRIMARY, NAV_TOOLS, ENGINE_ICON, type NavItem } from './nav';
import { TourBar } from './TourBar';
import { preloadAppPages } from '@/lib/preload';

const AssistantPanel = lazy(() => import('@/features/assistant/AssistantPanel'));

function NavGroup({ title, items, onNavigate }: { title?: string; items: NavItem[]; onNavigate?: () => void }) {
  return (
    <div>
      {title && <p className="eyebrow mb-2 px-3">{title}</p>}
      <ul className="space-y-0.5">
        {items.map(({ to, label, icon: Icon, end }) => (
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
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const resetDemo = useFarmStore((s) => s.resetDemo);
  return (
    <div className="flex h-full flex-col gap-7 px-4 py-6">
      <FarmSwitcher />
      <nav aria-label="Main" className="flex flex-col gap-7">
        <NavGroup items={NAV_PRIMARY} onNavigate={onNavigate} />
        <NavGroup title="Tools" items={NAV_TOOLS} onNavigate={onNavigate} />
      </nav>
      <div className="mt-auto space-y-3 border-t border-line pt-5">
        <div className="flex items-start gap-2.5 px-1 text-label text-ink-3" title={ENGINE.description}>
          <ENGINE_ICON className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Demo data · {ENGINE.name}
            <br />
            No trained model connected yet
          </span>
        </div>
        <button
          type="button"
          className="btn-ghost w-full justify-start px-1 text-label"
          onClick={() => {
            resetDemo();
            toast('Demo farm reset', 'Saved scans, notes and plans for the demo farm were cleared.', 'info');
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset demo farm
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const { navOpen, setNav, openAssistant } = useUiStore();

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
              <Logo className="lg:hidden" />
              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <button type="button" className="btn-secondary py-2" onClick={() => openAssistant()}>
                  <Sparkles className="h-4 w-4 text-accent" aria-hidden />
                  <span className="hidden sm:inline">Ask about this farm</span>
                  <span className="sm:hidden">Ask</span>
                </button>
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
              <RouteErrorBoundary resetKey={location.pathname}>
                <Suspense fallback={<PageSkeleton />}>
                  <Outlet />
                </Suspense>
              </RouteErrorBoundary>
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

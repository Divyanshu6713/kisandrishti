import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { TOUR_STEPS, useTourStore } from '@/state/tourStore';
import { EASE } from '@/components/ui/motion';

/** Floating guide for the 2–3 minute demo: where we are, what to show, next step. */
export function TourBar() {
  const { active, step, go, stop } = useTourStore();
  const navigate = useNavigate();
  const location = useLocation();
  const current = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  // Keep the step in sync if the presenter navigates with the sidebar.
  useEffect(() => {
    if (!active) return;
    if (location.pathname === current.path) return;
    // Jump to the matching step closest to where the presenter was.
    const matches = TOUR_STEPS.map((s, i) => (s.path === location.pathname ? i : -1)).filter((i) => i >= 0);
    if (matches.length) go(matches.reduce((best, i) => (Math.abs(i - step) < Math.abs(best - step) ? i : best)));
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (to: number) => {
    go(to);
    navigate(TOUR_STEPS[to].path);
  };

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-2xl sm:bottom-5"
          role="region"
          aria-label="Demo tour"
        >
          <div className="card flex items-center gap-3 p-2.5 pl-4 sm:gap-4">
            <div className="hidden shrink-0 sm:block" aria-hidden>
              <div className="flex gap-1">
                {TOUR_STEPS.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === step ? 'w-5 bg-accent' : i < step ? 'w-1.5 bg-accent/50' : 'w-1.5 bg-line'}`} />
                ))}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-label font-semibold text-accent">
                Demo · {step + 1}/{TOUR_STEPS.length} · {current.title}
              </p>
              <AnimatePresence mode="wait">
                <motion.p key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="truncate text-sm text-ink-2 sm:whitespace-normal">
                  {current.hint}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="btn-ghost p-2" onClick={() => move(step - 1)} disabled={step === 0} aria-label="Previous step">
                <ArrowLeft className="h-4 w-4" />
              </button>
              {last ? (
                <button type="button" className="btn-primary py-2" onClick={stop}>
                  <Check className="h-4 w-4" /> Finish
                </button>
              ) : (
                <button type="button" className="btn-primary py-2" onClick={() => move(step + 1)}>
                  Next <ArrowRight className="h-4 w-4" />
                </button>
              )}
              <button type="button" className="btn-ghost p-2" onClick={stop} aria-label="End demo tour">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

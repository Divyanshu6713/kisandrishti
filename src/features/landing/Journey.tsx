import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { EASE } from '@/components/ui/motion';
import { SceneFallback } from '@/three/SceneFallback';

const JourneyScene = lazy(() => import('@/three/JourneyScene'));

const STAGES = [
  { key: 'Understand', title: 'Understand the farm', body: 'Crop, variety, sowing date, soil type, irrigation and farming method — the context every decision depends on.', link: '/app/farms', linkLabel: 'My Farms' },
  { key: 'Analyze', title: 'Analyse conditions', body: 'Soil tests, field observations and weather are read together, layer by layer, against reference ranges.', link: '/app/soil', linkLabel: 'Soil Intelligence' },
  { key: 'Predict', title: 'Predict risks', body: 'Cool, humid days at a susceptible stage? The risk engine flags disease, pest and water stress before they show.', link: '/app/risk', linkLabel: 'Risk Intelligence' },
  { key: 'Recommend', title: 'Recommend actions', body: 'Short, prioritised advice — organic-first — with the observation, risk and reasoning behind every item.', link: '/app/advisor', linkLabel: 'Farm Advisor' },
  { key: 'Act', title: 'Act in the field', body: 'Scout the right patch, apply the right input, irrigate at the right time. Every action goes into the plan.', link: '/app/organic', linkLabel: 'Organic Farming' },
  { key: 'Improve', title: 'Improve every season', body: 'New observations and tests close the loop, so the farm — and the models — learn from what actually happened.', link: '/app/insights', linkLabel: 'Insights' },
];

export function Journey() {
  const [stage, setStage] = useState(0);
  const [near, setNear] = useState(false);
  const section = useRef<HTMLElement>(null);
  const steps = useRef<(HTMLDivElement | null)[]>([]);

  // Mount the WebGL scene only when the section approaches the viewport.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setStage(Number((e.target as HTMLElement).dataset.stage));
        });
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    steps.current.forEach((s) => s && io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <section ref={section} id="journey" className="relative scroll-mt-16" aria-labelledby="journey-title">
      <div className="container-page pt-24 sm:pt-32">
        <p className="eyebrow mb-3">How it works</p>
        <h2 id="journey-title" className="max-w-2xl text-h1 text-balance sm:text-[2.5rem] sm:leading-[1.1]">
          From a field to a decision, in six calm steps.
        </h2>
      </div>

      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        {/* scene: sticky on the right (desktop) / top (mobile) */}
        <div className="sticky top-16 z-10 order-first -mx-4 h-[42svh] bg-bg sm:-mx-6 lg:order-last lg:mx-0 lg:top-24 lg:h-[calc(100svh-8rem)] lg:bg-transparent">
          <div className="relative h-full overflow-hidden lg:rounded-card lg:border lg:border-line/70 lg:bg-sunken/30">
            {near ? (
              <Suspense fallback={<SceneFallback compact />}>
                <JourneyScene stage={stage} className="absolute inset-0" />
              </Suspense>
            ) : (
              <SceneFallback compact />
            )}
            <div className="pointer-events-none absolute left-4 top-4 flex gap-1.5" aria-hidden>
              {STAGES.map((s, i) => (
                <span key={s.key} className={cn('h-1 rounded-full transition-all duration-500', i === stage ? 'w-6 bg-accent' : 'w-2 bg-ink-3/30')} />
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.span
                key={stage}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-surface/90 px-3 py-1 text-label font-semibold text-ink-2 shadow-soft backdrop-blur"
              >
                {String(stage + 1).padStart(2, '0')} · {STAGES[stage].key}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <ol className="relative pb-[20vh] lg:pb-[30vh]">
          {STAGES.map((s, i) => (
            <li key={s.key}>
              <div ref={(el) => {
            steps.current[i] = el;
          }} data-stage={i} className="flex min-h-[62svh] flex-col justify-center py-10 lg:min-h-[78svh]">
                <motion.div animate={{ opacity: stage === i ? 1 : 0.35 }} transition={{ duration: 0.5, ease: EASE }}>
                  <p className="tabular mb-3 text-label font-semibold tracking-[0.14em] text-accent">
                    {String(i + 1).padStart(2, '0')} — {s.key.toUpperCase()}
                  </p>
                  <h3 className="text-h1 text-balance">{s.title}</h3>
                  <p className="mt-3 max-w-md text-lead text-ink-2 text-pretty">{s.body}</p>
                  <Link to={s.link} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
                    In the app: {s.linkLabel} <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                </motion.div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

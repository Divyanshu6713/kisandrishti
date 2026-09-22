import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { lazy, Suspense, useRef } from 'react';
import { BRAND } from '@/components/layout/brand';
import { EASE } from '@/components/ui/motion';
import { SceneFallback } from '@/three/SceneFallback';

const HeroScene = lazy(() => import('@/three/HeroScene'));

export function Hero({ onEnter }: { onEnter: () => void }) {
  const section = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const item = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, ease: EASE, delay },
  });

  return (
    <section ref={section} className="relative isolate h-[100svh] min-h-[640px] overflow-hidden" aria-labelledby="hero-title">
      <Suspense fallback={<SceneFallback />}>
        <HeroScene eventSource={section} className="absolute inset-0 -z-10" />
      </Suspense>
      {/* readability wash: left on desktop, top on mobile — keeps 3D from competing with the copy */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-bg via-bg/70 to-transparent md:bg-gradient-to-r md:from-bg md:via-bg/75 md:to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-bg to-transparent" aria-hidden />

      <div className="container-page pointer-events-none flex h-full flex-col justify-start pt-28 md:justify-center md:pt-0">
        <div className="max-w-xl">
          <motion.p {...item(0.1)} className="eyebrow mb-5 inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Farm intelligence · organic-first
          </motion.p>
          <motion.h1 {...item(0.2)} id="hero-title" className="text-display font-bold">
            {BRAND.name}
          </motion.h1>
          <motion.p {...item(0.3)} className="mt-4 text-h2 font-medium text-ink-2">
            {BRAND.tagline}
          </motion.p>
          <motion.p {...item(0.4)} className="mt-5 max-w-md text-lead text-ink-2 text-pretty">
            Understand your soil, crop and weather in one place — and get clear, explainable advice you can act on today.
          </motion.p>
          <motion.div {...item(0.5)} className="pointer-events-auto mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onEnter} className="btn-primary btn-lg">
              Enter the demo farm <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <a href="#journey" className="btn-secondary btn-lg">
              See how it works
            </a>
          </motion.div>
          <motion.p {...item(0.7)} className="mt-6 text-label text-ink-3">
            Working prototype · sample farm data · rule-based engine, ready for our trained models
          </motion.p>
        </div>
      </div>

      <motion.a
        href="#journey"
        aria-label="Scroll to how it works"
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-label text-ink-3 md:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
      >
        <ArrowDown className="h-4 w-4 animate-bounce" aria-hidden /> Move your cursor over the field
      </motion.a>
    </section>
  );
}

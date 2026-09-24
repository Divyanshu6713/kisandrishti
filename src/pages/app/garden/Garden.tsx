import { motion } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { useGarden } from '@/hooks/useGarden';
import { rise, stagger } from '@/components/ui/motion';
import { SourceTags } from '@/components/ui/provenance';
import { LiveWeatherCard } from '@/features/weather/LiveWeather';
import { AdviserCards, GardenNotes, GardenScenarioNote, RoofToPlate, TodaysGarden } from '@/features/garden/parts';
import { CONTAINER_LABEL } from '@/services/gardenService';
import { RooftopFallback } from '@/three/RooftopFallback';

const RooftopScene = lazy(() => import('@/three/RooftopScene'));

/**
 * Rooftop home. Discovery-first: the 3D terrace anchors the page, today's garden sits beside it,
 * the three advisers follow, then the roof-to-plate progress and sourced notes.
 * Same cards, type and tokens as the field overview — richer, not different.
 */
export default function Garden() {
  const g = useGarden();
  const { garden } = g;
  return (
    <>
      <GardenScenarioNote g={g} />
      <header className="mb-8 flex flex-col gap-2 sm:mb-10">
        <p className="eyebrow">Rooftop garden</p>
        <h1 className="text-h1">{garden.name}</h1>
        <p className="text-lead text-ink-2">
          {garden.areaSqFt} sq ft{garden.location ? ` · ${garden.location}` : ''} · {garden.sunHours} h of sun · {CONTAINER_LABEL[garden.containers].toLowerCase()}
        </p>
      </header>

      <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-5 lg:grid-cols-12">
        <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-5">
          <motion.section variants={rise} className="card relative order-1 overflow-hidden lg:order-none">
            <div className="relative h-[280px] sm:h-[360px] lg:h-[400px]">
              <Suspense fallback={<RooftopFallback />}>
                <RooftopScene className="absolute inset-0" statuses={g.statuses} />
              </Suspense>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-5 py-3 text-label text-ink-3">
              <span>Illustrative rooftop · pots drawn from your garden (up to 6 per plant) · point at a task to find its pots</span>
              <Link to="/app/garden/setup" className="font-semibold text-accent hover:underline">
                Plants &amp; dates
              </Link>
            </div>
          </motion.section>
          <div className="order-3 lg:order-none">
            <AdviserCards g={g} />
          </div>
          <div className="order-5 lg:order-none">
            <RoofToPlate g={g} />
          </div>
        </div>
        <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-5">
          <TodaysGarden g={g} className="order-2 lg:order-none lg:flex-1" />
          <div className="order-4 lg:order-none">
            <LiveWeatherCard />
          </div>
        </div>
      </motion.div>

      <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }} className="mt-10">
        <GardenNotes g={g} />
      </motion.div>

      <div className="mt-8">
        <SourceTags sources={garden.isDemo ? ['demo-dataset', 'growing-guide', 'live-weather', 'demo-rules'] : ['user-input', 'growing-guide', 'live-weather', 'demo-rules']} />
      </div>
    </>
  );
}

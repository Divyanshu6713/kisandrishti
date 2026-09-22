import { motion, useReducedMotion } from 'framer-motion';
import type { CropInfo, GrowthStatus } from '@/models';
import { cn } from '@/lib/utils';
import { EASE } from '@/components/ui/motion';

/** Season bar: stages sized by duration, irrigation-critical stages marked, today's position animated in. */
export function GrowthTimeline({ crop, growth }: { crop: CropInfo; growth: GrowthStatus }) {
  const reduce = useReducedMotion();
  const total = crop.stages[crop.stages.length - 1].toDay;
  const pos = Math.min(1, Math.max(0, growth.daysAfterSowing / total));
  return (
    <div>
      <div className="relative">
        <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full">
          {crop.stages.map((s) => {
            const current = growth.stage?.id === s.id;
            const past = growth.daysAfterSowing >= s.toDay;
            return (
              <div
                key={s.id}
                title={`${s.name}: day ${s.fromDay}–${s.toDay}${s.waterCritical ? ' · irrigation-critical' : ''}`}
                style={{ width: `${((s.toDay - s.fromDay) / total) * 100}%` }}
                className={cn('h-full', current ? 'bg-accent' : past ? 'bg-accent/40' : 'bg-sunken')}
              />
            );
          })}
        </div>
        <motion.div
          className="absolute -top-1.5 w-0.5 -translate-x-1/2"
          initial={{ left: reduce ? `${pos * 100}%` : '0%' }}
          whileInView={{ left: `${pos * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: EASE }}
        >
          <span className="block h-[22px] w-0.5 rounded-full bg-ink" />
        </motion.div>
      </div>
      <div className="mt-3 flex justify-between text-label text-ink-3">
        <span>Sown · day 0</span>
        <span className="font-semibold text-ink">Today · day {growth.daysAfterSowing}</span>
        <span>Harvest · ~day {total}</span>
      </div>
      <ol className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {crop.stages.map((s) => {
          const current = growth.stage?.id === s.id;
          return (
            <li key={s.id} className={cn('flex items-center gap-2', current ? 'font-semibold text-ink' : 'text-ink-3')}>
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', current ? 'bg-accent' : s.waterCritical ? 'bg-info/60' : 'bg-line')} aria-hidden />
              <span className="truncate">{s.name}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-label text-ink-3">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-info/60 align-middle" aria-hidden /> irrigation-critical stage · day ranges are approximate
      </p>
    </div>
  );
}

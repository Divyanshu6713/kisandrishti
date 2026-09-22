import { motion } from 'framer-motion';
import { Cloud, CloudFog, CloudRain, CloudSun, Droplets, Sun, Wind } from 'lucide-react';
import type { WeatherDay } from '@/models';
import { cn, formatShortDate, formatWeekday } from '@/lib/utils';
import type { FarmContext } from '@/services';
import { ScenarioNote, WithFarm } from '@/components/farm/WithFarm';
import { Counter, Reveal, rise, stagger } from '@/components/ui/motion';
import { InsufficientData, LevelBadge, PageHeader, Pill } from '@/components/ui/primitives';
import { WhyThis } from '@/components/ui/provenance';

const ICON: Record<WeatherDay['condition'], typeof Sun> = { sunny: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog, rain: CloudRain };
const LABEL: Record<WeatherDay['condition'], string> = { sunny: 'Sunny', partly: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Foggy', rain: 'Light rain' };

function Forecast({ days }: { days: WeatherDay[] }) {
  const min = Math.min(...days.map((d) => d.tMin));
  const max = Math.max(...days.map((d) => d.tMax));
  return (
    <motion.ol variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid grid-cols-7 gap-1 sm:gap-2">
      {days.map((d, i) => {
        const Icon = ICON[d.condition];
        const lo = ((d.tMin - min) / (max - min || 1)) * 100;
        const hi = ((d.tMax - min) / (max - min || 1)) * 100;
        return (
          <motion.li key={d.date} variants={rise} className={cn('flex flex-col items-center rounded-ctl px-1 py-3 text-center', i === 0 && 'bg-sunken/70')}>
            <span className="text-label font-semibold text-ink-2">{i === 0 ? 'Today' : formatWeekday(d.date)}</span>
            <Icon className="my-3 h-5 w-5 text-ink-2" aria-label={LABEL[d.condition]} />
            <span className="tabular text-sm font-semibold">{d.tMax}°</span>
            <div className="relative my-2 h-16 w-1.5 rounded-full bg-sunken" aria-hidden>
              <motion.span
                className="absolute inset-x-0 rounded-full bg-gradient-to-t from-info to-warn"
                initial={{ height: 0, bottom: `${lo}%` }}
                whileInView={{ height: `${hi - lo}%`, bottom: `${lo}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: i * 0.05 }}
              />
            </div>
            <span className="tabular text-sm text-ink-3">{d.tMin}°</span>
            <span className={cn('tabular mt-2 text-label', d.rainMm > 0 ? 'font-semibold text-info' : 'text-ink-3')}>{d.rainMm > 0 ? `${d.rainMm} mm` : '—'}</span>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

function WeatherBody({ ctx }: { ctx: FarmContext }) {
  const w = ctx.weather;
  if (!w)
    return (
      <>
        <PageHeader eyebrow="Weather" title="Weather & what it means" />
        <InsufficientData missing={['Weather forecast']} message="No weather data is available for this farm." />
      </>
    );
  const Icon = ICON[w.current.condition];
  return (
    <>
      <ScenarioNote ctx={ctx} />
      <PageHeader eyebrow="Weather" title="Weather & what it means" description="Not just the forecast — what it means for this crop at this stage." />

      <div className="grid gap-5 lg:grid-cols-12">
        <Reveal className="card card-pad lg:col-span-4">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Now · {w.location}</p>
            <Pill tone="warn">Sample</Pill>
          </div>
          <div className="mt-6 flex items-center gap-4">
            <Icon className="h-12 w-12 text-warn" aria-hidden />
            <p className="tabular text-[3.25rem] font-semibold leading-none tracking-tight">
              <Counter value={w.current.tempC} />°
            </p>
          </div>
          <p className="mt-2 text-ink-2">{LABEL[w.current.condition]}</p>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line/70 pt-5 text-sm">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-info" aria-hidden />
              <dt className="sr-only">Humidity</dt>
              <dd>{w.current.humidity}% humidity</dd>
            </div>
            <div className="flex items-center gap-2">
              <Wind className="h-4 w-4 text-ink-3" aria-hidden />
              <dt className="sr-only">Wind</dt>
              <dd>{w.current.windKmh} km/h wind</dd>
            </div>
          </dl>
          <p className="mt-5 text-label text-ink-3">{w.sourceNote}</p>
        </Reveal>
        <Reveal className="card card-pad lg:col-span-8" delay={0.05}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-h3">Next 7 days</h2>
            <span className="text-sm text-ink-3">
              {formatShortDate(w.days[0].date)} – {formatShortDate(w.days[w.days.length - 1].date)}
            </span>
          </div>
          <Forecast days={w.days} />
        </Reveal>
      </div>

      <section className="mt-10" aria-labelledby="implications">
        <h2 id="implications" className="text-h2">
          What it means for your {ctx.crop.name.toLowerCase()}
        </h2>
        <p className="mb-5 text-sm text-ink-3">Weather + crop stage + risk engine · relationships will come from our dataset/model</p>
        <motion.ul variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid gap-4 md:grid-cols-2">
          {ctx.implications.map((i) => (
            <motion.li key={i.id} variants={rise} className="card card-pad card-hover">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-pretty">{i.title}</h3>
                <LevelBadge level={i.level} />
              </div>
              <p className="mt-2 text-sm text-ink-2">{i.detail}</p>
              <div className="mt-4">
                <WhyThis basis={i.basis} label="Based on" />
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </section>
    </>
  );
}

export default function Weather() {
  return <WithFarm>{(ctx) => <WeatherBody ctx={ctx} />}</WithFarm>;
}

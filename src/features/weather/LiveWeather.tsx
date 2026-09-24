import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, ChevronDown, Droplets, MapPin, RefreshCw, Sunrise, Sunset, Thermometer, Umbrella, Wind } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { FarmerInsight, LiveDay, LiveWeather } from '@/models';
import { cn, formatShortDate, formatWeekday } from '@/lib/utils';
import { EASE, rise, stagger } from '@/components/ui/motion';
import { Disclosure, LevelBadge, Skeleton } from '@/components/ui/primitives';
import { SourceTags } from '@/components/ui/provenance';
import { buildInsights, compass, describeCode } from '@/services/liveWeather';
import { useLiveWeather } from '@/state/liveWeatherStore';
import { WeatherIcon } from './WeatherIcon';
import { GeoNotice, LocationSearch } from './LocationSearch';

// ---------- formatting (all values come straight from the API response) ----------
const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
/** Browser-local time the response arrived. */
export const updatedAt = (ms: number) => clock.format(ms).toUpperCase();
/** "2026-09-24T06:11" is already location-local — format without timezone conversion. */
function localHm(iso: string) {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '—';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
const r = (v: number) => Math.round(v);
const mm = (v: number) => `${Math.round(v * 10) / 10} mm`;

// ---------- state helpers ----------
/** Loads weather for the chosen place once per place (the store dedupes and caches). */
export function useLiveWeatherAutoload() {
  const key = useLiveWeather((s) => s.place.key);
  const load = useLiveWeather((s) => s.load);
  useEffect(() => {
    void load();
  }, [key, load]);
}

function useView() {
  const place = useLiveWeather((s) => s.place);
  const data = useLiveWeather((s) => s.data);
  const status = useLiveWeather((s) => s.status);
  const error = useLiveWeather((s) => s.error);
  const w = data?.placeKey === place.key ? data : null;
  return { place, w, status, error, stale: Boolean(w && status === 'error') };
}

function LiveStatus({ status, stale, hasData }: { status: string; stale: boolean; hasData: boolean }) {
  if (stale || (status === 'error' && !hasData))
    return (
      <span className="chip bg-warn-soft text-warn">
        <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
        {hasData ? 'Not current' : 'Unavailable'}
      </span>
    );
  if (status === 'loading')
    return (
      <span className="chip bg-sunken text-ink-3">
        <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
        Updating
      </span>
    );
  return (
    <span className="chip bg-accent-soft text-accent">
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
      Live
    </span>
  );
}

/** "Weather data: Open-Meteo · Updated 11:42 PM" — shown on every live weather block. */
function SourceLine({ w, stale, onRefresh, busy }: { w: LiveWeather | null; stale: boolean; onRefresh?: () => void; busy?: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ink-3">
      <span>
        Weather data:{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-2 hover:underline">
          Open-Meteo
        </a>
      </span>
      {w && <span className={cn(stale && 'font-semibold text-warn')}>{stale ? `Last available update: ${updatedAt(w.fetchedAt)}` : `Updated: ${updatedAt(w.fetchedAt)}`}</span>}
      {onRefresh && (
        <button type="button" onClick={onRefresh} disabled={busy} className="inline-flex items-center gap-1 rounded font-semibold text-accent hover:underline disabled:opacity-50">
          <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} aria-hidden /> Refresh
        </button>
      )}
    </p>
  );
}

function Failure({ message, onRetry, compact }: { message: string | null; onRetry: () => void; compact?: boolean }) {
  return (
    <div className={cn('flex items-start gap-3', !compact && 'card card-pad')} role="alert">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
      <div>
        <p className="font-semibold">Live weather unavailable</p>
        <p className="text-sm text-ink-2">
          {message ?? 'Unable to fetch live weather. Please try again.'} Please retry or select another location.
        </p>
        <button type="button" className="btn-secondary mt-4" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Retry
        </button>
      </div>
    </div>
  );
}

// ---------- blocks ----------
function CurrentCard({ w, placeName, status, stale }: { w: LiveWeather; placeName: string; status: string; stale: boolean }) {
  const c = w.current;
  const today = w.days[0];
  const rows = [
    { icon: Thermometer, label: 'Feels like', value: `${r(c.feelsLikeC)}°C` },
    { icon: Droplets, label: 'Humidity', value: `${r(c.humidity)}%` },
    { icon: Wind, label: 'Wind', value: `${r(c.windKmh)} km/h ${compass(c.windDirDeg)}` },
    { icon: Umbrella, label: 'Rain now', value: mm(c.precipMm) },
    { icon: Sunrise, label: 'Sunrise', value: localHm(today.sunrise) },
    { icon: Sunset, label: 'Sunset', value: localHm(today.sunset) },
  ];
  return (
    <div className="card card-pad flex flex-col lg:col-span-4">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow truncate">Now · {placeName}</p>
        <LiveStatus status={status} stale={stale} hasData />
      </div>
      <div className="mt-6 flex items-center gap-4">
        <WeatherIcon code={c.code} isDay={c.isDay} className="h-12 w-12 shrink-0 text-warn" />
        <p className="tabular text-[3.25rem] font-semibold leading-none tracking-tight">{r(c.tempC)}°</p>
      </div>
      <p className="mt-2 text-ink-2">
        {describeCode(c.code).label}
        <span className="text-ink-3"> · {today.precipProb === null ? 'rain chance n/a' : `${today.precipProb}% rain chance today`}</span>
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line/70 pt-5 text-sm">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
            <dt className="text-ink-3">{label}</dt>
            <dd className="ml-auto tabular font-semibold text-ink sm:ml-0">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ForecastCard({ days, today }: { days: LiveDay[]; today: string }) {
  const min = Math.min(...days.map((d) => d.tMin));
  const max = Math.max(...days.map((d) => d.tMax));
  return (
    <div className="card card-pad lg:col-span-8">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-h3">Next {days.length} days</h3>
        <span className="text-sm text-ink-3">
          {formatShortDate(days[0].date)} – {formatShortDate(days[days.length - 1].date)}
        </span>
      </div>
      <motion.ol variants={stagger} initial="hidden" animate="show" className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((d, i) => {
          const lo = ((d.tMin - min) / (max - min || 1)) * 100;
          const hi = ((d.tMax - min) / (max - min || 1)) * 100;
          const wet = (d.precipProb ?? 0) >= 50;
          return (
            <motion.li key={d.date} variants={rise} className={cn('flex flex-col items-center rounded-ctl px-0.5 py-3 text-center', d.date === today && 'bg-sunken/70')}>
              <span className="text-label font-semibold text-ink-2">{d.date === today ? 'Today' : formatWeekday(d.date)}</span>
              <WeatherIcon code={d.code} className="my-3 h-5 w-5 text-ink-2" />
              <span className="tabular text-sm font-semibold">{r(d.tMax)}°</span>
              <div className="relative my-2 h-16 w-1.5 rounded-full bg-sunken" aria-hidden>
                <motion.span
                  className="absolute inset-x-0 rounded-full bg-gradient-to-t from-info to-warn"
                  initial={{ height: 0, bottom: `${lo}%` }}
                  animate={{ height: `${Math.max(4, hi - lo)}%`, bottom: `${lo}%` }}
                  transition={{ duration: 0.8, ease: EASE, delay: i * 0.04 }}
                />
              </div>
              <span className="tabular text-sm text-ink-3">{r(d.tMin)}°</span>
              <span className={cn('tabular mt-2 inline-flex items-center gap-0.5 text-label', wet ? 'font-semibold text-info' : 'text-ink-3')} title="Maximum rain probability">
                <Umbrella className="hidden h-3 w-3 sm:block" aria-hidden />
                {d.precipProb === null ? '—' : `${d.precipProb}%`}
              </span>
              <span className="tabular hidden text-label text-ink-3 sm:block">{d.precipMm > 0 ? mm(d.precipMm) : '0 mm'}</span>
            </motion.li>
          );
        })}
      </motion.ol>
      <p className="mt-4 text-label text-ink-3">Max / min temperature · % = highest chance of rain that day · mm = forecast rain total</p>
    </div>
  );
}

function InsightCard({ i }: { i: FarmerInsight }) {
  return (
    <motion.li variants={rise} className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-pretty">{i.title}</h3>
        <LevelBadge level={i.level} />
      </div>
      <p className="mt-2 text-sm text-ink-2">{i.detail}</p>
      <Disclosure summary="Rule and values used" className="mt-4 border-t border-line/70 pt-3">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {i.factors.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-ink-3">{f.label}</dt>
              <dd className="tabular text-ink-2">{f.value}</dd>
            </div>
          ))}
          <dt className="text-ink-3">Rule</dt>
          <dd className="text-ink-2">{i.rule}</dd>
        </dl>
        <SourceTags sources={['live-weather', 'demo-rules']} className="mt-3" />
      </Disclosure>
    </motion.li>
  );
}

function PlaceHeading() {
  const place = useLiveWeather((s) => s.place);
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <MapPin className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">
          {place.name}
          <span className="font-normal text-ink-3"> · {place.region}</span>
        </p>
        {place.note && <p className="truncate text-label text-ink-3">{place.note}</p>}
      </div>
    </div>
  );
}

function LiveSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-12" aria-busy="true" aria-label="Loading live weather">
      <Skeleton className="h-[21rem] lg:col-span-4" />
      <Skeleton className="h-[21rem] lg:col-span-8" />
    </div>
  );
}

/** Full live weather section for the Weather page. */
export function LiveWeatherSection() {
  useLiveWeatherAutoload();
  const { place, w, status, error, stale } = useView();
  const load = useLiveWeather((s) => s.load);
  const insights = useMemo(() => (w ? buildInsights(w) : []), [w]);
  const today = w?.current.time.slice(0, 10) ?? '';
  const refresh = () => void load({ force: true });

  return (
    <section aria-labelledby="live-weather" className="space-y-5">
      <div className="card card-pad">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p id="live-weather" className="eyebrow mb-2">
              Weather data · live
            </p>
            <PlaceHeading />
          </div>
          <LocationSearch className="w-full lg:max-w-xl" />
        </div>
        <GeoNotice />
      </div>

      {stale && w && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-warn/30 bg-warn-soft/60 px-5 py-3 text-sm" role="alert">
          <span className="flex items-center gap-2 text-ink">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warn" aria-hidden />
            Live weather unavailable. Showing the last available update from {updatedAt(w.fetchedAt)} — it is not current.
          </span>
          <button type="button" className="btn-secondary py-1.5" onClick={refresh}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Retry
          </button>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={w ? `w-${place.key}` : `s-${status}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {w ? (
            <div className="grid gap-5 lg:grid-cols-12">
              <CurrentCard w={w} placeName={place.name} status={status} stale={stale} />
              <ForecastCard days={w.days} today={today} />
            </div>
          ) : status === 'error' ? (
            <Failure message={error} onRetry={refresh} />
          ) : (
            <LiveSkeleton />
          )}
        </motion.div>
      </AnimatePresence>

      <SourceLine w={w} stale={stale} onRefresh={refresh} busy={status === 'loading'} />

      {w && (
        <div className="pt-5" aria-labelledby="farmer-insights">
          <p className="eyebrow mb-2">Rule-based farmer insight</p>
          <h2 id="farmer-insights" className="text-h2">
            What this weather means on the farm
          </h2>
          <p className="mb-5 text-sm text-ink-3">Simple rules over the live values above — informational only, not guaranteed agricultural advice.</p>
          <motion.ul key={`${w.placeKey}-${w.fetchedAt}`} variants={stagger} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2">
            {insights.map((i) => (
              <InsightCard key={i.id} i={i} />
            ))}
          </motion.ul>
        </div>
      )}
    </section>
  );
}

/** Compact live weather card for the Overview dashboard, with an inline location picker. */
export function LiveWeatherCard() {
  useLiveWeatherAutoload();
  const { place, w, status, error, stale } = useView();
  const load = useLiveWeather((s) => s.load);
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const top = useMemo(() => (w ? buildInsights(w)[0] : null), [w]);
  const close = useCallback(() => setPicking(false), []);

  useEffect(() => {
    if (!picking) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setPicking(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [picking]);

  return (
    <motion.section variants={rise} className="card card-pad" aria-label="Live weather">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Live weather</p>
        <LiveStatus status={status} stale={stale} hasData={Boolean(w)} />
      </div>

      <div ref={ref} className="relative mt-3">
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-expanded={picking}
          className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-ctl px-2 py-1.5 text-left transition-colors hover:bg-sunken/70"
        >
          <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold text-ink">{place.name}</span>
            <span className="text-ink-3"> · {place.source === 'default' ? 'default demo location' : place.region}</span>
          </span>
          <span className="shrink-0 text-label font-semibold text-accent">Change</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-3 transition-transform', picking && 'rotate-180')} aria-hidden />
        </button>
        <AnimatePresence>
          {picking && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="absolute inset-x-0 top-full z-30 mt-2 rounded-card border border-line bg-surface p-3 shadow-lift sm:-inset-x-2"
            >
              <LocationSearch autoFocus onPicked={close} />
              <GeoNotice />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 min-h-[5.5rem]">
        {w ? (
          <div className="flex items-center gap-4">
            <WeatherIcon code={w.current.code} isDay={w.current.isDay} className="h-10 w-10 shrink-0 text-warn" />
            <div className="min-w-0">
              <p className="tabular text-h1 font-semibold leading-none">
                {r(w.current.tempC)}°<span className="ml-2 text-sm font-medium text-ink-2">{describeCode(w.current.code).label}</span>
              </p>
              <p className="mt-1.5 text-sm text-ink-2">
                Feels {r(w.current.feelsLikeC)}° · {r(w.current.humidity)}% humidity · {w.days[0].precipProb ?? '—'}% rain today
              </p>
            </div>
          </div>
        ) : status === 'error' ? (
          <Failure message={error} onRetry={() => void load({ force: true })} compact />
        ) : (
          <div className="flex items-center gap-4" aria-busy="true" aria-label="Loading live weather">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-4 w-48 max-w-full" />
            </div>
          </div>
        )}
      </div>

      {top && (
        <div className="mt-4 rounded-ctl bg-sunken/70 p-3.5">
          <p className="eyebrow mb-1">Rule-based insight</p>
          <p className="text-sm text-ink">{top.title}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3">
        <SourceLine w={w} stale={stale} />
        <Link to="/app/weather" className="inline-flex items-center gap-1 text-label font-semibold text-accent hover:underline">
          7-day forecast <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </motion.section>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { GeoPlace } from '@/models';
import { cn } from '@/lib/utils';
import { EASE } from '@/components/ui/motion';
import { isAbort, liveWeatherService, MIN_QUERY, sanitizeQuery } from '@/services/liveWeather';
import { useLiveWeather } from '@/state/liveWeatherStore';

const DEBOUNCE_MS = 350;

type SearchState = { status: 'idle' | 'loading' | 'done' | 'error'; results: GeoPlace[] };

export const GEO_MESSAGES = {
  denied: 'Location access was not granted. Search your village, town, district or PIN code instead.',
  unavailable: 'Location access is unavailable. Search manually.',
} as const;

/**
 * "Use my location" + a debounced, cancellable search box over Indian places.
 * Keyboard: ↑/↓ to move, Enter to pick, Esc to close.
 */
export function LocationSearch({ autoFocus, onPicked, className }: { autoFocus?: boolean; onPicked?: () => void; className?: string }) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [search, setSearch] = useState<SearchState>({ status: 'idle', results: [] });
  const [retry, setRetry] = useState(0);
  const geo = useLiveWeather((s) => s.geo);
  const locate = useLiveWeather((s) => s.locate);
  const setPlace = useLiveWeather((s) => s.setPlace);
  const placeKey = useLiveWeather((s) => s.place.key);

  const clean = sanitizeQuery(q);

  // Debounced search; each new query cancels the previous request.
  useEffect(() => {
    if (clean.length < MIN_QUERY) {
      setSearch({ status: 'idle', results: [] });
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setSearch((s) => ({ status: 'loading', results: s.results }));
      liveWeatherService
        .search(clean, ctrl.signal)
        .then((results) => {
          setSearch({ status: 'done', results });
          setActive(results.length ? 0 : -1);
        })
        .catch((e) => !isAbort(e) && setSearch({ status: 'error', results: [] }));
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [clean, retry]);

  // A successful "Use my location" changes the place — close the caller's popover.
  const lastKey = useRef(placeKey);
  useEffect(() => {
    if (placeKey === lastKey.current) return;
    lastKey.current = placeKey;
    onPicked?.();
  }, [placeKey, onPicked]);

  const pick = (p: GeoPlace) => {
    setPlace(p);
    setQ('');
    setOpen(false);
    onPicked?.();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = search.results.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      setActive((a) => (a - 1 + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = search.results[active];
      if (p) pick(p);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && clean.length >= MIN_QUERY && search.status !== 'idle';

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row', className)}>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Search a village, town, district or PIN code in India"
          placeholder="Search village, town, district or PIN"
          className="field pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden"
          value={q}
          maxLength={60}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
        />
        {search.status === 'loading' ? (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-3" aria-label="Searching" />
        ) : (
          q && (
            <button
              type="button"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-ink"
              onClick={() => {
                setQ('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )
        )}

        <AnimatePresence>
          {showList && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-ctl border border-line bg-surface shadow-lift"
            >
              {search.status === 'error' ? (
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-ink-2" role="alert">
                  Place search is unavailable right now.
                  <button type="button" className="btn-ghost px-2 py-1 text-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => setRetry((r) => r + 1)}>
                    Retry
                  </button>
                </div>
              ) : search.results.length === 0 && search.status === 'done' ? (
                <p className="px-4 py-3 text-sm text-ink-2" role="status">
                  No matching location found.
                </p>
              ) : (
                <ul id={listId} role="listbox" aria-label="Matching places" className="max-h-72 overflow-y-auto py-1">
                  {search.results.map((p, i) => (
                    <li
                      key={`${p.key}-${i}`}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(p)}
                      className={cn('flex cursor-pointer items-start gap-3 px-4 py-2.5', i === active && 'bg-sunken/80')}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                        <span className="block truncate text-label text-ink-3">{p.source === 'pin' ? p.note : `${p.region} · India`}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button type="button" className="btn-secondary shrink-0" onClick={locate} disabled={geo === 'locating'}>
        {geo === 'locating' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4 text-accent" aria-hidden />}
        {geo === 'locating' ? 'Locating…' : 'Use my location'}
      </button>
    </div>
  );
}

/** Quiet line under the search when device location could not be used. */
export function GeoNotice() {
  const geo = useLiveWeather((s) => s.geo);
  if (geo !== 'denied' && geo !== 'unavailable') return null;
  return (
    <p className="mt-2 text-sm text-warn" role="status">
      {GEO_MESSAGES[geo]}
    </p>
  );
}

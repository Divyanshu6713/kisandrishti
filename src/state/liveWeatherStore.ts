import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { GeoPlace, LiveWeather } from '@/models';
import { DEFAULT_PLACE, FRESH_MS, isAbort, liveWeatherService, weatherErrorMessage } from '@/services/liveWeather';

/**
 * Live weather state, separate from the farm context, so changing the location only
 * re-renders weather components — never the whole dashboard.
 * Persisted: the chosen place and the last successful response (shown as "last available"
 * if a later request fails). Cleared on logout.
 */
export type GeoStatus = 'idle' | 'locating' | 'denied' | 'unavailable';

interface LiveWeatherState {
  place: GeoPlace;
  /** Last successful response. `data.placeKey` says which place it belongs to. */
  data: LiveWeather | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  geo: GeoStatus;

  load: (opts?: { force?: boolean }) => Promise<void>;
  setPlace: (place: GeoPlace) => void;
  locate: () => void;
  reset: () => void;
}

let ctrl: AbortController | null = null;
let seq = 0;

export const useLiveWeather = create<LiveWeatherState>()(
  persist(
    (set, get) => ({
      place: DEFAULT_PLACE,
      data: null,
      status: 'idle',
      error: null,
      geo: 'idle',

      async load({ force = false } = {}) {
        const { place, data, status } = get();
        const fresh = data?.placeKey === place.key && Date.now() - data.fetchedAt < FRESH_MS;
        if (!force && fresh) {
          if (status !== 'ready') set({ status: 'ready', error: null });
          return;
        }
        if (!force && status === 'loading') return; // a request for this place is already running
        ctrl?.abort();
        ctrl = new AbortController();
        const mine = ++seq;
        set({ status: 'loading', error: null });
        try {
          const w = await liveWeatherService.forecast(place, { force, signal: ctrl.signal });
          if (mine !== seq) return;
          set({ data: w, status: 'ready', error: null });
        } catch (e) {
          if (mine !== seq || isAbort(e)) return;
          set({ status: 'error', error: weatherErrorMessage(e) });
        }
      },

      setPlace(place) {
        if (place.key === get().place.key && place.source === get().place.source) {
          set({ place }); // same spot, maybe a better name
          return;
        }
        set({ place, status: 'idle' });
        void get().load();
      },

      locate() {
        if (!('geolocation' in navigator) || !window.isSecureContext) {
          set({ geo: 'unavailable' });
          return;
        }
        if (get().geo === 'locating') return;
        set({ geo: 'locating' });
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const place = liveWeatherService.devicePlace(pos.coords.latitude, pos.coords.longitude);
            set({ geo: 'idle' });
            get().setPlace(place);
            // Name the place in the background; weather does not wait for it.
            void liveWeatherService.reverseLocality(place.lat, place.lon).then((loc) => {
              if (loc && get().place.key === place.key && get().place.source === 'device') {
                set({ place: { ...place, name: loc.name, region: loc.region, note: 'Your current location (approx. 1 km)' } });
              }
            });
          },
          (err) => set({ geo: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
          // Re-use a recent fix instead of asking the device again.
          { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60_000 },
        );
      },

      reset() {
        ctrl?.abort();
        seq++;
        liveWeatherService.clearCache();
        set({ place: DEFAULT_PLACE, data: null, status: 'idle', error: null, geo: 'idle' });
      },
    }),
    {
      name: 'kd-weather',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ place: s.place, data: s.data }),
    },
  ),
);

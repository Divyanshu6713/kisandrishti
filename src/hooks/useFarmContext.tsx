import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { farmDataService, loadFarmContext, type FarmContext } from '@/services';
import { useFarmStore } from '@/state/farmStore';

type State =
  | { status: 'loading'; ctx: FarmContext | null; error?: undefined }
  | { status: 'ready'; ctx: FarmContext; error?: undefined }
  | { status: 'error'; ctx: FarmContext | null; error: string };

type Value = State & { reload: () => void; refreshing: boolean };

const Ctx = createContext<Value | null>(null);

/**
 * Loads the selected farm's full analysis context once for the whole app shell and
 * reloads it when farm records change (store `revision` / plan). The previous context
 * stays on screen while refreshing, so the UI never flashes empty after an action.
 */
export function FarmContextProvider({ children }: { children: ReactNode }) {
  const farmId = useFarmStore((s) => s.selectedFarmId);
  const revision = useFarmStore((s) => s.revision);
  const plan = useFarmStore((s) => s.plan);
  const [state, setState] = useState<State>({ status: 'loading', ctx: null });
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const last = useRef<FarmContext | null>(null);

  useEffect(() => {
    let alive = true;
    const keep = last.current?.farm.id === farmId ? last.current : null;
    if (keep) setRefreshing(true);
    else setState({ status: 'loading', ctx: null });
    (async () => {
      try {
        const farm = (await farmDataService.getFarm(farmId)) ?? (await farmDataService.listFarms())[0];
        if (farm.id !== farmId) useFarmStore.getState().selectFarm(farm.id);
        const ctx = await loadFarmContext(farm, plan);
        if (!alive) return;
        last.current = ctx;
        setState({ status: 'ready', ctx });
      } catch (e) {
        if (!alive) return;
        setState({ status: 'error', error: e instanceof Error ? e.message : 'Something went wrong loading the farm.', ctx: keep });
      } finally {
        if (alive) setRefreshing(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [farmId, revision, plan, nonce]);

  const value = useMemo<Value>(() => ({ ...state, refreshing, reload: () => setNonce((n) => n + 1) }), [state, refreshing]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFarmContext(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFarmContext must be used inside FarmContextProvider');
  return v;
}

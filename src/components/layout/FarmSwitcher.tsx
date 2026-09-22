import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Farm } from '@/models';
import { cn } from '@/lib/utils';
import { farmDataService } from '@/services';
import { useFarmStore } from '@/state/farmStore';
import { EASE } from '@/components/ui/motion';

export function FarmSwitcher({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [farms, setFarms] = useState<Farm[]>([]);
  const selected = useFarmStore((s) => s.selectedFarmId);
  const select = useFarmStore((s) => s.selectFarm);
  const revision = useFarmStore((s) => s.revision);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    farmDataService.listFarms().then(setFarms);
  }, [revision]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = farms.find((f) => f.id === selected) ?? farms[0];

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-ctl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-sunken"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-sm font-bold text-accent">{current?.name.charAt(0) ?? '·'}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current?.name ?? 'Loading…'}</span>
          <span className="block truncate text-label text-ink-3">{current ? `${current.areaAcres} acres · ${current.crop}` : ''}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Select farm"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="card absolute inset-x-0 top-full z-40 mt-2 overflow-hidden p-1.5"
          >
            {farms.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={f.id === selected}
                  onClick={() => {
                    select(f.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-sunken"
                >
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  {f.isDemo && <span className="chip bg-sunken text-ink-3">Demo</span>}
                  {f.id === selected && <Check className="h-4 w-4 text-accent" aria-hidden />}
                </button>
              </li>
            ))}
            <li className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/app/farms?new=1');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-accent hover:bg-sunken"
              >
                <Plus className="h-4 w-4" aria-hidden /> Add a farm
              </button>
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

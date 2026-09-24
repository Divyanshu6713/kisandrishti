import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { useGarden } from '@/hooks/useGarden';
import { useGardenStore } from '@/state/gardenStore';
import { EASE } from '@/components/ui/motion';

/** Rooftop twin of the FarmSwitcher: same shape, clay initial instead of green. */
export function GardenSwitcher({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { garden, gardens } = useGarden();
  const select = useGardenStore((s) => s.selectGarden);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-ctl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-sunken">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-clay-soft text-sm font-bold text-clay">{garden.name.charAt(0)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{garden.name}</span>
          <span className="block truncate text-label text-ink-3">
            {garden.areaSqFt} sq ft · {garden.plants.length} plant{garden.plants.length === 1 ? '' : 's'}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Select garden"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="card absolute inset-x-0 top-full z-40 mt-2 overflow-hidden p-1.5"
          >
            {gardens.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={g.id === garden.id}
                  onClick={() => {
                    select(g.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-sunken"
                >
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  {g.isDemo && <span className="chip bg-sunken text-ink-3">Demo</span>}
                  {g.id === garden.id && <Check className="h-4 w-4 text-accent" aria-hidden />}
                </button>
              </li>
            ))}
            <li className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/app/garden/setup?new=1');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-accent hover:bg-sunken"
              >
                <Plus className="h-4 w-4" aria-hidden /> Add a rooftop
              </button>
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

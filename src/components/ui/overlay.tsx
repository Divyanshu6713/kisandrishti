import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/state/toastStore';
import { EASE } from './motion';

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

/** Focus the panel on open and restore focus to the trigger on close. */
function useFocusReturn(open: boolean) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, button')?.focus(), 60);
    return () => {
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [open]);
  return panel;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEscape(open, onClose);
  const panel = useFocusReturn(open);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn('card relative max-h-[88dvh] w-full overflow-y-auto p-6 sm:p-8', wide ? 'max-w-2xl' : 'max-w-lg')}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <h2 className="text-h2">{title}</h2>
              <button type="button" onClick={onClose} className="btn-ghost -mr-2 -mt-1 p-2" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, side = 'right' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; side?: 'right' | 'left' }) {
  useEscape(open, onClose);
  const panel = useFocusReturn(open);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            ref={panel}
            role="dialog"
            aria-modal="true"
            className={cn('absolute inset-y-0 flex w-full max-w-md flex-col border-line bg-surface shadow-lift', side === 'right' ? 'right-0 border-l' : 'left-0 border-r')}
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 font-semibold">{title}</div>
              <button type="button" onClick={onClose} className="btn-ghost -mr-2 p-2" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const TOAST_ICON = { success: CheckCircle2, info: Info, error: XCircle };

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = TOAST_ICON[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="card pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3"
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', t.tone === 'error' ? 'text-danger' : t.tone === 'info' ? 'text-info' : 'text-accent')} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.detail && <p className="text-sm text-ink-2">{t.detail}</p>}
              </div>
              <button type="button" className="text-ink-3 hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

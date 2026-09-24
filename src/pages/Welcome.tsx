import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Home, Info, Sprout } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { cn } from '@/lib/utils';
import { BRAND, Logo, ThemeToggle } from '@/components/layout/brand';
import { EASE } from '@/components/ui/motion';
import { safeNext } from '@/components/auth/RequireAuth';
import { LANGUAGES, useLang, useT } from '@/i18n';
import { DEMO_FARM_ID, farmDataService } from '@/services';
import { DEMO_GARDEN_ID, gardenService } from '@/services/gardenService';
import { usePrefs, type FarmingMode } from '@/state/prefsStore';
import { useFarmStore } from '@/state/farmStore';
import { useGardenStore } from '@/state/gardenStore';
import { toast } from '@/state/toastStore';
import { FarmForm } from '@/features/farms/FarmForm';
import { GardenForm } from '@/features/garden/GardenForm';
import { FieldArt, HorizonBackdrop, RooftopArt } from '@/features/onboarding/art';

/**
 * First-run setup, after sign-in: language → how you grow → field or rooftop setup.
 * Each step is one clear decision on a calm, centred screen. Choices are saved as you go,
 * so a reload resumes where you left off.
 */

type Step = 'language' | 'type' | 'field' | 'rooftop';
const STEP_OF: Record<string, Step> = { '/welcome': 'language', '/welcome/type': 'type', '/welcome/field': 'field', '/welcome/rooftop': 'rooftop' };
const STEP_NO: Record<Step, number> = { language: 1, type: 2, field: 3, rooftop: 3 };

function Dots({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn('h-1.5 rounded-full transition-all duration-500 ease-calm', i === n ? 'w-6 bg-accent' : i < n ? 'w-1.5 bg-accent/50' : 'w-1.5 bg-line')} />
      ))}
    </div>
  );
}

function StepHeader({ n, title, body }: { n: number; title: string; body: string }) {
  const t = useT();
  return (
    <header className="mb-8 text-center sm:mb-10">
      <p className="eyebrow mb-3">{t('ob.step', { n })}</p>
      <h1 className="text-h1 text-balance sm:text-[2.35rem] sm:leading-[1.15]">{title}</h1>
      <p className="mx-auto mt-3 max-w-lg text-lead text-ink-2 text-pretty">{body}</p>
    </header>
  );
}

function CheckBadge({ on }: { on: boolean }) {
  return (
    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-colors', on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface')} aria-hidden>
      {on && <Check className="h-4 w-4" strokeWidth={3} />}
    </span>
  );
}

function LanguageStep({ onNext }: { onNext: () => void }) {
  const t = useT();
  const lang = usePrefs((s) => s.language);
  const setLanguage = usePrefs((s) => s.setLanguage);
  return (
    <>
      <StepHeader n={1} title={t('ob.lang.title')} body={t('ob.lang.body')} />
      <div role="radiogroup" aria-label={t('ob.lang.title')} className="mx-auto grid max-w-xl gap-3 sm:grid-cols-2 sm:gap-4">
        {LANGUAGES.map((l) => {
          const on = lang === l.id;
          return (
            <button key={l.id} type="button" role="radio" aria-checked={on} lang={l.id} onClick={() => setLanguage(l.id)} className="choice items-center gap-4 p-5 sm:flex-col sm:items-start sm:gap-6 sm:p-6">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-card bg-sunken text-h2 font-semibold text-ink" aria-hidden>
                {l.id === 'hi' ? 'अ' : 'A'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-h2 font-semibold text-ink">{l.native}</span>
                <span className="mt-0.5 block text-ink-3">{l.id === 'hi' ? `${l.english} · ${l.sample}` : l.sample}</span>
              </span>
              <span className="sm:absolute sm:right-5 sm:top-5">
                <CheckBadge on={on} />
              </span>
            </button>
          );
        })}
      </div>
      {lang === 'hi' && (
        <p className="mx-auto mt-5 flex max-w-xl items-start gap-2 text-sm text-ink-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t('ob.lang.hiNote')}
        </p>
      )}
      <div className="mt-8 flex justify-center">
        <button type="button" className="btn-primary btn-xl min-w-[14rem]" disabled={!lang} onClick={onNext}>
          {t('common.continue')} <ArrowRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </>
  );
}

function TypeStep({ onNext, onBack }: { onNext: (m: FarmingMode) => void; onBack: () => void }) {
  const t = useT();
  const current = usePrefs((s) => s.mode);
  const [mode, setMode] = useState<FarmingMode | null>(current);
  const options = [
    { id: 'field' as const, title: t('ob.type.field'), body: t('ob.type.fieldBody'), points: t('ob.type.fieldPoints'), Art: FieldArt },
    { id: 'rooftop' as const, title: t('ob.type.roof'), body: t('ob.type.roofBody'), points: t('ob.type.roofPoints'), Art: RooftopArt },
  ];
  return (
    <>
      <StepHeader n={2} title={t('ob.type.title')} body={t('ob.type.body')} />
      <div role="radiogroup" aria-label={t('ob.type.title')} className="grid gap-4 sm:grid-cols-2 sm:gap-5">
        {options.map(({ id, title, body, points, Art }) => {
          const on = mode === id;
          return (
            <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setMode(id)} className="choice group flex-col overflow-hidden">
              <span className="relative block aspect-[16/8] w-full overflow-hidden border-b border-line/70">
                <Art className="absolute inset-0 h-full w-full transition-transform duration-700 ease-calm group-hover:scale-[1.03]" />
              </span>
              <span className="flex items-start gap-4 p-5 sm:p-6">
                <span className="min-w-0 flex-1">
                  <span className="block text-h2 font-semibold text-ink">{title}</span>
                  <span className="mt-1 block text-ink-2">{body}</span>
                  <span className="mt-3 block text-sm text-ink-3">{points}</span>
                </span>
                <CheckBadge on={on} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-8 flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
        <button type="button" className="btn-ghost btn-lg" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t('common.back')}
        </button>
        <button type="button" className="btn-primary btn-xl min-w-[14rem]" disabled={!mode} onClick={() => mode && onNext(mode)}>
          {t('common.continue')} <ArrowRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </>
  );
}

/** Two ways in: the labelled demo, or your own. The own path opens its form in place. */
function SetupChoices({ demo, own, children, open, setOpen }: { demo: { title: string; body: string; onPick: () => void }; own: { title: string; body: string }; children: ReactNode; open: boolean; setOpen: (v: boolean) => void }) {
  const t = useT();
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <button type="button" onClick={demo.onPick} className="choice group items-center gap-4 p-5 sm:p-6">
        <span className="tile-icon h-12 w-12">
          <Sprout className="h-6 w-6" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-h3 font-semibold text-ink">{demo.title}</span>
            <span className="chip bg-sunken text-ink-3">{t('common.demo')}</span>
          </span>
          <span className="mt-1 block text-sm text-ink-2 text-pretty">{demo.body}</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-accent transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
      </button>
      <div className={cn('rounded-panel border-2 bg-surface shadow-soft transition-colors', open ? 'border-accent/60' : 'border-line/90')}>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="group flex w-full items-center gap-4 rounded-panel p-5 text-left sm:p-6">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-ctl bg-clay-soft text-clay">
            <Home className="h-6 w-6" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-h3 font-semibold text-ink">{own.title}</span>
            <span className="mt-1 block text-sm text-ink-2 text-pretty">{own.body}</span>
          </span>
          <ArrowRight className={cn('h-5 w-5 shrink-0 text-ink-3 transition-transform duration-300', open ? 'rotate-90' : 'group-hover:translate-x-1')} aria-hidden />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
              <div className="border-t border-line/70 p-5 sm:p-6">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FieldStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <StepHeader n={3} title={t('ob.field.title')} body={t('ob.field.body')} />
      <SetupChoices
        open={open}
        setOpen={setOpen}
        demo={{
          title: t('ob.field.demo'),
          body: t('ob.field.demoBody'),
          onPick: () => {
            useFarmStore.getState().selectFarm(DEMO_FARM_ID);
            onDone();
          },
        }}
        own={{ title: t('ob.field.own'), body: t('ob.field.ownBody') }}
      >
        {lang === 'hi' && <p className="mb-4 text-sm text-ink-3">{t('ob.field.formNote')}</p>}
        <FarmForm
          onCancel={() => setOpen(false)}
          onSubmit={(draft) => {
            const farm = farmDataService.createFarm(draft);
            toast('Farm profile created', `${farm.name} is selected. Add a soil test to unlock nutrient advice.`);
            onDone();
          }}
        />
      </SetupChoices>
      <div className="mt-8 flex justify-center">
        <button type="button" className="btn-ghost btn-lg" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t('common.back')}
        </button>
      </div>
    </>
  );
}

function RooftopStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <StepHeader n={3} title={t('ob.roof.title')} body={t('ob.roof.body')} />
      <SetupChoices
        open={open}
        setOpen={setOpen}
        demo={{
          title: t('ob.roof.demo'),
          body: t('ob.roof.demoBody'),
          onPick: () => {
            useGardenStore.getState().selectGarden(DEMO_GARDEN_ID);
            onDone();
          },
        }}
        own={{ title: t('ob.roof.own'), body: t('ob.roof.ownBody') }}
      >
        <GardenForm
          onSubmit={(draft) => {
            const g = gardenService.create(draft);
            useGardenStore.getState().addGarden(g);
            toast('Rooftop saved', `${g.name} is ready. Add planting dates to see stages and harvest times.`);
            onDone();
          }}
        />
      </SetupChoices>
      <div className="mt-8 flex justify-center">
        <button type="button" className="btn-ghost btn-lg" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t('common.back')}
        </button>
      </div>
    </>
  );
}

export default function Welcome() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reduce = useReducedMotion();
  const t = useT();
  const { language, setMode } = usePrefs();
  const step = STEP_OF[location.pathname.replace(/\/$/, '')] ?? 'language';
  const q = params.toString() ? `?${params}` : '';
  const go = (s: Step) => navigate(`${s === 'language' ? '/welcome' : `/welcome/${s}`}${q}`);
  const finish = (m: FarmingMode) => {
    setMode(m);
    const next = safeNext(params.get('next'));
    navigate(m === 'rooftop' && next === '/app' ? '/app/garden' : next, { replace: true });
  };

  useEffect(() => {
    document.title = `Welcome · ${BRAND.name}`;
    return () => {
      document.title = `${BRAND.name} — Intelligent Farming`;
    };
  }, []);

  // Later steps need the earlier answers.
  if (step !== 'language' && !language) return <Navigate to={`/welcome${q}`} replace />;

  return (
    <div className="grain relative isolate flex min-h-dvh flex-col bg-bg">
      <HorizonBackdrop />
      <header className="container-page flex h-16 items-center gap-4 sm:h-[4.5rem]">
        <Logo />
        <div className="ml-auto flex items-center gap-4">
          <Dots n={STEP_NO[step]} />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="container-page flex flex-1 flex-col pb-40 pt-6 sm:pt-12">
        <div className="mx-auto w-full max-w-3xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {step === 'language' && <LanguageStep onNext={() => go('type')} />}
              {step === 'type' && (
<TypeStep onBack={() => go('language')} onNext={go} />
              )}
              {step === 'field' && <FieldStep onBack={() => go('type')} onDone={() => finish('field')} />}
              {step === 'rooftop' && <RooftopStep onBack={() => go('type')} onDone={() => finish('rooftop')} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <footer className="relative pb-5 text-center text-label text-ink-3">
        <Link to="/" className="hover:text-ink-2">
          {BRAND.name}
        </Link>{' '}
        · {t('shell.demoData')}
      </footer>
    </div>
  );
}

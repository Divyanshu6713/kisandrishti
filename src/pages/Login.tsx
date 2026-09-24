import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, ArrowRight, CloudSun, Eye, EyeOff, Info, Layers, Leaf, Loader2, Sprout } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { cn } from '@/lib/utils';
import { BRAND, Logo, ThemeToggle } from '@/components/layout/brand';
import { EASE } from '@/components/ui/motion';
import { AuthChecking, safeNext } from '@/components/auth/RequireAuth';
import { SceneFallback } from '@/three/SceneFallback';
import { DEMO_FARM_ID } from '@/services';
import { authMisconfigured, authProvider, AuthError, isEmail, parseIdentifier } from '@/services/auth';
import { useAuthStore } from '@/state/authStore';
import { useFarmStore } from '@/state/farmStore';
import { useTourStore } from '@/state/tourStore';

type View = 'signin' | 'forgot';
const MAX_TRIES = 5;
const LOCK_MS = 30_000;

const message = (e: unknown) => (e instanceof AuthError ? e.message : 'Something went wrong. Please try again.');

function Banner({ tone, children }: { tone: 'info' | 'danger' | 'accent'; children: ReactNode }) {
  const Icon = tone === 'danger' ? AlertTriangle : Info;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-ctl px-3.5 py-3 text-sm',
        tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-info-soft text-info',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="text-pretty">{children}</span>
    </div>
  );
}

function PasswordField({ id, label, value, onChange, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className="field pr-11"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          maxLength={128}
          required
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-ctl text-ink-3 transition-colors hover:text-ink"
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-ink-2">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        className="grid h-[18px] w-[18px] place-items-center rounded-[5px] border border-line bg-surface transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40"
        aria-hidden
      >
        <svg viewBox="0 0 12 12" className={cn('h-3 w-3 text-accent-ink transition-opacity', checked ? 'opacity-100' : 'opacity-0')}>
          <path d="M2.5 6.2l2.2 2.2 4.8-4.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {children}
    </label>
  );
}

function BrandPanel() {
  const points = [
    { icon: Layers, text: 'Soil and crop health, explained' },
    { icon: CloudSun, text: 'Live weather for any place in India' },
    { icon: Leaf, text: 'Organic-first advice you can act on' },
  ];
  return (
    <aside className="relative hidden overflow-hidden border-r border-line/80 bg-sunken/40 lg:flex lg:flex-col">
      <div className="absolute inset-x-0 bottom-0 h-[46%] opacity-90" aria-hidden>
        <SceneFallback />
        {/* blends the illustration's sky into the panel tint */}
        <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-sunken/40 to-transparent" />
      </div>
      <div className="relative flex flex-1 flex-col px-12 pt-10 xl:px-16">
        <Logo />
        <div className="mt-20 max-w-md">
          <p className="eyebrow mb-4 inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Farm intelligence · organic-first
          </p>
          <h2 className="text-[2.35rem] font-bold leading-[1.1] tracking-tight text-balance">{BRAND.tagline}</h2>
          <ul className="mt-8 space-y-3.5">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-ink-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-surface shadow-soft">
                  <Icon className="h-4 w-4 text-accent" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

export default function Login() {
  const [params] = useSearchParams();
  const { status, endReason, recovery, clearEndReason } = useAuthStore();
  const reduce = useReducedMotion();
  const uid = useId();

  const [view, setView] = useState<View>('signin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState<null | 'account' | 'demo' | 'reset'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fails, setFails] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  const next = safeNext(params.get('next'));
  const locked = lockedUntil > now;

  useEffect(() => {
    if (!locked) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [locked]);

  useEffect(() => {
    document.title = `Sign in · ${BRAND.name}`;
    return () => {
      document.title = `${BRAND.name} — Intelligent Farming`;
    };
  }, []);

  if (status === 'loading') return <AuthChecking />;
  if (status === 'authenticated' && !recovery) return <Navigate to={next} replace />;

  const reasonNote =
    endReason === 'expired'
      ? 'Your session ended. Please sign in again.'
      : endReason === 'signed-out'
        ? 'You have been logged out.'
        : params.get('next')
          ? 'Please sign in to continue.'
          : null;

  const demoLogin = async () => {
    setError(null);
    setBusy('demo');
    try {
      useFarmStore.getState().selectFarm(DEMO_FARM_ID);
      if (params.get('tour') === '1') useTourStore.getState().start();
      await useAuthStore.getState().signInDemo(remember);
      clearEndReason();
    } catch (e) {
      setError(message(e));
      setBusy(null);
    }
  };

  const accountLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (locked) return;
    const id = parseIdentifier(identifier);
    if (!id) {
      setError('Enter a valid email address or a 10-digit mobile number.');
      return;
    }
    if (password.length < 6) {
      setError('Enter your password.');
      return;
    }
    setBusy('account');
    try {
      await useAuthStore.getState().signIn(id, password, remember);
      clearEndReason();
    } catch (err) {
      setPassword(''); // never keep a rejected password around
      const f = fails + 1;
      setFails(f);
      if (err instanceof AuthError && err.code === 'invalid-credentials' && f >= MAX_TRIES) {
        setLockedUntil(Date.now() + LOCK_MS);
        setNow(Date.now());
        setFails(0);
      }
      setError(message(err));
      setBusy(null);
    }
  };

  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!isEmail(identifier)) {
      setError('Enter the email address of your account.');
      return;
    }
    setBusy('reset');
    try {
      await authProvider.requestPasswordReset(identifier.trim().toLowerCase());
      setNotice('If an account exists for this email, a reset link is on its way.');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  };

  const swap = {
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: reduce ? undefined : { opacity: 0, y: -6 },
    transition: { duration: 0.28, ease: EASE },
  } as const;

  return (
    <div className="grain min-h-dvh bg-bg lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <BrandPanel />

      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center gap-3 px-4 sm:h-[4.5rem] sm:px-8">
          <Logo className="lg:hidden" />
          <Link to="/" className="btn-ghost -ml-2 hidden px-2 text-sm lg:inline-flex">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Home
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center sm:px-8">
          <div className="w-full max-w-[26rem]">
            {recovery ? (
              <RecoveryForm />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {view === 'signin' ? (
                  <motion.div key="signin" {...swap}>
                    <p className="eyebrow mb-2">Sign in</p>
                    <h1 className="text-h1">Welcome to your farm</h1>
                    <p className="mt-1.5 text-ink-2">Sign in to see soil, crop, weather and advice for your fields.</p>

                    <div className="mt-6 space-y-3">
                      {reasonNote && <Banner tone="info">{reasonNote}</Banner>}
                      {authMisconfigured && <Banner tone="info">Account sign-in is not configured correctly on this build, so it runs in demo mode.</Banner>}
                    </div>

                    <section aria-labelledby={`${uid}-demo`} className="mt-6 rounded-card border border-accent/25 bg-accent-soft/50 p-4 sm:p-5">
                      <div className="flex items-center gap-2">
                        <span className="chip bg-accent text-accent-ink">DEMO</span>
                        <h2 id={`${uid}-demo`} className="text-sm font-semibold">
                          Explore the sample farm
                        </h2>
                      </div>
                      <p className="mt-2 text-sm text-ink-2">No account needed. Opens the bundled demo farm (sample data) with live weather.</p>
                      <button type="button" onClick={demoLogin} disabled={busy !== null} className="btn-primary btn-lg mt-4 w-full">
                        {busy === 'demo' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sprout className="h-4 w-4" aria-hidden />}
                        {busy === 'demo' ? 'Opening demo farm…' : 'Demo Login'}
                      </button>
                    </section>

                    <div className="my-6 flex items-center gap-3 text-label text-ink-3">
                      <span className="h-px flex-1 bg-line" aria-hidden />
                      or sign in with your account
                      <span className="h-px flex-1 bg-line" aria-hidden />
                    </div>

                    <form onSubmit={accountLogin} className="space-y-4" noValidate>
                      <div>
                        <label htmlFor={`${uid}-id`} className="field-label">
                          Email or mobile number
                        </label>
                        <input
                          id={`${uid}-id`}
                          className="field"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          autoComplete="username"
                          inputMode="email"
                          placeholder="name@example.com or 98765 43210"
                          maxLength={254}
                          required
                        />
                      </div>
                      <PasswordField id={`${uid}-pw`} label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
                      <div className="flex items-center justify-between gap-3">
                        <Checkbox checked={remember} onChange={setRemember}>
                          Remember session
                        </Checkbox>
                        <button
                          type="button"
                          className="rounded text-sm font-semibold text-accent hover:underline"
                          onClick={() => {
                            setError(null);
                            setNotice(null);
                            setView('forgot');
                          }}
                        >
                          Forgot password?
                        </button>
                      </div>
                      {error && <Banner tone="danger">{error}</Banner>}
                      {locked && <Banner tone="info">Too many attempts. Try again in {Math.ceil((lockedUntil - now) / 1000)} s.</Banner>}
                      <button type="submit" disabled={busy !== null || locked} className={cn('w-full', authProvider.accountsEnabled ? 'btn-primary' : 'btn-secondary')}>
                        {busy === 'account' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        {busy === 'account' ? 'Signing in…' : 'Sign in'}
                        {busy !== 'account' && <ArrowRight className="h-4 w-4" aria-hidden />}
                      </button>
                      {!authProvider.accountsEnabled && (
                        <p className="flex items-start gap-2 text-label text-ink-3">
                          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                          Account sign-in is switched off in this demo build. Use Demo Login above.
                        </p>
                      )}
                    </form>
                  </motion.div>
                ) : (
                  <motion.div key="forgot" {...swap}>
                    <button type="button" className="btn-ghost -ml-3 mb-4 px-3 text-sm" onClick={() => setView('signin')}>
                      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to sign in
                    </button>
                    <p className="eyebrow mb-2">Password help</p>
                    <h1 className="text-h1">Reset your password</h1>
                    <p className="mt-1.5 text-ink-2">Enter your account email and we will send a link to set a new password.</p>
                    <form onSubmit={sendReset} className="mt-6 space-y-4" noValidate>
                      <div>
                        <label htmlFor={`${uid}-reset`} className="field-label">
                          Email
                        </label>
                        <input
                          id={`${uid}-reset`}
                          type="email"
                          className="field"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          autoComplete="email"
                          maxLength={254}
                          required
                        />
                      </div>
                      {error && <Banner tone="danger">{error}</Banner>}
                      {notice && <Banner tone="accent">{notice}</Banner>}
                      <button type="submit" disabled={busy !== null} className="btn-primary w-full">
                        {busy === 'reset' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        Send reset link
                      </button>
                      {!authProvider.accountsEnabled && (
                        <p className="text-label text-ink-3">Password reset works once account sign-in is enabled. The demo farm needs no password.</p>
                      )}
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </main>

        <footer className="px-4 pb-6 text-center text-label text-ink-3 sm:px-8">Prototype · sample farm data · rule-based engine · not agronomic advice</footer>
      </div>
    </div>
  );
}

/** Shown after opening a Supabase password-recovery link. */
function RecoveryForm() {
  const uid = useId();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      await authProvider.updatePassword(pw);
      useAuthStore.getState().finishRecovery();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    } finally {
      setPw('');
      setPw2('');
    }
  };

  return (
    <div>
      <p className="eyebrow mb-2">Password help</p>
      <h1 className="text-h1">Set a new password</h1>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <PasswordField id={`${uid}-a`} label="New password" value={pw} onChange={setPw} autoComplete="new-password" />
        <PasswordField id={`${uid}-b`} label="Repeat new password" value={pw2} onChange={setPw2} autoComplete="new-password" />
        {error && <Banner tone="danger">{error}</Banner>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save password
        </button>
      </form>
    </div>
  );
}

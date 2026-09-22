import { Database, FlaskConical, Ruler, CloudSun, User, Cpu, Radio } from 'lucide-react';
import type { Basis, SourceTag } from '@/models';
import { cn } from '@/lib/utils';
import { Disclosure } from './primitives';

const SOURCE_META: Record<SourceTag, { label: string; icon: typeof Database; title: string }> = {
  'user-input': { label: 'Your input', icon: User, title: 'Entered by you' },
  'demo-dataset': { label: 'Demo data', icon: Database, title: 'Bundled sample farm records — not a real farm' },
  'reference-ranges': { label: 'Reference ranges', icon: Ruler, title: 'Published soil-test category ranges' },
  'demo-rules': { label: 'Rule engine', icon: FlaskConical, title: 'Transparent prototype rules — to be replaced by the trained Kisan Drishti model' },
  'sample-forecast': { label: 'Sample forecast', icon: CloudSun, title: 'Bundled sample weather — not live' },
  'live-weather': { label: 'Live weather', icon: Radio, title: 'Live weather provider' },
  'model-api': { label: 'Trained model', icon: Cpu, title: 'Kisan Drishti model API' },
};

/** Small chips that say where a result came from. Shown next to every analysis. */
export function SourceTags({ sources, className }: { sources: SourceTag[]; className?: string }) {
  const unique = [...new Set(sources)];
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Data sources">
      {unique.map((s) => {
        const m = SOURCE_META[s];
        const Icon = m.icon;
        return (
          <li key={s} title={m.title} className="chip border border-line/80 bg-surface text-ink-3">
            <Icon className="h-3 w-3" aria-hidden />
            {m.label}
          </li>
        );
      })}
    </ul>
  );
}

export function BasisList({ basis }: { basis: Basis }) {
  return (
    <div className="space-y-3">
      {basis.factors.length > 0 && (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {basis.factors.map((f, i) => (
            <div key={i} className="contents">
              <dt className="text-ink-3">{f.label}</dt>
              <dd className="text-ink-2">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {basis.note && <p className="text-sm text-ink-3">{basis.note}</p>}
      <SourceTags sources={basis.sources} />
    </div>
  );
}

/** Collapsed "What is this based on?" section. */
export function WhyThis({ basis, label = 'What is this based on?' }: { basis: Basis; label?: string }) {
  return (
    <Disclosure summary={label} className="border-t border-line/70 pt-3">
      <BasisList basis={basis} />
    </Disclosure>
  );
}

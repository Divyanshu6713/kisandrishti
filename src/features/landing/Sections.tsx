import { motion } from 'framer-motion';
import { ArrowRight, Bot, CloudSun, Database, Layers, Leaf, Microscope, ShieldAlert, Sprout, User, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { OrganicPractice } from '@/models';
import { organicRecommendationService } from '@/services';
import { EASE, Reveal, rise, stagger } from '@/components/ui/motion';
import { BRAND } from '@/components/layout/brand';

const MODULES = [
  { icon: Layers, title: 'Soil Intelligence', body: 'Nutrient status, deficiencies and suitable crops from your soil test.' },
  { icon: Sprout, title: 'Crop Health', body: 'Growth stage and health built from field observations and risk.' },
  { icon: Leaf, title: 'Organic Farming', body: 'Practices matched to your soil, crop stage and the inputs you have.' },
  { icon: Microscope, title: 'Disease Analysis', body: 'Photo → preprocessing → model → guidance, with honest confidence.' },
  { icon: ShieldAlert, title: 'Risk Intelligence', body: 'Disease, pest, water and weather stress — with the reasons shown.' },
  { icon: Bot, title: 'Farm Advisor', body: 'One prioritised list that combines everything, and says when data is missing.' },
];

export function Capabilities() {
  return (
    <section className="container-page py-24 sm:py-32" aria-labelledby="cap-title">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-20">
        <Reveal>
          <p className="eyebrow mb-3">One platform</p>
          <h2 id="cap-title" className="text-h1 text-balance">Everything a field decision needs — nothing it doesn’t.</h2>
          <p className="mt-4 text-lead text-ink-2">Six focused modules share one farm context, so numbers never disagree between screens.</p>
        </Reveal>
        <motion.ul variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} className="grid gap-x-10 sm:grid-cols-2">
          {MODULES.map(({ icon: Icon, title, body }) => (
            <motion.li key={title} variants={rise} className="flex gap-4 border-t border-line/80 py-6">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-ink-2">{body}</p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

function OrganicArt() {
  return (
    <svg viewBox="0 0 420 360" className="h-auto w-full" aria-hidden>
      <motion.path
        d="M20 250 C 90 214 160 236 214 222 C 280 205 340 226 400 214 L400 340 L20 340 Z"
        fill="rgb(var(--earth) / 0.22)"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: EASE }}
      />
      <motion.path
        d="M20 286 C 120 262 220 290 300 272 C 350 262 380 270 400 266 L400 340 L20 340 Z"
        fill="rgb(var(--earth) / 0.35)"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: EASE, delay: 0.15 }}
      />
      {[
        [90, 300, 5],
        [150, 312, 4],
        [250, 296, 6],
        [320, 316, 4],
        [200, 322, 3],
      ].map(([x, y, r], i) => (
        <motion.circle key={i} cx={x} cy={y} r={r} fill="rgb(var(--accent) / 0.5)" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.6 + i * 0.08 }} />
      ))}
      <motion.path d="M210 226 C 210 170 212 120 210 70" stroke="rgb(var(--accent))" strokeWidth="4" fill="none" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, ease: EASE, delay: 0.3 }} />
      <motion.path d="M210 170 C 240 130 280 128 312 146 C 280 172 244 178 210 170 Z" fill="rgb(var(--accent) / 0.85)" initial={{ scale: 0, originX: '210px', originY: '170px' }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE, delay: 1 }} />
      <motion.path d="M211 130 C 180 96 140 94 112 110 C 140 136 178 140 211 130 Z" fill="rgb(var(--accent) / 0.6)" initial={{ scale: 0, originX: '211px', originY: '130px' }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE, delay: 1.2 }} />
      <motion.path d="M210 226 C 190 250 176 270 170 300 M210 226 C 228 252 240 274 246 304 M210 226 C 210 256 206 280 208 318" stroke="rgb(var(--earth) / 0.7)" strokeWidth="2" fill="none" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, ease: EASE, delay: 0.5 }} />
    </svg>
  );
}

const GROUPS: { category: OrganicPractice['category']; title: string; body: string }[] = [
  { category: 'nutrient', title: 'Nourish', body: 'Compost, vermicompost, FYM and biofertilizers matched to soil-test deficiencies.' },
  { category: 'protection', title: 'Protect', body: 'Prevention, monitoring and biological control before anything else.' },
  { category: 'soil', title: 'Rebuild', body: 'Green manure, residue and rotations that raise organic carbon season by season.' },
];

export function OrganicSection() {
  const [practices, setPractices] = useState<OrganicPractice[]>([]);
  useEffect(() => {
    organicRecommendationService.practices().then(setPractices);
  }, []);
  return (
    <section id="organic" className="scroll-mt-16 bg-sunken/50 py-24 sm:py-32" aria-labelledby="organic-title">
      <div className="container-page grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <Reveal>
            <p className="eyebrow mb-3">Organic, by default</p>
            <h2 id="organic-title" className="text-h1 text-balance">Recommendations that respect the soil.</h2>
            <p className="mt-4 max-w-lg text-lead text-ink-2">
              Organic practice isn’t a separate tab — it’s how {BRAND.name} thinks. Every suggestion is matched to your soil test, crop stage and the inputs already on your farm.
            </p>
          </Reveal>
          <motion.ul variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="mt-10 space-y-6">
            {GROUPS.map((g) => {
              const items = practices.filter((p) => p.category === g.category);
              return (
                <motion.li key={g.category} variants={rise} className="grid grid-cols-[5.5rem_1fr] gap-4">
                  <span className="text-h3 font-semibold text-accent">{g.title}</span>
                  <div>
                    <p className="text-ink-2">{g.body}</p>
                    {items.length > 0 && (
                      <p className="mt-1 text-sm text-ink-3">
                        {items.length} practices in the demo knowledge base · e.g. {items.slice(0, 2).map((i) => i.name.split(' (')[0]).join(', ')}
                      </p>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>
          <p className="mt-8 text-label text-ink-3">No doses are prescribed. Quantities depend on your soil test and local expert advice — the verified Kisan Drishti dataset will replace the demo knowledge base.</p>
        </div>
        <Reveal delay={0.1} className="mx-auto w-full max-w-md">
          <OrganicArt />
        </Reveal>
      </div>
    </section>
  );
}

const FLOW = [
  { icon: Database, title: 'Data', items: ['Soil tests', 'Field notes & photos', 'Weather', 'Crop & organic datasets'] },
  { icon: Workflow, title: 'Analysis', items: ['Soil · crop · disease services', 'Risk prediction', 'Swappable model seams'] },
  { icon: Bot, title: 'Recommendation', items: ['Observation → risk → action', 'Priority & reasons', '“Not enough data” when true'] },
  { icon: User, title: 'Farmer', items: ['A short plan for today', 'Feedback closes the loop'] },
];

export function IntelligenceSection() {
  return (
    <section id="intelligence" className="container-page scroll-mt-16 py-24 sm:py-32" aria-labelledby="intel-title">
      <Reveal className="max-w-2xl">
        <p className="eyebrow mb-3">How the intelligence works</p>
        <h2 id="intel-title" className="text-h1 text-balance">Data first. Then analysis. Then advice.</h2>
        <p className="mt-4 text-lead text-ink-2">Every result on screen shows what it is based on. When the data isn’t there, it says so instead of guessing.</p>
      </Reveal>
      <motion.ol variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} className="mt-14 grid gap-4 md:grid-cols-4 md:gap-0">
        {FLOW.map(({ icon: Icon, title, items }, i) => (
          <motion.li key={title} variants={rise} className="relative md:pr-8">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-accent shadow-soft">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              {i < FLOW.length - 1 && (
                <motion.span
                  className="hidden h-px flex-1 origin-left bg-gradient-to-r from-accent/60 to-line md:block"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.2 }}
                  aria-hidden
                />
              )}
            </div>
            <h3 className="mt-4 font-semibold">{title}</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink-2">
              {items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </motion.li>
        ))}
      </motion.ol>
      <Reveal className="mt-14 grid gap-4 md:grid-cols-2">
        <div className="card card-pad">
          <p className="eyebrow mb-2">Today — in this prototype</p>
          <p className="text-ink-2">A transparent rule engine runs over sample farm data and published soil-test ranges. Disease results for demo photos are labelled as simulated.</p>
        </div>
        <div className="card card-pad">
          <p className="eyebrow mb-2">Next — same interfaces</p>
          <p className="text-ink-2">Models trained on the Kisan Drishti agricultural dataset plug in behind the same services (REST / FastAPI / model endpoint) — the interface stays the same.</p>
        </div>
      </Reveal>
    </section>
  );
}

export function FinalCta({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="container-page pb-16">
      <Reveal className="relative overflow-hidden rounded-[1.75rem] bg-accent px-6 py-16 text-center text-accent-ink sm:px-12 sm:py-20">
        <CloudSun className="mx-auto mb-5 h-8 w-8 opacity-80" aria-hidden />
        <h2 className="mx-auto max-w-xl text-h1 text-balance text-accent-ink">See one farm, end to end, in under three minutes.</h2>
        <p className="mx-auto mt-3 max-w-md opacity-85">A guided demo walks from soil to organic advice, disease analysis, risk and the combined plan.</p>
        <button type="button" onClick={onEnter} className="btn btn-lg mt-8 bg-accent-ink text-accent hover:opacity-90">
          Start the guided demo <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </Reveal>
      <footer className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line/70 pt-8 text-sm text-ink-3 sm:flex-row">
        <p>
          © {new Date().getFullYear()} {BRAND.name} · {BRAND.tagline}
        </p>
        <p>Prototype for demonstration · sample data · not agronomic advice</p>
      </footer>
    </section>
  );
}

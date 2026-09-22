import { motion } from 'framer-motion';
import { ArrowRight, Check, MapPin, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { CropInfo, Farm } from '@/models';
import { cn, formatDate } from '@/lib/utils';
import { cropAnalysisService, farmDataService, type FarmContext } from '@/services';
import { useFarmStore } from '@/state/farmStore';
import { toast } from '@/state/toastStore';
import { WithFarm } from '@/components/farm/WithFarm';
import { Modal } from '@/components/ui/overlay';
import { PageHeader, Pill } from '@/components/ui/primitives';
import { Reveal, rise, stagger } from '@/components/ui/motion';
import { FarmForm } from '@/features/farms/FarmForm';

const METHOD_LABEL: Record<Farm['method'], string> = { organic: 'Organic', transitioning: 'Moving to organic', natural: 'Natural farming', conventional: 'Conventional' };

/** Generated profile: what the knowledge base says about this farm's crop and timing. */
function Profile({ ctx }: { ctx: FarmContext }) {
  const f = ctx.farm;
  const upcoming = ctx.crop.stages.filter((s) => s.waterCritical && s.fromDay > ctx.growth.daysAfterSowing).slice(0, 2);
  const rows: [string, string][] = [
    ['Location', f.location],
    ['Area', `${f.areaAcres} acres`],
    ['Crop', `${ctx.crop.name} (${ctx.crop.localName}) · ${f.variety || 'variety not set'}`],
    ['Sown', formatDate(f.sowingDate)],
    ['Soil', f.soilType.replace('-', ' ')],
    ['Irrigation', f.irrigation],
    ['Method', METHOD_LABEL[f.method]],
  ];
  return (
    <Reveal className="card card-pad">
      <p className="eyebrow mb-2">Farm profile</p>
      <h2 className="text-h2">{f.name}</h2>
      <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-line/60 pb-2 sm:block sm:border-0 sm:pb-0">
            <dt className="text-ink-3">{k}</dt>
            <dd className="font-medium capitalize">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 grid gap-4 border-t border-line/70 pt-5 sm:grid-cols-3">
        <div>
          <p className="eyebrow mb-1">Growth stage</p>
          <p className="font-semibold">{ctx.growth.stage?.name ?? ctx.growth.label}</p>
          <p className="text-sm text-ink-3">Day {Math.max(0, ctx.growth.daysAfterSowing)}</p>
        </div>
        <div>
          <p className="eyebrow mb-1">Preferred pH</p>
          <p className="font-semibold">
            {ctx.crop.phRange[0]}–{ctx.crop.phRange[1]}
          </p>
          <p className="text-sm text-ink-3">{ctx.crop.preferredSoils.includes(f.soilType) ? 'Soil type suits this crop' : 'Soil type is less typical'}</p>
        </div>
        <div>
          <p className="eyebrow mb-1">Next critical irrigation</p>
          <p className="font-semibold">{upcoming[0]?.name ?? '—'}</p>
          <p className="text-sm text-ink-3">{upcoming[0] ? `from ~day ${upcoming[0].fromDay}` : 'none ahead'}</p>
        </div>
      </div>
      {!ctx.soilReport && <p className="mt-5 rounded-ctl bg-warn-soft px-4 py-3 text-sm text-warn">No soil test yet — add one on the Soil page to unlock nutrient and organic advice.</p>}
    </Reveal>
  );
}

function FarmsBody({ ctx }: { ctx: FarmContext }) {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get('new') === '1');
  const [farms, setFarms] = useState<Farm[]>([]);
  const [crops, setCrops] = useState<CropInfo[]>([]);
  const [confirm, setConfirm] = useState<Farm | null>(null);
  const selected = useFarmStore((s) => s.selectedFarmId);
  const revision = useFarmStore((s) => s.revision);
  const select = useFarmStore((s) => s.selectFarm);
  const remove = useFarmStore((s) => s.removeFarm);
  const navigate = useNavigate();

  useEffect(() => {
    farmDataService.listFarms().then(setFarms);
    cropAnalysisService.crops().then(setCrops);
  }, [revision]);

  useEffect(() => {
    if (params.get('new') === '1') setOpen(true);
  }, [params]);

  const close = () => {
    setOpen(false);
    if (params.get('new')) setParams({}, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="My Farms"
        title="Farms"
        description="Each farm keeps its own soil tests, observations, plan and analysis."
        action={
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add farm
          </button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-12">
        <motion.ul variants={stagger} initial="hidden" animate="show" className="space-y-3 lg:col-span-5">
          {farms.map((f) => {
            const active = f.id === selected;
            const crop = crops.find((c) => c.id === f.crop);
            return (
              <motion.li key={f.id} variants={rise}>
                <div className={cn('card flex items-center gap-4 p-4 transition-colors', active ? 'border-accent/40 ring-1 ring-accent/30' : 'hover:bg-sunken/40')}>
                  <button type="button" onClick={() => select(f.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left" aria-pressed={active}>
                    <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold', active ? 'bg-accent text-accent-ink' : 'bg-sunken text-ink-2')}>{f.name.charAt(0)}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="truncate">{f.name}</span>
                        {f.isDemo && <Pill>Demo</Pill>}
                      </span>
                      <span className="flex items-center gap-1 truncate text-sm text-ink-3">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {f.location}
                      </span>
                      <span className="block text-sm text-ink-2">
                        {crop?.name ?? f.crop} · {f.areaAcres} acres · {METHOD_LABEL[f.method]}
                      </span>
                    </span>
                  </button>
                  {active ? <Check className="h-5 w-5 shrink-0 text-accent" aria-label="Selected" /> : null}
                  {!f.isDemo && (
                    <button type="button" className="btn-ghost shrink-0 p-2" onClick={() => setConfirm(f)} aria-label={`Remove ${f.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
        <div className="lg:col-span-7">
          <Profile ctx={ctx} />
          <button type="button" className="btn-secondary mt-4" onClick={() => navigate('/app')}>
            Open overview <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <Modal open={open} onClose={close} title="Add a farm" wide>
        <FarmForm
          onCancel={close}
          onSubmit={(draft) => {
            const farm = farmDataService.createFarm(draft);
            close();
            toast('Farm profile created', `${farm.name} is now selected. Add a soil test to unlock nutrient advice.`);
          }}
        />
      </Modal>

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Remove this farm?">
        <p className="text-ink-2">
          <span className="font-semibold text-ink">{confirm?.name}</span> and its soil tests, observations and plan will be removed from this browser.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setConfirm(null)}>
            Keep farm
          </button>
          <button
            type="button"
            className="btn bg-danger text-accent-ink hover:brightness-110"
            onClick={() => {
              if (confirm) remove(confirm.id);
              toast('Farm removed', confirm?.name, 'info');
              setConfirm(null);
            }}
          >
            Remove
          </button>
        </div>
      </Modal>
    </>
  );
}

export default function Farms() {
  return <WithFarm>{(ctx) => <FarmsBody ctx={ctx} />}</WithFarm>;
}

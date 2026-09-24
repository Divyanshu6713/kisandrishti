# Kisan Drishti design system

One brand, two densities. Field farming and rooftop farming use the same tokens, type, cards,
buttons and icons; they differ in how much they show at once.

| | Field farming | Rooftop farming |
|---|---|---|
| Goal | Action-first, low cognitive load | Discovery-first, richer |
| Home | Greeting → status → most important → *Today on your farm* → quick-action tiles | 3D terrace → *Today's garden* → three advisers → roof to plate → garden notes |
| Controls | Large tiles (`.tile`), `btn-xl` for primary steps | Standard buttons, denser rows |
| Accent | Field green | Field green + clay (pots, harvest) |

## Tokens (`src/styles/tokens.css`)

Colours are `R G B` triplets so Tailwind can add alpha (`bg-accent/20`). Light and dark are
designed separately, not inverted.

| Token | Use | Never |
|---|---|---|
| `bg` / `surface` / `sunken` / `line` | Page, cards, wells, borders — the warm neutral base | — |
| `ink` / `ink-2` / `ink-3` | Primary text / secondary / metadata | Pure black |
| `accent` (+`soft`) | Primary buttons, selection, healthy state, links | Decoration |
| `earth` | Soil and organic context | Buttons |
| `clay` (+`soft`) | Sparing warmth: rooftop pots, harvest, "Did you know?", Kisan Saathi chip | A status colour |
| `warn` / `danger` / `info` | Status only — always with an icon or a word | Large fills |

3D scenes read the same palette from `src/theme/scenePalette.ts`.

## Type

Manrope (Latin) with the platform Devanagari font as fallback (Nirmala UI / Noto Sans Devanagari).
Scale: `label` · `sm` · `base` · `lead` · `h3` · `h2` · `h1` · `display`. Under `:lang(hi)` the
eyebrow drops uppercase/tracking and line height grows slightly. Untranslated blocks inside a Hindi
page carry `lang="en"`.

## Shape and depth

- Radius: `rounded-panel` (1.5rem) large primary surfaces and onboarding choices · `rounded-card`
  (1.125rem) cards · `rounded-ctl` (0.75rem) controls · pills only for chips.
- Shadows: `shadow-soft` at rest, `shadow-lift` on hover/selected. Warm-tinted, never blue or glowing.
  Hierarchy comes from surface contrast, borders and spacing first.

## Components (`src/styles/index.css`)

| Class | Role |
|---|---|
| `.btn-primary` | One per view: the main action (field green) |
| `.btn-secondary` | Surface + border |
| `.btn-ghost` | Tertiary / text actions |
| `.btn-danger` | Destructive, always behind a confirm |
| `.btn-lg`, `.btn-xl` | Larger targets; `btn-xl` allows wrapping for Hindi |
| `.card`, `.card-pad`, `.card-hover` | All surfaces |
| `.tile`, `.tile-icon` | Field quick actions (icon + label + hint) |
| `.choice` | Selectable onboarding card; selected = accent border + check, not colour alone |
| `.chip` | Status/metadata pills |
| `.eyebrow` | Section labels |

Status chips pair colour with a word (and usually an icon): *High priority*, *Today*, *This week*,
*Keep an eye*, *Good fit*, *Too little sun*.

## States

- **Loading:** `Skeleton` / `PageSkeleton` in `sunken`; 3D scenes show their static SVG fallback.
- **Empty:** helpful, not an error — "Add your first plant to start receiving garden guidance."
- **Error:** plain words plus a next action ("Could not load this farm · Try again").
- **Insufficient data:** say so; never guess (`InsufficientData`).

## Motion

Framer Motion + CSS transitions only. Rise-in on load, 2–4 px hover lift, arrow nudge on CTAs,
height animation on disclosures, gentle 3D sway. All of it respects `prefers-reduced-motion`.

## Honesty rules that shape the UI

Every result shows where it came from (`SourceTags`): demo data, growing guide, live weather,
rule engine, your input. Rule-based output is never labelled "AI". Rooftop growing-guide values
are approximate and cited (`src/data/rooftop-plants.json`); nutrient notes never give doses.

## Language

`src/i18n` (no dependency). Hindi covers onboarding, the shell and the field home; other pages
show a one-line "in English for now" note. `hi.ts` must provide every key (type-checked) and
should be reviewed by a native speaker before release.

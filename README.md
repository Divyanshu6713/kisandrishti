# Kisan Drishti — web prototype

**Intelligent Farming. Better Decisions.**
An interactive web prototype that goes from understanding the farm to analysing it, predicting risks, recommending actions (organic-first), acting on them and improving.

> Prototype honesty: every number comes from **sample farm data** plus a **transparent rule engine**. No trained model is connected yet. The UI labels this everywhere (provenance chips, "simulated score" on disease samples, "Sample forecast").

## Run

```bash
npm install        # .npmrc sets legacy-peer-deps (R3F lists optional Expo peers)
npm run dev        # http://localhost:5240
npm run build      # type-check + production build
npm run preview    # serves dist on 5240 (use --port to change)
```

## 2–3 minute demo

Landing → **Enter the demo farm** starts a guided tour (bottom bar, 8 steps):
Overview → Soil (select N) → Crop Health → Organic (vermicompost for low N/OC) → Disease (pick *Leaf with yellow stripes*, analyse, **Save to field log**) → Risk (disease risk 82 → 97 because of the saved scan) → Farm Advisor (**Add priority actions to plan**) → Overview shows **On track**.
*Reset demo farm* (sidebar) clears saved scans, notes and plan.

## Architecture

```
UI (pages, components, 3D)            src/pages, src/components, src/features, src/three
   │  reads one shared FarmContext    src/hooks/useFarmContext.tsx
   ▼
Services (analysis + recommendation)  src/services/*
   │  farmContextService: records → crop stage → soil → weather → risk → crop health → organic → advisor
   ▼
Repositories (data adapters)          src/services/data/{repository,localAdapter,restAdapter}.ts
   ▼
Datasets (JSON today)                 src/data/*.json   ·   typed contracts in src/models/*
```

| Service | Replace with a model by… |
|---|---|
| `soilAnalysisService` | ranges come from `data/soil-ranges.json` or an API |
| `cropAnalysisService.assessHealth` | same signature, trained crop-health model |
| `riskPredictionService` | `VITE_RISK_MODEL=remote` → `POST /v1/models/risk/predict` (same `RiskInputs`) |
| `diseaseAnalysisService` | `VITE_DISEASE_MODEL=remote` → `POST /v1/models/disease/predict` (224×224 image), or add an ONNX/TF.js `DiseaseClassifier` |
| `organicRecommendationService` | practices + condition tags from the verified organic dataset |
| `recommendationService` (Farm Advisor) | combines all of the above; reports data completeness |
| `assistantService` | `VITE_ASSISTANT=remote` → `POST /v1/assistant` with `buildAssistantContext()` |

Switch data source with `VITE_DATA_SOURCE=rest` and `VITE_API_BASE=https://…` (endpoints listed in `restAdapter.ts`, e.g. a FastAPI backend). The UI never imports JSON or calls `fetch` directly.

Rules the code follows:
- Every analysis returns a `Basis` (factors + source tags) — shown under "What is this based on?".
- Missing inputs return `status: 'insufficient'` → "Insufficient data for a reliable recommendation."
- No doses are prescribed; disease results tell the farmer to confirm with a local agriculture officer / KVK.

## Design system

- Tokens: `src/styles/tokens.css` (warm ivory light theme, earthy charcoal dark theme — designed separately). Tailwind maps every colour to a CSS variable; 3D palettes live in `src/theme/scenePalette.ts`.
- Theme: system preference first, then the user's choice in `localStorage` (`kd-theme`), applied before paint in `index.html`.
- Font: Manrope Variable. Motion: Framer Motion, calm easing, respects `prefers-reduced-motion`.
- 3D (React Three Fiber): hero farm with a wheat plant that turns toward the cursor, a six-stage scroll journey, a soil cross-section, a plant studio and the dashboard field. Every scene goes through `CanvasShell` (lazy-loaded, paused off-screen, single frame under reduced motion, static SVG fallback without WebGL).

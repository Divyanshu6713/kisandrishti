# Kisan Drishti — web prototype

**Intelligent Farming. Better Decisions.**
An interactive web prototype that goes from understanding the farm to analysing it, predicting risks, recommending actions (organic-first), acting on them and improving.

> Prototype honesty: farm numbers come from **sample farm data** plus a **transparent rule engine**. No trained model is connected yet. The UI labels this everywhere (provenance chips, "simulated score" on disease samples, "Sample forecast").
> **Weather is the exception:** the Weather page and the Overview weather card show **live Open-Meteo data** for any place in India, marked "Live" with the time it was fetched.

## Run

```bash
npm install        # .npmrc sets legacy-peer-deps (R3F lists optional Expo peers)
cp .env.example .env.local   # optional — the app runs with no variables (Demo mode)
npm run dev        # http://localhost:5240
npm run build      # type-check + production build
npm run preview    # serves dist on 5240 with the production security headers (use --port to change)
```

## Environment variables

Every `VITE_*` value is compiled into the browser bundle, so it is **public**. See `.env.example`.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Turn on real accounts (Supabase Auth). Leave empty for Demo mode. Use the **anon/publishable** key only. The app refuses a service-role/secret key and falls back to Demo mode. |
| `VITE_DATA_SOURCE`, `VITE_API_BASE`, `VITE_DISEASE_MODEL`, `VITE_RISK_MODEL`, `VITE_ASSISTANT`, `VITE_DEMO_LATENCY` | Existing data/model switches (see *Architecture*). |

Live weather needs **no key**.

## Demo Login (for judges)

1. Open the site and press **Enter the demo farm** (or **Sign in** in the header, or open any `/app/...` link).
2. On the login screen press **Demo Login** (green, labelled DEMO). No account or password is needed.
3. You land on the Overview. The **Live weather** card loads for the default demo location: Karnal, Haryana, the demo farm's district.
4. Press **Change** on that card, or open **Weather**. Then use **Use my location**, or search any Indian village, town, district or 6-digit PIN code.
5. Current conditions, the 7-day forecast and the rule-based farmer insights update for that place. Nothing else on the dashboard reloads.
6. **Log out** is the icon next to *Demo farmer* at the bottom of the sidebar (in the ☰ drawer on mobile).

## Authentication

```
Login page ──► AuthProvider (src/services/auth)
                 ├─ supabase  (VITE_SUPABASE_* set) → Supabase Auth: email/phone + password,
                 │                                   Demo Login = anonymous sign-in, password reset
                 └─ demo      (nothing set)         → Demo Login only; account sign-in switched off
            ──► authStore (src/state/authStore.ts): loading → authenticated | unauthenticated
            ──► <RequireAuth> wraps /app/* — the app shell never renders without a session
```

- **Route protection:** every `/app/*` route sits inside `RequireAuth`. While the saved session is restored, the user sees "Checking your session…". With no session, they go to `/login?next=<page>` and return to that page after signing in. `next` only accepts `/app…` paths, so there is no open redirect. `/login` sends signed-in users to the dashboard.
- **Session:** with *Remember session*, the session is kept in `localStorage` (Demo: 7 days). Otherwise it is kept in `sessionStorage` and ends with the tab (Demo: 8 hours). When a session expires, even mid-use, the user returns to login with "Your session ended". Logging out in one tab also logs out other tabs.
- **Logout** revokes the Supabase session (when Supabase is used) and clears tokens from both storages. It also forgets the weather location, stops the tour and closes panels.
- **Demo mode is not security.** Without Supabase, the Demo session is only a flag in browser storage. It puts the prototype's pages behind a login step, and every piece of data in this mode is bundled public sample data. The login page says account sign-in is switched off, and the user is marked **DEMO**.

### Enabling Supabase

1. Create a Supabase project. In *Project Settings → API*, copy the **Project URL** and the **anon / publishable** key into `.env.local` (and into Render's environment).
2. In *Authentication → Providers*, enable **Email** (and **Phone** for mobile + password). Also enable **Anonymous sign-ins** for the Demo Login button.
3. In *Authentication → URL configuration*, add your site URL and add `https://<site>/login` as a redirect URL for password reset.
4. Protect every table you add with **Row Level Security**, for example by limiting rows to `auth.uid()` and blocking writes from `is_anonymous` users. The route guard only controls the UI; RLS protects the data.

## Live weather

```
Location selector ─┬─ Use my location → navigator.geolocation (only on click; re-uses a fix for 10 min)
                   │                     → lat/lon rounded to 0.01° (~1 km) → BigDataCloud reverse geocode (name only)
                   └─ Search → sanitise + 350 ms debounce + cancel the previous request
                                ├─ name  → Open-Meteo Geocoding (countryCode=IN); exact name → district HQ → population
                                ├─ old names (Bangalore, Gurgaon, Poona…) → current names
                                └─ 6-digit PIN → India Post PIN directory → district/block → Open-Meteo Geocoding
                   ▼
liveWeatherStore (zustand; only weather components subscribe)
                   ▼
liveWeatherService.forecast → Open-Meteo Forecast API (timezone=auto, °C, km/h, 7 days)
   · 10 s timeout · AbortController · one request in flight per place · 10 min cache
   · response shape is validated; anything unexpected is rejected, never displayed
                   ▼
Current conditions + 7-day forecast ──► buildInsights(): rule-based farmer insights
```

- Code lives in `src/services/liveWeather/*` (HTTP, Open-Meteo, geocoding, WMO codes, insights) and `src/state/liveWeatherStore.ts`. The UI is in `src/features/weather/*`.
- **Variables:** current `temperature_2m, relative_humidity_2m, apparent_temperature, precipitation, rain, showers, weather_code, wind_speed_10m, wind_direction_10m, is_day`. Daily `temperature_2m_max/min, precipitation_sum, precipitation_probability_max, sunrise, sunset, wind_speed_10m_max, weather_code`.
- **"Today"** comes from the location's local date (`current.time`), not from the first array entry. Just after midnight, Open-Meteo's daily series can still start on the previous day.
- **Transparency:** every weather block shows "Weather data: Open-Meteo · Updated: <time>" and a **Live** / **Updating** / **Not current** badge.
- **Failures:** the app never shows replacement values. With no data for the place, it shows "Live weather unavailable … Please retry or select another location." and a **Retry** button. If a refresh fails but an earlier response exists for the same place, that response stays on screen as "Last available update: <time>", marked **Not current**.
- **Farmer insights** are hand-written rules in `src/services/liveWeather/insights.ts`; the thresholds are in `THRESHOLDS`:
  - Rain ≥ 60 % or ≥ 5 mm in the next 3 days: postpone irrigation.
  - Daily rain ≥ 64.5 mm (IMD *heavy rain*): check drainage.
  - Dry (< 20 %) and ≥ 35 °C: plan irrigation.
  - Max ≥ 40 °C: heat. Min ≤ 4 °C: frost.
  - Wind ≥ 40 km/h: protect crops. Current wind > 15 km/h: spray drift.
  - Humidity ≥ 85 %: conditions favour fungal disease.

  Each card lists the exact values and the rule, and is labelled *informational, not guaranteed advice*.
- **The demo scenario stays separate.** The frozen demo farm (22 Jan 2026) still uses its bundled sample forecast, because that forecast drives the risk story on the other pages. On the Weather page it sits below the live section, under "Demo farm scenario · sample data".

## Security considerations

- **Secrets:** the frontend holds none. Only public configuration (`VITE_*`) is used, `.env*` files are git-ignored, and a service-role key is refused at startup.
- **Passwords** are never written to storage and are cleared after a failed attempt. After 5 wrong passwords the form pauses for 30 s; Supabase also rate-limits on the server. Password reset gives the same answer whether or not the account exists.
- **Input:** place searches allow only Unicode letters and digits, are trimmed, capped at 60 characters and URL-encoded. Coordinates are rounded to about 1 km before any request. External responses are validated before use.
- **Errors:** users see short plain messages, never stack traces or status codes. Page errors are logged to the console only in development.
- **Headers** are defined in `security-headers.mjs` (used by `vite preview`) and mirrored in `render.yaml`:
  - `Content-Security-Policy`: scripts only from this site. The pre-paint theme script moved to `public/theme-init.js` for this. `connect-src` allows only the weather, PIN, reverse-geocode and Supabase hosts.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
  - `Permissions-Policy`: geolocation for this site only.

  If you set `VITE_API_BASE`, add that origin to `connect-src` in both files.

This is a prototype built with responsible security practices. It is not a hardened production system.

## Known limitations

- In Demo mode, the login only gates the UI. Real data protection needs Supabase (or another backend) with Row Level Security.
- Farmer-entered records (soil tests, notes, plans) still live in this browser's `localStorage` and are not linked to a user account.
- A PIN code resolves to its district (or block, or post office) through the India Post directory before geocoding. The weather is therefore for the nearest matching place, not the exact PIN area, and the result says so.
- Open-Meteo's free API is for non-commercial use (CC BY 4.0; attribution is shown). India Post and BigDataCloud are free public endpoints without an SLA. If BigDataCloud is down, "Use my location" still works and shows coordinates instead of a place name.
- Geolocation needs HTTPS (or localhost).
- The farm analyses (soil, crop, disease, risk) still run on the bundled demo scenario. Only weather is live.

## 2–3 minute demo

Landing → **Enter the demo farm** → **Demo Login** starts a guided tour (bottom bar, 8 steps):
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

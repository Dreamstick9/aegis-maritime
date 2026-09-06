# Aegis Maritime: Fleet Command and Digital Voyage Platform

A locally self-contained web prototype that makes a **quantum-inspired maritime intelligence engine** understandable and defensible: plan a random laden bulk voyage between any two ports of the Arabian Sea, Bay of Bengal and Malacca Strait network (reproducible by seed), run a hybrid multi-objective optimiser in the browser, compare Pareto trade-offs, replay the voyage on a flat 2D chart (light chart or night mode), watch a rolling re-plan when a cyclone forecast shifts, and inspect honest analytics and benchmarks.

Everything runs client-side. No backend, accounts, keys, paid services or live feeds. The engine is a **classical simulation of quantum-inspired heuristics**; it makes no quantum-advantage claim.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. Production build and checks:

```bash
npm run verify   # typecheck + lint + tests + production build
npm run build    # tsc -b && vite build → dist/
npm run preview  # serve dist/
```

Node 22 was used; any Node ≥ 20 should work.

## The journey (for judges)

Every session opens on a **random voyage**: origin and destination are drawn from the port network (about fourteen ports across the chart region, Arabian Sea to the Singapore Strait), together with a cargo from the origin's export list, a departure date and its season. Everything downstream (A* corridors, monsoon fields, the cyclone and its forecast shift, zones, landmarks, captions, watch items, port pages, fleet positions, analytics) is computed for that route. A voyage is reproducible: the same scenario pack and voyage seed always rebuild the same voyage. The seed is shown in the mission panel, in Routes and in Settings (where a seed can be entered and applied); **New voyage** in the mission panel, in Routes or in Settings draws a fresh one. Scenario packs are sets of conditions (season, storm, fuel menu, fleet openness) applied to the current voyage.

1. **Command** (`1`), the chart. Pick a scenario pack at top-left (the Layers tab beside it switches chart or night mode and the overlays), press **Run optimisation**. A* corridors, the QEA/QPSO search and the CVaR ensemble run visibly; the mission panel then shows the plan (fuel, CO₂e, cost, passage), the Pareto chips and one sentence of rationale, with details behind disclosures.
2. **Replay** — press **Play** (or space). The status bar carries simulated time, SOG, fuel, CO₂e, risk and ETA; the caption at the foot of the map narrates the moment from computed state. In the *Cyclone forecast shift* pack the forecast update (its hour is drawn with the voyage and marked on the strip) triggers a rolling re-plan from the live position: the replay pauses, the old track dims, the new track draws, the panel opens the re-plan explanation and the caption states the deltas; press **Play** to continue. **Re-plan** on the bar does the same on demand with the forecast known at that moment.
3. **Results** (`3`) — the Pareto comparison (Balanced, Greenest, Lowest cost, Fastest, Safest vs baseline), the archive scatter, the full "why" narrative and the segment inspector (distance, STW/SOG, current assist, wind/wave, power, fuel, WtW CO₂e, risk); selecting a segment highlights it on the chart.
4. **Routes** (`2`) — the mission builder: cargo, dates, hull and fuel "stops", priorities, safety profile, shore power; the right column shows what the next run will search.
5. **Fleet** (`4`) — the procedural 3-D vessel dossier: rotate, X-ray, click hatches / accommodation / propeller / bow or the region chips to inspect engine, tanks, holds, ballast, bridge and propulsion data; energy and CII projection behind disclosures. The hull is lofted from the vessel's particulars and dressed entirely with generated detail (no model or image assets): name, line mark, draught marks, load line with class letters, hawse pipes and anchors, hatch coamings with side-rolling covers, deckhouse with bridge wings, radar mast and funnel livery, free-fall lifeboat, ensign and port of registry per flag (Indian tricolour, Mumbai and IR class letters for the India-registered hull; Singapore otherwise), on a reflective sea with a chart grid. X-ray shows hopper-shaped holds with the mission ore stow, topside and hopper ballast tanks, double bottom, deep tanks and the engine room.
6. **Ports** (`5`), **Analytics** (`6`), **Settings** (`7`): the voyage's two ports with their limits and scenario operations (facts are sourced for Mormugao and Singapore only, scenario or derived elsewhere, and marked as such); prediction-vs-actual, Pareto front, convergence, breakdowns, scenario comparison and the algorithm benchmark; units, safety thresholds, WtW/TtW, simulation and algorithm controls.

## Architecture

```
src/engine/      pure TypeScript, tested with Vitest
  rng.ts         seeded PRNG + value noise (determinism)
  geo.ts         great-circle geodesy, point-in-polygon, sphere mapping
  fuels.ts       LHV, CF, WtT/TtW factors, price per GJ
  vessel.ts      P = k·V^n + displacement and weather residuals, SFOC curve
  ocean.ts       digital ocean: monsoon wind/current/wave fields + cyclone vortex, forecasts vs truth
  zones.ts       Natural Earth land mask, coast distance, synthetic depth, scenario zones
  corridors.ts   A* (16-direction) with constraints → K candidate corridors + pilotage waypoints
  evaluate.ts    segment-by-segment voyage evaluation, constraints, costs, objectives
  pareto.ts      dominance, NSGA-II sorting/crowding, archive, Monte-Carlo hypervolume
  optimizer.ts   hybrid QEA (Q-registers) + QPSO generator with progress events
  cvar.ts        weather ensemble perturbations and CVaR
  replay.ts      timeline state, track split, events, daily series
  narrative.ts   plan and re-plan explanations from computed numbers
  benchmark.ts   GA, NSGA-II, PSO, A*-sweep comparators on the same evaluator
  cii.ts         IMO CII reference line, required lines, ratings
src/data/        ports, fleet, scenario packs, source ledger, Natural Earth geometry
src/app/         Zustand store, time-sliced optimiser runner and re-plan orchestration
src/components/  chart (flat SVG chart: board with camera, controls and scale bar; theme per mode; layers), vessel (hull.ts lofted hull + layout, textures.ts canvas markings, parts.tsx deck parts, VesselViewer.tsx scene), command strip/panel/drawer/caption, primitives
src/views/       Command, Routes, Results, Fleet, Ports, Analytics, Settings
docs/            RESEARCH_LEDGER.md (sources vs inference vs synthetic), DECISIONS.md
```

Engine story embodied: vessel/voyage/environment input → physics-informed performance → time-dependent digital ocean → A* safe corridors → hybrid quantum-inspired engine (QEA discrete: hull, corridor, fuel, shore power; QPSO continuous: speed profile) → Pareto archive → weather-ensemble CVaR → rolling re-optimisation. Objectives: fuel, cost, well-to-wake GHG, risk (time as a windowed constraint), subject to capacity, speed, ETA, fuel/vessel compatibility and availability, draught/under-keel, zones, engine load and port limits. Fuel comparison is energy- and lifecycle-aware (LHV, engine efficiency, price per GJ, WtT and TtW, tank volume, port availability); shore power compares auxiliary MGO with grid electricity.

## Scenario packs

A pack is a set of conditions applied to the generated voyage (`src/data/scenarios/index.ts`, `buildScenario(packId, voyageSeed)`): *Normal voyage*, *Cyclone forecast shift, rolling re-plan*, *Alternative-fuel comparison*, *Fleet allocation*. Identical pack, voyage seed and settings reproduce identical voyages and results; the fixed reference voyage (Mormugao to Singapore, seed 0) is kept for tests only.

## Data truth

- **Sourced**: IMO LCA framework, MEPC.308(73) carbon factors and LHVs, CII framework, Copernicus wave/physics products, ERA5, GEBCO, EMODnet, Mormugao channel depths, MPA Singapore 2024 statistics, Natural Earth coastlines. See `docs/RESEARCH_LEDGER.md`.
- **Design inference**: lifecycle gCO₂e/MJ defaults, CII parameters, vessel physics coefficients, monsoon climatology, zone geometry.
- **Scenario input / synthetic**: fleet, prices, port congestion and tariffs, storm track, approach waypoints, "actual" voyages, benchmark results.

The UI marks provenance per section and never implies live data.

## Design

Visual world "Signal Green", see `DESIGN.md` and `PRODUCT.md`. Pale green canvas, off-black type and structure, black plates for the chart, the vessel model, charts and the status bar; off-white type on black; a green signal for the plan, the mission vessel, the primary action and the active rail item; alarm red only for computed alarms; progressive disclosure. Geist and Geist Mono (OFL, bundled via `@fontsource-variable`); Phosphor icons; Motion for the camera eases, route draw-in, vessel motion and fades, all honouring reduced motion.

## Limitations (honest)

- The digital ocean, storm and zones are synthetic approximations; no Copernicus/ERA5/AIS/port feeds are connected.
- Lifecycle emission factors are illustrative defaults, not the official IMO/FuelEU tables; CII parameters are reproduced from memory of the resolutions.
- Vessel performance is a simplified admiralty-law model with tuned weather residuals; no hull-specific calibration.
- The 0.25° routing grid needs fixed pilotage waypoints for the straits; waypoints are approximate and not for navigation.
- Benchmarks compare small implementations on a toy problem and say nothing about quantum hardware or real operations.
- Prediction metrics compare the model against a generated "actual", not against real voyages.
- Corridors are searched on a 0.25 degree grid between any two network ports; the narrow straits are covered by fixed pilotage chains, not by the grid.

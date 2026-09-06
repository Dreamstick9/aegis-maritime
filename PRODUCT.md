# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

_(Inferred from the hackathon brief; not interview-confirmed.)_ Primary: a fleet operations officer / voyage planner at a dry-bulk operator, at a desk console, planning and supervising a laden iron-ore voyage (Mormugao → Singapore) and re-planning it when the forecast changes. Secondary: hackathon judges and technical reviewers who must understand and trust a "quantum-inspired maritime intelligence engine" within minutes. Both read dense operational data fluently and distrust decoration.

## Product Purpose

Aegis Maritime is a Fleet Command & Digital Voyage Platform prototype. It turns a vessel/voyage/environment input into a defensible voyage plan: physics-informed vessel performance, a time-dependent digital ocean, A* corridor generation, a hybrid quantum-inspired multi-objective search (QEA discrete choices, QPSO speed profile), a Pareto archive of trade-offs, CVaR weather-ensemble risk, and rolling re-optimisation when forecasts change. Success: a judge can follow mission → optimise → compare Pareto routes → replay a storm re-plan → inspect analytics, and every number is traceable to a labelled source, scenario input or synthetic generator.

## Positioning

The mechanism a neighbouring product could not truthfully copy: one local, reproducible engine that jointly decides vessel, corridor, fuel, shore power and speed profile against fuel, cost, well-to-wake GHG and tail risk, and explains every plan and re-plan in the numbers that produced it. It is explicitly a classical simulation of quantum-inspired heuristics; it makes no quantum-advantage claim and benchmarks itself against A*, GA, NSGA-II and PSO on the same synthetic problem.

## Operating Context

Desktop-first console used at a fleet operations desk; also projected to a judging panel. Each session opens on a randomly generated voyage: origin and destination drawn from a network of about fourteen ports across the chart region (lon 63 to 108, lat -7.5 to 23.5), a cargo from the origin's export list, a random departure date and season. The same pack and voyage seed always rebuild the same voyage; a New voyage action (mission panel, Routes, Settings) draws a new seed, and Settings can reproduce a given seed. Scenario packs (normal voyage, cyclone forecast shift with rolling re-plan, alternative-fuel comparison, fleet allocation) are sets of conditions applied to that voyage, deterministic from the pair (pack, voyage seed). Everything runs client-side: no backend, accounts, keys or live feeds. Coastlines are Natural Earth (public domain); weather, current, storm and zone fields are synthetic; port facts are sourced where stated.

## Capabilities and Constraints

Views: Command (flat 2D chart with light chart and night modes, layers, replay timeline, re-plan narrative), Fleet (procedural 3D vessel dossier), Ports (the voyage's origin and destination from the port network; facts sourced for Mormugao and Singapore, scenario or derived and labelled so elsewhere), Routes (mission builder with any two network ports), Results (Pareto trade-offs, why-selected, segment inspector), Analytics (prediction metrics, Pareto front, convergence, breakdowns, benchmarks), Settings (units, safety thresholds, WtW/TtW, simulation, algorithm controls). Engine code, scenario data, interactivity and data-truth labels are fixed product truth for the redesign. Terminology: WtW/WtT/TtW, CII, UKC, TSS, ECA overlay (scenario), Pareto, CVaR, QEA, QPSO. Undecided: no real AIS/forecast integration in V1; no EEXI computation.

## Brand Commitments

Name: Aegis Maritime (may be refined only if it stays professional). Binding visual direction (user, 5 September 2026, supersedes the earlier "Dark Cockpit" direction; map direction revised by the user on 6 September 2026; colour direction revised by the user on 6 September 2026 from supplied design mocks, superseding the earlier yellow direction): a two-colour identity with **a pale green ground as the main colour and black as the secondary colour**, the signal now green rather than yellow (the selected plan, the mission vessel, the primary action and the active state); no globe: the Command map is a completely flat 2D chart (no tilt, perspective or parallax) with smooth animations, a minimalist map UI with few, small, quiet controls, a light chart mode and a night mode, inspired by the calm information hierarchy of modern boating-chart apps without copying any branding, icons or imagery; "non-slop": no generic dashboard cards, gradients, glass, neon, decorative noise or tiny type. Earlier commitments that still hold: inspiration limited to the information hierarchy and restraint of industrial control products, no third-party branding, assets or affiliation; readable humanist sans at an accessible desktop size with a restrained mono only for data; thin rules, big purposeful blocks, progressive disclosure; Command keeps its dominant map with clear mission context, a decisive primary action, calm status and little permanent UI. Tone: serious, quiet, premium.

## Evidence on Hand

Sourced: IMO LCA framework (MEPC.391(81)), MEPC.308(73) carbon factors/LHVs, CII framework, Copernicus wave/physics products, ERA5, GEBCO, EMODnet, Mormugao channel depths (14.4 m outer / 14.1 m inner), MPA Singapore 2024 statistics — see docs/RESEARCH_LEDGER.md and src/data/sources.ts. Synthetic: fleet particulars, fuel prices, port congestion/tariffs, weather fields, storm track, benchmark data. Absent, never to be fabricated: real vessel tracking, live port availability, validation results, quantum speed-up measurements, SIH wording.

## Product Principles

1. The plan is the product: the chart, routes and re-plan narrative carry the story; chrome recedes.
2. Every number has a provenance and every recommendation an explanation built from computed values.
3. Honest scope beats impressive claims: label synthetic data, name limitations, benchmark fairly.
4. Genuine controls only: every control changes the simulation, the plan or the view.
5. Reproducible by seed: random voyages rebuilt from (pack, voyage seed); deterministic scenario packs.

## Accessibility & Inclusion

Semantic controls, visible focus, keyboard-operable core interactions (navigation, timeline, region selection), reduced-motion mode, labelled data, AA contrast on both grounds (pale green canvas, black plates).

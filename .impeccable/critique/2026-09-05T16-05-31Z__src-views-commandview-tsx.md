---
target: Command view (src/views/CommandView.tsx) and connected views
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-09-05T16-05-31Z
slug: src-views-commandview-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser-evidence sub-agent), synthesized by the build session.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Mission panel shows the archive plan's numerals/ETA after a rolling re-plan while the strip shows the active plan |
| 2 | Match System / Real World | 3 | Caption and strip clocks disagree by up to 29 min (caption quantised to 0.5 h); optimiser progress text is algorithm jargon |
| 3 | User Control and Freedom | 2 | Auto re-plan resumes playback at the current speed; no way to revert a manual re-plan; Esc closes the panel but no key reopens it |
| 4 | Consistency and Standards | 3 | Two yellow "Run optimisation" primaries at rest; `.risk-warn` renders dimmer than a normal numeral |
| 5 | Error Prevention | 3 | "Fastest" plan slower than Baseline with no annotation; Command run button not guarded by mission validity |
| 6 | Recognition Rather Than Recall | 2 | No route/zone symbology legend; priorities shown as letter codes; hotkeys only in tooltips |
| 7 | Flexibility and Efficiency | 3 | Hotkeys, speeds, seek-by-event exist; no URL state; 0.1 h scrub step |
| 8 | Aesthetic and Minimalist Design | 3 | Disciplined ink world; duplicate primary and two-per-line checkbox wrapping in the drawer |
| 9 | Error Recovery | 2 | Raw engine error strings; Risk 0.58 alongside "no advisories" |
| 10 | Help and Documentation | 2 | No legend, no first-30-seconds framing, Risk index unexplained |
| **Total** | | **26/40** | **Acceptable — significant improvements before users are happy** |

## Design Specificity Verdict

**LLM assessment (A, unanchored):** authored for this product, not category-interchangeable — chart-convention route symbology, engine-written nautical events on the scrubber, label-over-numeral conning strip with em-dash ghost state, provenance marks under every block, re-plan narrative built from computed numbers. Stock residues: the rail/panel/bar map-product chassis, Recharts defaults (11 px ticks, legends, off-palette fallback), a generic low-poly hull.

**Deterministic scan (B):** `detect.mjs` over `src/views src/components src/App.tsx` — 2 findings, both advisory `design-system-color`: `src/views/AnalyticsView.tsx:31` (`#e6e9ec` tooltip fallback, off-palette, effectively dead) and `src/components/vessel/VesselViewer.tsx:55` (`#000` three.js emissive "off" — false positive). Grep found dead CSS `.command__source` at 10.5 px. In-page overlay (live-server + detect.js): Command 10 → 1 anti-patterns after the `--ink2` contrast change (nine 4.4:1 low-contrast hits resolved); Results (empty) 2 — ghost numeral unit "plans" at 2.4:1 and a `cramped-padding` false positive on a 32 px flex button; Fleet 13 — nine `text-occlusion` and one `clipped-overflow-container` inside closed `<details>` (unpainted subtrees, false positives), `tight-leading` on the panel subtitle (1.2), `overused-font: roboto` (false positive: the system stack renders in the OS UI face). Measured: smallest visible text 12 px on Command; Recharts ticks at 11 px in Fleet/Results/Analytics; text-2 now 5.11:1 on ink-1; ghost text-3 2.2:1 by design; no console errors after fresh loads; globe canvas black for >8 s after an HMR edit with no loading state.

**Agreement:** A and B independently flagged the 11 px ticks, the missing loading state, and the contrast of `--ink2` (fixed mid-run). B's detector did not see A's P0 (stale panel after re-plan) — a logic defect no scanner catches.

**Visual overlays:** overlays were injected in a separate assessment tab (Command, Results, Fleet) and the live server was stopped afterwards; no overlay remains in the user's tab.

## Overall Impression

A calm, credible operations console whose map, strip and computed narratives are unmistakably this product. The single biggest opportunity is the storm moment: the engine's best argument is hidden behind a collapsed disclosure, contradicted by stale panel numbers, and skipped by auto-resume.

## What's Working

1. The conning strip + event scrubber: label-over-numeral cells, `T+` clocks, ghost state, seekable engine-written events.
2. The mission panel default state — name, four numerals with deltas, plan chips, one computed sentence — matches the brief and stays compact.
3. One visual world across seven views; provenance marks and the Ghost Rule applied consistently.

## Priority Issues

- **[P0] Panel numbers go stale after a re-plan.** Why: contradicts the strip at the moment trust is decided. Fix: derive the lead block from the active plan with carried totals; open the re-plan disclosure by default for a while; pause after an automatic re-plan. Suggested command: /impeccable polish
- **[P1] Two primaries before the run** (panel + strip) and a yellow brand glyph. Fix: one primary in the strip; panel button outline; glyph in text-1. /impeccable quieter
- **[P1] Warn tone invisible; Risk contradicts Watch.** Fix: warn = brighter text plus a word ("elevated"), red only for computed breach; Watch lists the risk driver whenever the index is elevated. /impeccable clarify
- **[P1] Panel covers Singapore at 1440 px; bottom sheet mispositioned below 1100 px.** Fix: bias the camera target when the panel is open; scope `bottom:auto` to wide viewports (the latter was fixed during the run). /impeccable adapt
- **[P2] No symbology legend; label collisions; stale caption phase.** Fix: line samples in the Layers drawer; hide the vessel label near ports; derive the phase from state. /impeccable clarify
- **[P3] Type/contrast leaks:** 11 px ticks, `.scrub__day`/`.drawer__group` in text-3, two clocks. /impeccable typeset

## Persona Red Flags

**Alex (power user):** no URL state for scenario/plan/time; keys cover 1–7, Space, Esc only; Pareto alternatives unlabelled on the map; segment highlight needs Results; scrub step 0.1 h; manual re-plan cannot be reverted.

**Sam (screen reader / keyboard):** caption `aria-live` re-announces every 0.5 sim-hours; Risk explanation only in a `title` on a div; panel re-opens on status change without moving focus; Command lacks an `h1`; text-3 at 2.2:1 for scrub days and drawer group headings. Positives: native details, aria-pressed, aria-valuetext, progressbar role, visible focus.

**Hackathon judge (project persona):** no orientation on the first screen; "Fastest" slower than Baseline and "Safest" riskier than Baseline without explanation (the baseline and classical references are not in the archive); Analytics leads with R² 1.00 before the synthetic caveat; the storm moment flashes past at 16×.

## Minor Observations

Yellow also carries links (a fourth meaning); deltas lack direction words; "Balanced · Greenest" reads as one merged name; Ports has a provenance mark under every stat; Analytics duplicates the phase chart with a table; hull switcher uses a text "▾" where the drawer uses an SVG chevron; `.command__source` dead CSS.

## Questions to Consider

1. If the baseline is faster and lower-risk than every optimised plan, what one sentence tells the officer what the engine bought and paid for?
2. Should the cockpit ever resume the world by itself at the only moment the product argues for its existence?
3. Is "Risk 0.58" actionable without a word and a cause beside it?

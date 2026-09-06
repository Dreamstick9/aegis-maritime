---
target: Command view (src/views/CommandView.tsx) and connected views — acceptance cycle 2
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-05T17-03-37Z
slug: src-views-commandview-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser-evidence sub-agent), synthesized by the build session; second acceptance cycle.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Panel sentence/facts described the superseded plan after a re-plan (fixed this cycle); WebGL context loss was silent (fixed) |
| 2 | Match System / Real World | 3 | Letter-code priorities, "registration", "Q-individuals" (priorities spelled out this cycle) |
| 3 | User Control and Freedom | 3 | Auto re-plan pauses; manual re-plan not revertible; Space/Escape leaked across views (fixed) |
| 4 | Consistency and Standards | 2 | Red zone labels at rest and eight yellows on Routes (both fixed); primary button in four heights (fixed) |
| 5 | Error Prevention | 3 | Strip run button not guarded by mission validity; infeasible mission now explained (added) |
| 6 | Recognition Rather Than Recall | 3 | Legend added; hotkeys only in tooltips |
| 7 | Flexibility and Efficiency | 3 | Hotkeys, speeds, seek-by-event; no URL state; 0.1 h scrub step |
| 8 | Aesthetic and Minimalist Design | 3 | Seven map labels at rest with collisions (zone labels now zoom-gated); drawer covered the caption (fixed) |
| 9 | Error Recovery | 3 | NoFeasiblePlan state is actionable; Retry exists; context-loss now recoverable |
| 10 | Help and Documentation | 2 | No first-30-seconds framing beyond the tagline (one orientation sentence added) |
| **Total** | | **28/40** | **Good — address weak areas, solid foundation** |

## Design Specificity Verdict

**LLM assessment (A):** authored, not category-interchangeable — engine-written nautical events on the scrubber, chart-convention symbology with a matching legend, label-over-numeral conning strip with risk bands stated as words, computed narratives, provenance marks, procedural hull. Residues: Recharts legend defaults, a few inline-styled one-offs, "(scenario)/(approx.)" parentheticals in map labels (removed this cycle).

**Deterministic scan (B):** `detect.mjs` over `src/views src/components src/App.tsx` — 1 advisory (`#000` three.js emissive fallback, false positive), 0 non-advisory. In-page overlay: Command idle 1 group (font false positive, Ghost-Rule em-dashes); Command after run: real `text-overflow` on the Elapsed and To-arrival cells at 1440 (fixed: unit on its own line, shorter units), D0/D9 day labels under the rail/edge (fixed: clamped); Results/Routes/Settings: over-long `p.small.muted` measures (fixed: 72ch); Fleet/Settings `cramped-padding` false positives (32–36px flex buttons); `text-occlusion` false positives inside closed disclosures. Measurements: nothing below 12px at 1440 or 900; all sampled text ≥ 5.1:1; no horizontal overflow; zero focusables without a name; keyboard: Space toggles replay from the body, not from a focused summary; Escape closes the panel and focuses the reopen button; 0 console errors on every route at both widths.

**Agreement:** A and B both flagged the red-at-rest zone labels (A) / yellow over-use on Routes (B counted five yellow stops) — both fixed; B's truncation finding was invisible to A's DOM-only pass; A's stale-sentence finding is a logic defect no scanner catches.

## Overall Impression

The instrument grammar is real and owned, and the storm re-plan is now the product's best moment: the world stops, the old track dims, the panel and caption agree on the plan being sailed and its price. Remaining softness is in discoverability (hotkeys in tooltips, no deep links) and a few density decisions.

## What's Working

1. Conning strip + engine-written event scrubber + computed captions.
2. Yellow discipline where the map or hull is the instrument (1 at rest, 4 after a run).
3. Honesty architecture: provenance marks, "sensitivity, not validation", seed/evaluations/compute visible, benchmark disclaimers, NoFeasiblePlan with reasons.

## Priority Issues (all addressed in this cycle unless noted)

- **[P1] Panel contradicted itself after a re-plan** — sentence and facts now derive from the active plan with carried totals; "Original selection — why" demoted. /impeccable polish
- **[P1] Red zone labels at rest** — labels grey; zones red only when the active plan enters one. /impeccable quieter
- **[P1] Eight yellows on Routes** — multi-select stops and segmented options now off-white. /impeccable quieter
- **[P2] Storm beat readability** — disclosure trimmed to two paragraphs with the full text in Results; drawer no longer covers the caption; zone labels zoom-gated. /impeccable layout
- **[P2] Hotkeys leaked across views; 7px timeline targets** — Space/Escape scoped to Command; 24px hit areas via pseudo-element. /impeccable harden
- **[P2] Silent states** — context-loss "Restore map"; draught cell states "tidal window"; live region for re-plan/arrival. /impeccable harden
- **[P3] Open:** URL deep links; manual re-plan revert; Recharts legend order. /impeccable harden

## Persona Red Flags

**Alex:** no URL state; manual re-plan not revertible; 0.1 h scrub step. **Sam:** live region now announces re-plans and arrival only; Risk explanation still in a title (band word added to the cell). **Judge:** orientation sentence added; the storm moment pauses; "Safest" label now only when it buys a real risk reduction.

## Minor Observations

Recharts legends read in reverse order; 14/14.5px caption sizes carry most secondary text (documented caption step); the Routes composition column is long at 900px (single column, sticky consequence lost).

## Questions to Consider

1. Should the plan chips and the compare table share one "active plan" notion after a re-plan, or is the archive plan the right anchor for comparison?
2. Would a URL that encodes scenario, plan and replay time make the storm moment a shareable artefact for judges?
3. Is a 0.1 h scrub step right for a 9-day voyage, or should arrow keys move by the hour?

---
version: 1
slug: "src-views-commandview-tsx"
primary_target: "src/views/CommandView.tsx"
related_targets: ["src/components/chart/ChartBoard.tsx","src/components/command/Strip.tsx","src/components/command/Inspector.tsx"]
---

# Surface brief — Command (src/views/CommandView.tsx)

Scope: the Command route (map + replay) of Aegis Maritime. Visitor mode: Operate.

Audience & job: fleet operations officer supervising a laden Mormugao → Singapore voyage; judges following mission → optimise → compare → replay → analyse.

Task: see the plan on the ocean, run the optimiser, replay the voyage, understand a rolling re-plan.

Content/proof: computed plan (corridor, speeds, fuel/CO2e/cost/ETA/risk), digital-ocean fields, storm forecast vs truth, re-plan explanation from computed numbers.

Constraints: engine, scenario packs and interactivity unchanged; provenance labels preserved; keyboard-operable timeline; reduced motion.

Direction: "Signal Yellow" (third world, 5 September 2026): yellow canvas, black structure; the map is a projected SVG chart on a tilted 2.5D black plate (Motion entrance, route draw-in, parallax, zoom and pan); the mission panel is a yellow column beside the plate; the status bar is black. Default panel state unchanged: plan name, four metrics, plan control, one sentence; everything else behind disclosures.

Memorable moment: the T+36 h forecast update. The old track dims to grey dash, the yellow track draws itself in from the live position, one sentence at the foot of the plate explains why in the plan's own numbers.

Unresolved: none blocking.

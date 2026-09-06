---
name: Aegis Maritime
description: Signal Green maritime operations console. Pale green canvas, black structure and data plates, one flat 2D chart with a light and a night mode, Geist type, motivated motion.
colors:
  ground-0: "#f4fbec"
  ground-1: "#e8f5db"
  ground-2: "#dcefc9"
  signal-fill: "#bfe7a2"
  signal-ink: "#cbe9ab"
  signal-bright: "#8fd66e"
  black-0: "#151614"
  black-1: "#1c1d1a"
  black-2: "#24251f"
  black-3: "#313329"
  on-ground-0: "#151614"
  on-ground-1: "rgba(21, 22, 20, 0.82)"
  on-ground-2: "rgba(21, 22, 20, 0.64)"
  on-ground-3: "rgba(21, 22, 20, 0.42)"
  rule-on-ground: "rgba(21, 22, 20, 0.16)"
  rule-strong-on-ground: "rgba(21, 22, 20, 0.34)"
  control-on-ground: "rgba(21, 22, 20, 0.62)"
  on-black-0: "#f4f4ef"
  on-black-1: "#d5d6d1"
  on-black-2: "#a3a3a0"
  on-black-3: "#5c5d5a"
  rule-on-black: "rgba(244, 244, 239, 0.12)"
  control-on-black: "rgba(244, 244, 239, 0.46)"
  alarm-on-ground: "#a8261c"
  alarm-on-black: "#ef4b3f"
  plate: "#101210"
  land: "#2a2a2d"
  coast: "#5a5750"
  water-chart: "#d3e6f2"
  land-chart: "#f4f1e7"
  coast-chart: "#b8ae98"
typography:
  display:
    fontFamily: "'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  numeral:
    fontFamily: "'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  body:
    fontFamily: "'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.96875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0"
  caption:
    fontFamily: "'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0"
  data:
    fontFamily: "'Geist Mono Variable', SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
rounded:
  all: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "64px"
components:
  button-primary-on-ground:
    backgroundColor: "{colors.black-0}"
    textColor: "{colors.signal-ink}"
    rounded: "{rounded.all}"
    padding: "0 22px"
    height: "46px"
  button-primary-on-black:
    backgroundColor: "{colors.signal-fill}"
    textColor: "{colors.black-0}"
    rounded: "{rounded.all}"
    padding: "0 22px"
    height: "46px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "currentColor"
    rounded: "{rounded.all}"
    padding: "0 16px"
    height: "38px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.on-ground-0}"
    rounded: "{rounded.all}"
    padding: "0 12px"
    height: "40px"
  panel:
    backgroundColor: "{colors.ground-0}"
    textColor: "{colors.on-ground-0}"
    rounded: "0px"
    padding: "26px 26px 28px 28px"
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.on-black-0}"
    rounded: "{rounded.all}"
    padding: "0"
---

# Design System: Aegis Maritime

## Overview

**Creative North Star: "Signal Green"**

The page is a quiet, pale ground and the instrument is black. Aegis Maritime works on a pale green ground; black is structure, type and every data plate (the chart, the vessel model, the charts, the status bar). On black, the one green thing is the plan: the selected route, the mission vessel, the primary action. The register is industrial operations software with a graphic identity: two colours, one sans, sharp corners, big type, thin rules, and a single flat chart that carries the whole story. The inspiration is the hierarchy and restraint of serious control products; no third-party branding, imagery or affiliation is used or implied.

Typography is Geist at a comfortable desktop size; Geist Mono appears only for coordinates, seeds, logs, chart labels and dense tables. No gradients, glass, glow, neon, decorative noise, KPI cards, badge pills or tiny type.

**Key Characteristics:**
- Two grounds, one grammar: pale green canvas with black type; black plates with off-white type. The same components read their colours from the surface they sit on.
- The chart is a completely flat 2D chart, not a globe and not a tilted plate: a black night chart by default, a light nautical chart on demand, the camera eases, the route draws itself in, everything else is still. Its controls are few, small and quiet, in the manner of modern boating-chart apps (their calm hierarchy, none of their branding).
- Progressive disclosure: one panel column, a drawer, a status bar; details behind summaries.
- All corners 2px; rules are 1px; the only heavy rule is the 2px black line under a view title.
- Motion is motivated and exponential ease-out; reduced motion removes all of it except state changes.

## Colors

Two colours and their tints. Single theme by design (`color-scheme: light`): the pale green ground is the brand, so there is no dark mode; the black plates already carry the dark register where data is read.

### Primary
- **Ground 0** (#f4fbec): the canvas and the panel column, carrying a soft diagonal wash on the body from #eff8e4 through #f7fcf1 to #ffffff. **Ground 1/2** (#e8f5db, #dcefc9): hover and pressed on the pale ground.
- **Signal green**, three tones for three roles: **fill** (#bfe7a2) is the primary action on black, the active rail item and the replay playhead; **ink** (#cbe9ab) is type on a black block, so the primary action on the pale ground, selected chips and hull rows; **bright** (#8fd66e) is the brand shield, the mission vessel on the chart and the chart accent lines.

### Secondary
- **Black 0** (#151614): type on the pale ground, the rail, the status bar, the primary action on the pale ground, selected blocks (chips, table headers, hull rows). **Black 1/2/3**: black-plate hover and pressed tones. The chart's own materials come from `THEMES[mode]` in `src/components/chart/theme.ts`: in **chart** mode pale water (#d3e6f2) with a soft shelf tint (#c6dbe9) near the coast, sand land (#f4f1e7) and a hairline coast (#b8ae98), black ink; in **night** mode the **Plate** (#101210), **Land** (#2a2a2d) and **Coast** (#5a5750) with off-white ink. No layer hard-codes a colour.

### Tertiary
- **Alarm red** (#a8261c on the pale ground, #ef4b3f on black): only for a limit the engine computed as violated, a storm core, or an error state. Never for emphasis.
- **Regulatory magenta** (#a23b8f on the light chart, #d26bc1 on the night plate): the chart's own convention colour for rules on the water: restricted-area outlines and hatching, traffic separation schemes and their lane chevrons, emission-control overlays and the labels of those zones. It is the one chart-convention exception to the two-colour rule, confined to the chart plate and the legend swatches that mirror it; it never appears on controls, in panels or as emphasis.

### Neutral
- **On ground 0 to 3**: black at 100 / 82 / 64 / 42% (4.5:1 holds down to on-ground-2). **On black 0 to 3** (#f4f4ef, #d5d6d1, #a3a3a0, #5c5d5a): primary, secondary, labels, ghost. Ghost tones are never used for information.

### Named Rules
**The Two-Ground Rule.** Every component reads `--ink*`, `--hair*`, `--signal` and `--bg` tokens; `:root` binds them for the pale green ground and `.on-k` rebinds them for black plates. A component never hard-codes a ground colour.
**The Signal Rule.** On black, green marks the selected plan, the mission vessel, the primary action and the active rail item. On the pale green ground, the same roles are black blocks with green type. On the light chart the plan is the one black line and the mission vessel the one green mark. If two signals compete, one is wrong.
**The Alarm Rule.** Red appears only when the engine computed a breach. Restricted areas are hatched in regulatory magenta at rest and turn red (red hatch, red outline, a faint red fill) only when the active plan enters one.
**The Regulatory Rule.** Regulatory magenta belongs to the chart and to nothing else: restricted, TSS and ECA zone outlines, hatching, chevrons and zone names. Charts have always drawn rules in magenta so mariners read the hue before the label; the product borrows that convention and nothing else. Anything that is not a rule on the water stays in the two colours.
**The Ghost Rule.** Absence is drawn as "···" in a ghost tone or as a labelled empty block; never a blank void, never a dash.

## Typography

**Display/Body Font:** Geist (variable, bundled locally)
**Data Font:** Geist Mono (variable, bundled locally), secondary only

**Character:** Plain-spoken and confident. Weight and size carry hierarchy; labels are normal-case; no uppercase eyebrows; no italic display; no mixed families inside a line.

### Hierarchy
- **Display** (600, 2.5rem / 40px, 1.0, −0.03em): view titles.
- **Headline** (600, 1.5rem / 24px, 1.15, −0.02em): panel titles, section titles.
- **Numeral** (600, 2rem / 32px, 1.0, tabular): lead metrics; the status bar sets 26px and the panel lead 30px.
- **Body** (400, 15.5px, 1.55): everything readable; measure ≤ 68ch.
- **Caption** (400, 14px, 1.5): secondary rows, table cells, control hints; never below this for readable text.
- **Label** (500, 13px, normal case, on-*-2): the word above a numeral, table heads, drawer groups.
- **Data** (mono 400, 13px, tabular): coordinates, seeds, logs, chart text (12px on the plate, counter-scaled so it never shrinks with zoom).

### Named Rules
**The Twelve Rule.** No text below 12px anywhere, including the plate; body and controls at 15px or more.
**The No-Dash Rule.** User-visible copy uses commas, colons and full stops; no em- or en-dashes, no middle-dot separators, no arrows.

## Layout

Fixed viewport shell with a 64px black rail. Command and Fleet are a two-column grid over a black status bar: the stage (with 22px pale green margins around the plate) and, when open, a 420px pale green panel column (380px under 1250px). Other views: a single 1320px column with a 40px-above / 32px-below section rhythm and 1px rules between sections; two-column "composition / consequence" on the mission builder. Spacing scale 4/8/16/24/40/64. Under 1100px the panel becomes a pale green sheet over the stage with a 3px black top rule; under 900px the status bar stacks to two rows.

## Elevation & Depth

The chart is flat. It fills the stage inside the 22px pale green margin (18px at the foot) as a 2px-cornered plate with no perspective, no tilt and no parallax; the only depth cue is the plate's green-tinted shadow (rgba(26,45,18)) that separates it from the pale green ground. Everything else is flat: black blocks over the chart are solid at 94%; panels have no shadow.

### Named Rules
**The One Plate Rule.** Only the chart plate (and the vessel canvas, which mirrors it) carries a shadow. Nothing tilts, floats or blurs; the chart is a flat map, not a 3D object.

## Shapes

All-sharp system: 2px radius on every control, block and plate; 0px on page sections and the status bar. Rules are 1px, except the 2px title rule. Chart symbology per mode. **Chart** (light): plan solid black with a pale casing, travelled a soft black, baseline dashed grey, classical solid grey, alternatives faint grey, superseded dashed and fading, waypoints open circles, the voyage's origin and destination as open rings with a dot, every other port a 4px dot with a water casing, the mission vessel a small round green mark with a black stroke and a heading tick, fleet units small filled grey hulls with a 1px water casing. **Night** (black plate): plan solid green, travelled solid off-white, the vessel a green mark with a plate-coloured stroke; greys become off-white tints. In both, the graticule is faint, labels are few, and alarm red appears only for a computed breach or the storm core.

Zone symbology is the same in both modes and follows chart convention. **Restricted areas:** a 1.5px solid regulatory outline over a diagonal hatch (1px lines every 2.2 chart units, so the pitch scales with zoom and stays airy); breached ones turn alarm red with a faint red fill. **Traffic separation schemes:** a 1.2px dashed regulatory outline, a 6% regulatory fill and, from 2.5x zoom, two lanes of small chevrons along the polygon's long axis in opposite directions, each lane on the starboard side of the line. **Emission-control overlays:** a 1px dashed regulatory outline at 70%, no fill, labelled "ECA". **Shallow water:** the shallow tint at 70% inside a dotted ink outline with the depth printed as "9 m". **Anchorages:** a faint fill and a small anchor glyph at the centroid. Zone names are short (the provenance suffixes and generic tails are stripped: "Andaman & Nicobar", "Palk Strait", "Malacca TSS"), 12px mono in regulatory magenta (ink for shallow water), sit at the polygon's centroid (or on the water along its long axis when the centroid falls on land) and are drawn only when they fit inside the polygon on screen; otherwise the zone shows a 4px dot and its name lives in the hover chip.

## Motion

Motion (`motion/react`) owns everything that animates; CSS transitions handle hover and state (180ms). Ease `cubic-bezier(0.16, 1, 0.3, 1)`.

- **Camera eases:** control and keyboard zooms ease to the cursor over 450ms, double-click zoom over 600ms, keyboard pans over 300ms, fit-to-route and reset over 700ms; wheel and pinch track the pointer directly; drag pans carry a short inertia after release; follow-vessel nudges the camera toward the vessel frame by frame with an exponential approach; the mode switch cross-fades the chart over 400ms.
- **Route draw-in:** the remaining track draws from the vessel to the destination over 1.2s whenever a plan begins (first plan and every re-plan).
- **Superseded route:** fades from 95% to 30% over 2.6s.
- **Vessel motion:** the mission vessel moves on the animation frame with smoothed position and heading; when follow is on the camera keeps it in the inner fifth of the view.
- **Caption presence:** the replay caption slides up 8px and fades over 220ms.
- **Panel presence:** slides 24px and fades over 420ms.
- **Storm:** the only loop, a slow rotation of the spiral arms.
- **Reduced motion:** no camera eases, no draw-in, no fade, no vessel smoothing, no storm rotation, no hull rotation, no CSS transitions; state changes still apply instantly.

## Components

### Buttons
- **Primary:** on the pale ground, black fill with green text; on black, green fill with black text. 46px, 15px/600. Hover deepens; `:active` translates 1px; focus 2px outline in the ground's opposite colour, offset 2px.
- **Outline:** 38px, current colour, control-tone border; hover fills with the ground's hover tint.
- **Selected (`is-on`):** the primary block at outline size.
- **Danger:** alarm text on an outline button, never a red fill.

### Status bar cells
- 13px label above a 26px numeral with a unit; separated by rules on black. The risk cell states its band in words (nominal / elevated / critical); "critical" turns the numeral alarm red.

### Mission panel / dossier
- Pale green column, 26px padding; headline, four lead numerals, plan chips, one sentence; everything else behind disclosures with a Phosphor caret. Under 1100px a sheet with a 3px black top rule.

### Inputs
- Transparent with a control-tone border, 40px; range inputs are a 2px rule with a 4px black thumb. Checkboxes fill black when checked. Segmented options fill with the ground's ink (black on the pale ground, off-white on black). Multi-select stops fill black with green text when on.

### Navigation (rail)
- 64px black rail; 22px Phosphor glyphs in on-black-2; hover on-black-0 on black-2; active is a green block with black glyph; keys 1–7; the brand shield is green.

### Stage overlays (Command)
- One row at top-left: the scenario select and the Layers tab, black blocks 40px tall with an 8px gap; nothing else at top-left. Top-right: the "Mission" block only while the panel is closed. Bottom-left: the replay caption (480px max, 13px kicker, 15px body, 14px 16px padding) sits above the scale bar. Overlays take pointer events only on themselves, so drags between them reach the chart.

### Layers drawer
- A compact black block (268px, scrolls past its max height) hanging under its tab. Groups: Chart (a Chart / Night segmented control and "Follow vessel during replay"), Routes, Zones, Ocean, Marks, then the active-plan legend, the zone symbology legend (restricted hatch, TSS, ECA, shallow water) and the provenance line. Every sample is drawn in the active theme's colour on a chip of that mode's water, so the legend matches the chart in both modes. Escape and an outside press close it without touching the mission panel.

### Chart (signature)
- A flat, projected SVG chart filling the stage in one of two modes; graticule every 5° with 12px mono labels; Natural Earth land with a hairline coast and a soft shelf tint; zones per the zone symbology above (regulatory magenta, hatched restricted areas, TSS chevrons, shallow depths); wind, current and sea-state glyphs on a coarse grid, thinned at low zoom; storm forecast track, core ring (alarm) and envelope; routes per the symbology above; all marks and type counter-scaled to constant pixel size. Camera: wheel and pinch zoom to the cursor from 1× to 8×, drag pan with inertia, double-click zoom, keyboard (+ − 0 arrows, f to fit, v to follow).
- **Hover chip:** any zone, port, fleet unit, the mission vessel, the storm core or a waypoint shows a small black chip 14px right and below the cursor (flipped inside the stage): a 13px sans title over 12.5px mono lines, 260px at most, 2px corners, no shadow, never a pointer target. Zones state their kind, depth, provenance and note; ports their country, berth depth and how many fuels they offer; fleet units status, speed and destination; the vessel its SOG, heading and segment risk; the storm its Vmax, Rmax and forecast issue time. Reduced motion removes the 120ms fade.
- **Port labels:** at 1x only the voyage's origin and destination are labelled (open ring, 12px mono upper case); other ports gain their label from 1.8x.
- **One label pass:** every moving label (endpoint ports, the mission vessel, the storm, other ports, fleet units) is placed by a single greedy pass in priority order (endpoints, vessel, storm, other ports, fleet) over four anchors around its mark (right-below, right-above, left-below, left-above). A label never overlaps another label, a mark, a zone label or a graticule label, and never crosses the visible edge: fleet labels and minor port labels are dropped when nothing fits, the vessel and endpoint labels are clamped inside the view, the storm label shortens to "Scenario-07, 52 kn" before that. Marks outside the view carry no label. Zone labels stay inside their polygons and act as fixed obstacles.

### Vessel canvas (Fleet)
- The one 3-D surface, on the black plate like the chart. A lofted bulk-carrier hull with black satin topsides, red boot-top and antifouling, a green-grey deck and an off-white deckhouse; the only signal green is the line's funnel band, the free-fall lifeboat and the selected region. Markings (name, line mark, draught marks, load line, transom name and port of registry) are drawn from the vessel record; the ensign and port follow the flag (Indian tricolour and Mumbai for the India registry). The sea is a dark planar reflection with a faint 10 m / 50 m chart grid fading into the plate; callouts are 12px mono labels; x-ray dims the hull and shows hopper-shaped holds, tanks and the ore stow. No image assets, no post-processing, no glow.

### Chart controls and scale bar
- Bottom-right, one narrow black column of small icon buttons: zoom in, zoom out, fit route, follow vessel (pressed state green), chart or night mode. Bottom-left: a mono scale bar in nautical miles with a cursor position readout. Both are the chart's own; the view adds nothing next to them.

## Do's and Don'ts

### Do:
- **Do** keep the chart dominant on Command; every overlay must earn the chart it covers, and controls stay few, small and quiet.
- **Do** read colours from the ground tokens; never hard-code a ground.
- **Do** spend green-on-black on the plan, the vessel, the primary action and the active rail item only.
- **Do** set body and controls at 15px or more and numerals large; mono only for data.
- **Do** put detail behind disclosures with counts in the summary.

### Don't:
- **Don't** add a third colour, a gradient, glass, blur, glow, a decorative shadow, or any tilt, perspective or parallax on the chart.
- **Don't** build grids of KPI cards, badge pills per value, or uppercase eyebrows.
- **Don't** animate anything the user did not cause, except the storm and the route draw-in.
- **Don't** write dashes or middle dots into copy.
- **Don't** reference or imitate any third-party product's branding or imagery.

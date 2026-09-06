# Research and source ledger

This ledger separates three kinds of content in Aegis Maritime:

- **Sourced** — a published fact, with the link it was read from and the date it was checked (5 September 2026).
- **Design inference** — a value chosen inside a published range or derived from sourced numbers; plausible, not measured.
- **Scenario input / synthetic** — invented for the demonstration and labelled as such in the UI.

Nothing in the product is live data. No real vessel positions, port availability, forecasts or validation results are used or implied.

## Sourced facts

| # | Fact used in the product | Source (checked 2026-09-05) |
|---|---|---|
| 1 | The IMO lifecycle framework splits fuel emissions into well-to-tank ("from primary production to carriage of the fuel in a ship's tank"), tank-to-wake ("from the ship's fuel tank to the exhaust") and well-to-wake; covers CO₂, CH₄ and N₂O as CO₂-equivalent on GWP100; 2024 Guidelines adopted as resolution MEPC.391(81). | IMO, "IMO framework on life cycle GHG intensity of marine fuels (LCA)": https://www.imo.org/en/OurWork/Environment/Pages/Lifecycle-GHG---carbon-intensity-guidelines.aspx ; resolution text: https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.391(81).pdf |
| 2 | Carbon factors and lower calorific values: HFO 3.114 t CO₂/t and 40,200 kJ/kg; LFO 3.151; MDO/MGO 3.206 and 42,700 kJ/kg; LNG 2.750 and 48,000 kJ/kg; methanol 1.375 and 19,900 kJ/kg. | IMO resolution MEPC.308(73), 2018 EEDI calculation guidelines: https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.308(73).pdf |
| 3 | CII is an operational carbon-intensity rating A–E; EEXI and CII entered into force on 1 January 2023; ships rated D for three consecutive years or E must develop a plan of corrective actions. | IMO, "Improving the energy efficiency of ships": https://www.imo.org/en/OurWork/Environment/Pages/Improving%20the%20energy%20efficiency%20of%20ships.aspx |
| 4 | Copernicus Marine Global Ocean Waves Analysis and Forecast: 1/12° (0.083°), hourly, 10-day forecast, significant wave height/period/direction from the MFWAM model; free and open. | https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_WAV_001_027/description |
| 5 | Copernicus Marine Global Ocean Physics Analysis and Forecast: 1/12°, eastward/northward velocities, temperature, salinity, sea surface height; 10-day forecast; Mercator Ocean; free and open. | https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/description |
| 6 | ERA5 single levels: fifth-generation ECMWF reanalysis, 0.25° atmospheric grid, hourly, 1940 to present, 10 m wind components, significant wave height, mean wave period; CC-BY licence. | https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview |
| 7 | GEBCO gridded bathymetry: 15 arc-second global terrain model, public domain, annual releases. | https://www.gebco.net/data-products/gridded-bathymetry-data |
| 8 | EMODnet Bathymetry: harmonised European DTM at 1/16 arc-minute (≈115 m), free access, biennial update. | https://emodnet.ec.europa.eu/en/bathymetry |
| 9 | EU THETIS-MRV publishes per-ship annual fuel consumption, CO₂ emissions, distance, time at sea and energy-efficiency indicators under Regulation (EU) 2015/757. | https://mrv.emsa.europa.eu/ |
| 10 | Mormugao: outer channel 14.4 m, inner channel 14.1 m; capital dredging planned to ≈19.8 m in the approach channel and ≈19.5 m alongside at least four berths to receive Capesize vessels; Berth 9 (former mechanical ore handling plant) redevelopment. | Maritime Gateway: https://www.maritimegateway.com/mormugao-port-to-deepen-channel-redevelop-berth-9-for-capesize-vessels/ ; India Shipping News: https://indiashippingnews.com/mormugao-ports-berth-9-gets-clearence-for-re-development/ (trade press reporting Mormugao Port Authority) |
| 11 | Singapore 2024: vessel arrival tonnage 3.11 billion GT; bunker sales 54.92 million tonnes; alternative bunker fuels 1.34 million tonnes; container throughput 41.12 million TEU. | Maritime and Port Authority of Singapore: https://www.mpa.gov.sg/media-centre/details/strong-growth-momentum-for-maritime-singapore |
| 12 | Coastlines: Natural Earth 1:110m (global) and 1:50m (clipped to lon 55–125 E, lat 20 S–35 N) land polygons, public domain. | https://www.naturalearthdata.com/ (files fetched from the natural-earth-vector repository; see `scripts/clip-natural-earth.mjs`) |
| 13 | Quantum-inspired evolutionary algorithm: Q-bit probability-amplitude representation with observation and rotation-gate update. | Han & Kim, IEEE Trans. Evol. Comput. 6(6), 2002, https://doi.org/10.1109/TEVC.2002.804320 |
| 14 | Quantum-behaved particle swarm optimisation: mean-best attractor and contraction–expansion coefficient. | Sun, Feng & Xu, IEEE CEC 2004, https://doi.org/10.1109/CEC.2004.1330875 |
| 15 | NSGA-II non-dominated sorting and crowding distance. | Deb, Pratap, Agarwal & Meyarivan, IEEE Trans. Evol. Comput. 6(2), 2002, https://doi.org/10.1109/4235.996017 |
| 16 | Conditional value-at-risk as a coherent tail-risk measure. | Rockafellar & Uryasev, Journal of Risk 2(3), 2000, https://doi.org/10.21314/JOR.2000.038 |
| 17 | A* shortest-path search with an admissible heuristic. | Hart, Nilsson & Raphael, IEEE Trans. SSC 4(2), 1968, https://doi.org/10.1109/TSSC.1968.300136 |
| 18 | FuelEU Maritime reference value of 91.16 gCO₂e/MJ used to sanity-check the illustrative WtW factors. | Regulation (EU) 2023/1805: https://eur-lex.europa.eu/eli/reg/2023/1805/oj |

Not fetched during research: the NGA World Port Index (https://msi.nga.mil/Publications/WPI) returned HTTP 503; it is cited as the intended production source for port characteristics but no WPI value is used. NOAA/BOEM MarineCadastre AIS (https://hub.marinecadastre.gov/pages/vesseltraffic) is referenced as an AIS archive; no AIS data is used.

## Design inference (plausible, not measured)

| Item | Where | Basis |
|---|---|---|
| WtT / TtW gCO₂e/MJ per fuel (e.g. VLSFO 13.2 + 77.6; LNG 18.5 + 60.5 incl. slip; grey methanol 31.3 + 69.5; e-methanol 9.0 + 1.5; B30 16.5 + 55.0; ammonia 8.0 + 4.0) | `src/engine/fuels.ts` | order of magnitude of published lifecycle work (IMO LCA framework, FuelEU Annex II, JEC WtW); not the official default factors |
| CII reference line a = 4745, c = 0.622 for bulk carriers (capacity capped at 279,000 DWT), dd vectors 0.86/0.94/1.06/1.18, Z = 5/7/9/11 % for 2023–2026 | `src/engine/cii.ts` | reproduced from memory of MEPC.353(78), MEPC.354(78), MEPC.338(76); verify before regulatory use |
| Vessel performance: P = k·V^n with n ≈ 3, Δ^(2/3) displacement correction, SFOC minimum near 75 % load, wind and wave added-power fractions tuned to ≈ +30 % in Hs 4 m head seas at 30 kn | `src/engine/vessel.ts` | classic admiralty/cube-law scaling and typical Capesize behaviour |
| Monsoon wind, current and swell climatology (SW/NE reversal, monsoon current south of Sri Lanka, West India Coastal Current) | `src/engine/ocean.ts` | analytic approximation of published descriptions plus seeded noise |
| Palk Strait shallows (~9 m), One Fathom Bank area (~23 m), Singapore Strait TSS (~22 m), Malacca TSS footprint, Andaman & Nicobar regulated waters | `src/engine/zones.ts` | real features approximated as boxes; depths indicative |
| Singapore grid factor ≈ 0.41 kg CO₂/kWh | `src/data/ports.ts` | published order of magnitude (Energy Market Authority); verify |
| SOLAS V/22 forward-visibility rule quoted in the bridge region detail | `src/views/FleetView.tsx` | regulation text as remembered; verify wording |

## Scenario inputs and synthetic data

- Fleet particulars, names, call signs, flags, engines, tank capacities, hire rates, annual profiles (`src/data/fleet.ts`).
- Fuel prices in USD/t, port dues, berth hours, congestion, arrivals boards, shore-power tariff and capacity, port weather (`src/data/ports.ts`, `src/engine/fuels.ts`).
- Storm track, forecast revision and ground truth; departure dates and arrival windows; priority weights (`src/data/scenarios/index.ts`).
- Approach waypoints for Mormugao and the Malacca/Singapore straits — approximate, not for navigation (`src/engine/corridors.ts`).
- The synthetic depth model outside the named shallow zones (`src/engine/zones.ts`).
- "Actual" voyages used for prediction-quality metrics, and every benchmark result (`src/views/AnalyticsView.tsx`, `src/engine/benchmark.ts`).

## Claims the product deliberately does not make

- No quantum hardware is used and no quantum speed-up is claimed; the engine is a classical simulation of quantum-inspired heuristics benchmarked on a synthetic problem.
- No validation against real voyages; prediction metrics compare the model with a generated "actual".
- No live AIS, forecast, port or market data.

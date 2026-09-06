// Clips Natural Earth 50m land polygons (public domain) to the Indian Ocean / SE Asia
// operating region so the app can bundle higher-detail coastlines only where the
// demo routes run. Usage: node scripts/clip-natural-earth.mjs <in.geojson> <out.json>
// Sutherland–Hodgman clipping against a rectangular (convex) window.
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inPath, outPath] = process.argv
const BBOX = { minLon: 55, minLat: -20, maxLon: 125, maxLat: 35 }

const src = JSON.parse(readFileSync(inPath, 'utf8'))

function inside(p, edge) {
  switch (edge) {
    case 'left': return p[0] >= BBOX.minLon
    case 'right': return p[0] <= BBOX.maxLon
    case 'bottom': return p[1] >= BBOX.minLat
    case 'top': return p[1] <= BBOX.maxLat
  }
}
function intersect(a, b, edge) {
  const [x1, y1] = a, [x2, y2] = b
  if (edge === 'left' || edge === 'right') {
    const x = edge === 'left' ? BBOX.minLon : BBOX.maxLon
    const t = (x - x1) / (x2 - x1)
    return [x, y1 + t * (y2 - y1)]
  }
  const y = edge === 'bottom' ? BBOX.minLat : BBOX.maxLat
  const t = (y - y1) / (y2 - y1)
  return [x1 + t * (x2 - x1), y]
}
function clipRing(ring) {
  let out = ring
  for (const edge of ['left', 'right', 'bottom', 'top']) {
    const inp = out
    out = []
    if (inp.length === 0) break
    let prev = inp[inp.length - 1]
    for (const cur of inp) {
      if (inside(cur, edge)) {
        if (!inside(prev, edge)) out.push(intersect(prev, cur, edge))
        out.push(cur)
      } else if (inside(prev, edge)) {
        out.push(intersect(prev, cur, edge))
      }
      prev = cur
    }
  }
  return out.length >= 3 ? out.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]) : null
}

const polygons = []
for (const f of src.features) {
  const g = f.geometry
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  for (const poly of polys) {
    const outer = clipRing(poly[0])
    if (!outer) continue
    const holes = poly.slice(1).map(clipRing).filter(Boolean)
    polygons.push([outer, ...holes])
  }
}
const out = {
  source: 'Natural Earth 1:50m land (public domain), clipped to lon 55..125 / lat -20..35 by scripts/clip-natural-earth.mjs',
  bbox: BBOX,
  polygons,
}
writeFileSync(outPath, JSON.stringify(out))
const pts = polygons.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0)
console.log(`wrote ${outPath}: ${polygons.length} polygons, ${pts} points`)

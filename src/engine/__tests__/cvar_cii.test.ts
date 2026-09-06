import { describe, expect, it } from 'vitest'
import { cvar, makePerturbations } from '../cvar'
import { ciiRating, ciiReference, projectCii, requiredCii } from '../cii'
import { FLEET_BY_ID } from '../../data/fleet'

describe('cvar', () => {
  it('CVaR is the mean of the worst tail', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(cvar(v, 0.95)).toBe(10)
    expect(cvar(v, 0.8)).toBe(9.5)
    expect(cvar(v, 0.5)).toBe(8)
  })
  it('perturbations are deterministic for a seed', () => {
    expect(makePerturbations(42, 5)).toEqual(makePerturbations(42, 5))
    expect(makePerturbations(42, 5)).not.toEqual(makePerturbations(43, 5))
  })
})

describe('cii', () => {
  it('bulk carrier reference line for 180,200 DWT is ≈2.55 gCO2/(DWT·nm)', () => {
    expect(ciiReference(180200)).toBeGreaterThan(2.5)
    expect(ciiReference(180200)).toBeLessThan(2.6)
    expect(ciiReference(300000)).toBeCloseTo(ciiReference(279000), 9)
  })
  it('required CII tightens each year and ratings follow the dd vector', () => {
    expect(requiredCii(180200, 2026)).toBeLessThan(requiredCii(180200, 2023))
    const req = 2
    expect(ciiRating(1.6, req)).toBe('A')
    expect(ciiRating(1.9, req)).toBe('C')
    expect(ciiRating(2.3, req)).toBe('D')
    expect(ciiRating(2.5, req)).toBe('E')
  })
  it('projects a plausible rating for a laden Capesize voyage', () => {
    const p = projectCii(FLEET_BY_ID.AK, 900, 2200, 2026)
    expect(p.attained).toBeGreaterThan(2)
    expect(p.attained).toBeLessThan(2.6)
    expect(['B', 'C', 'D']).toContain(p.rating)
  })
})

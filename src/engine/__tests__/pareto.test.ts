import { describe, expect, it } from 'vitest'
import { Hypervolume, ParetoArchive, crowdingDistance, dominates, nonDominatedSort, scalarise } from '../pareto'

describe('pareto', () => {
  it('dominance is strict', () => {
    expect(dominates([1, 1], [2, 2])).toBe(true)
    expect(dominates([1, 2], [2, 1])).toBe(false)
    expect(dominates([1, 1], [1, 1])).toBe(false)
  })
  it('archive keeps only non-dominated points and respects capacity', () => {
    const a = new ParetoArchive<{ objectives: number[] }>(3)
    a.add({ objectives: [1, 5] })
    a.add({ objectives: [5, 1] })
    a.add({ objectives: [3, 3] })
    a.add({ objectives: [4, 4] }) // dominated by [3,3]
    expect(a.items.length).toBe(3)
    a.add({ objectives: [2, 4] })
    a.add({ objectives: [4, 2] })
    expect(a.items.length).toBe(3)
    expect(a.items.some((i) => i.objectives[0] === 1)).toBe(true) // extremes kept
    expect(a.items.some((i) => i.objectives[1] === 1)).toBe(true)
  })
  it('non-dominated sort produces fronts', () => {
    const fronts = nonDominatedSort([[1, 5], [5, 1], [3, 3], [4, 4], [6, 6]])
    expect(fronts[0].sort()).toEqual([0, 1, 2])
    expect(fronts[1]).toEqual([3])
    expect(fronts[2]).toEqual([4])
  })
  it('crowding distance marks extremes infinite', () => {
    const cd = crowdingDistance([[1, 5], [3, 3], [5, 1]])
    expect(cd[0]).toBe(Infinity)
    expect(cd[2]).toBe(Infinity)
    expect(Number.isFinite(cd[1])).toBe(true)
  })
  it('hypervolume grows when a better point is added', () => {
    const hv = new Hypervolume([0, 0], [10, 10], 2000, 3)
    const h1 = hv.compute([[5, 5]])
    const h2 = hv.compute([[5, 5], [2, 8], [8, 2]])
    expect(h1).toBeCloseTo(0.25, 1)
    expect(h2).toBeGreaterThan(h1)
  })
  it('scalarisation normalises and weights', () => {
    expect(scalarise([5, 5], [0.5, 0.5], [0, 0], [10, 10])).toBeCloseTo(0.5, 6)
  })
})

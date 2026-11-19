import { expect, test } from 'claude-code/testing'

import type { Commit } from '../../types'
import { firstParentLine, layoutGraph, tipOf } from './layout'

const c = (id: string, parents: string, subject: string, refs: string): Commit => ({
  id,
  parents: parents.split(' ').filter(Boolean),
  date: '2026-11-01',
  author: 'T',
  refs: refs.split(', ').filter(Boolean),
  subject,
})

// Captured from a real repo (git log --all --date-order). Its graph:
//   * B3                       (feat-b)
//   *   Merge main into feat-b
//   |\
//   | * M4                     (main)
//   | | * C1                   (feat-c, branched from B2)
//   * | B2
//   | *   Merge feat-a
//   * | | B1
//   * | M3
//   | * A2                     (feat-a)
//   | * A1
//   * M2
//   * M1
const FIXTURE: Commit[] = [
  c('a279873', '8063846', 'B3', 'feat-b'),
  c('8063846', '94a51e5 4934788', 'Merge main into feat-b', ''),
  c('4934788', '912ce36', 'M4', 'HEAD -> main'),
  c('c7acc3e', '94a51e5', 'C1', 'feat-c'),
  c('94a51e5', '81d8c29', 'B2', ''),
  c('912ce36', '61fba08 c3297e0', 'Merge feat-a', ''),
  c('81d8c29', '61fba08', 'B1', ''),
  c('61fba08', 'edb90a5', 'M3', ''),
  c('c3297e0', 'a58606d', 'A2', 'feat-a'),
  c('a58606d', 'edb90a5', 'A1', ''),
  c('edb90a5', '2042d7a', 'M2', ''),
  c('2042d7a', '', 'M1', ''),
]

const lanesBySubject = (commits: Commit[], tip?: string) => {
  const layout = layoutGraph(commits, tip)
  return Object.fromEntries(layout.rows.map(row => [commits[row.row]!.subject, row.lane]))
}

test('the base line is found from its ref and walked by first parents', () => {
  const tip = tipOf(FIXTURE, 'main')
  expect(tip).toBe('4934788')
  expect([...firstParentLine(FIXTURE, tip)]).toEqual(['4934788', '912ce36', '61fba08', 'edb90a5', '2042d7a'])
})

test('main keeps lane 0 and branches get their own lanes', () => {
  expect(lanesBySubject(FIXTURE, tipOf(FIXTURE, 'main'))).toEqual({
    B3: 1,
    'Merge main into feat-b': 1,
    M4: 0,
    C1: 2,
    B2: 1,
    'Merge feat-a': 0,
    B1: 1,
    M3: 0,
    A2: 2,
    A1: 2,
    M2: 0,
    M1: 0,
  })
})

test('only base-line commits sit in lane 0', () => {
  const tip = tipOf(FIXTURE, 'main')
  const line = firstParentLine(FIXTURE, tip)
  for (const row of layoutGraph(FIXTURE, tip).rows) expect(row.lane === 0).toBe(line.has(row.id))
})

test('edges run in their lane and bend into the parent lane', () => {
  const layout = layoutGraph(FIXTURE, tipOf(FIXTURE, 'main'))
  expect(layout.laneCount).toBe(3)

  // Merge main into feat-b (row 1, lane 1): first parent B2 straight down,
  // second parent M4 through lane 2 into lane 0.
  expect(layout.edges.filter(edge => edge.from === 1)).toEqual([
    { from: 1, to: 4, fromLane: 1, viaLane: 1, toLane: 1, isMerge: false },
    { from: 1, to: 2, fromLane: 1, viaLane: 2, toLane: 0, isMerge: true },
  ])
  // C1 (row 3) runs in lane 2 and joins B2 in lane 1.
  expect(layout.edges.filter(edge => edge.from === 3)).toEqual([
    { from: 3, to: 4, fromLane: 2, viaLane: 2, toLane: 1, isMerge: false },
  ])
  // Every child-parent pair in the list has exactly one edge.
  const pairs = FIXTURE.reduce((sum, commit) => sum + commit.parents.length, 0)
  expect(layout.edges).toHaveLength(pairs)
})

test('a parent below the list leaves an open edge', () => {
  const cut = FIXTURE.slice(0, 3)
  const layout = layoutGraph(cut, tipOf(cut, 'main'))
  const open = layout.edges.filter(edge => edge.to === undefined)
  expect(open.map(edge => [cut[edge.from]!.subject, edge.viaLane])).toEqual([
    ['Merge main into feat-b', 1],
    ['M4', 0],
  ])
})

test('without a base the lanes start at 0', () => {
  const lanes = lanesBySubject([c('b', 'a', 'B', 'x'), c('z', 'a', 'Z', 'y'), c('a', '', 'A', '')])
  expect(lanes).toEqual({ B: 0, Z: 1, A: 0 })
})

test('an empty history lays out to nothing', () => {
  expect(layoutGraph([])).toEqual({ rows: [], edges: [], laneCount: 1 })
})

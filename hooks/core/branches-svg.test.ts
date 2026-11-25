import { expect, test } from 'claude-code/testing'

import type { Branch } from '../../types'
import { BRANCH_ROW, age, barWidth, branchListSvg, columnsFor, shortAge } from './branches-svg'

const branch = (name: string, extra: Partial<Branch> = {}): Branch => ({
  name,
  kind: 'local',
  sha: 'abc1234',
  date: '2026-11-17',
  status: 'open',
  isHead: false,
  hasRemote: false,
  group: 'active',
  ahead: 2,
  behind: 5,
  ...extra,
})

test('ages read as words', () => {
  const today = '2026-11-19'
  expect(['2026-11-19', '2026-11-18', '2026-11-12', '2026-10-20', '2026-06-01', '2025-11-01', '2023-01-01'].map(d => age(d, today))).toEqual([
    'today',
    'yesterday',
    '7 days ago',
    '4 weeks ago',
    '6 months ago',
    'a year ago',
    '4 years ago',
  ])
})

test('bars grow slowly and stay inside their half', () => {
  expect(barWidth(1)).toBeLessThan(barWidth(10))
  expect(barWidth(10)).toBeLessThan(barWidth(100))
  expect(barWidth(100000)).toBeLessThanOrEqual(46)
})

test('short ages for a narrow pane', () => {
  const today = '2026-11-19'
  expect(['2026-11-19', '2026-11-18', '2026-10-20', '2026-06-01', '2023-01-01'].map(d => shortAge(d, today))).toEqual([
    'today',
    '1d',
    '4w',
    '6mo',
    '4y',
  ])
})

test('a narrow pane shrinks the bar and the age before the name', () => {
  const wide = columnsFor(600)
  const middle = columnsFor(460)
  const narrow = columnsFor(324)
  expect(wide.ageStyle).toBe('long')
  expect(middle.ageStyle).toBe('short')
  expect(narrow.ageStyle).toBe('none')
  expect(narrow.half).toBeLessThan(wide.half)
  // The name always keeps room, and nothing is drawn left of the dot.
  for (const columns of [wide, middle, narrow]) expect(columns.nameEnd - 30).toBeGreaterThanOrEqual(70)
  expect(barWidth(100000, narrow.half)).toBeLessThanOrEqual(narrow.half - 18)

  const { source } = branchListSvg([branch('feature/narrow-pane')], { width: 324, today: '2026-11-19', laneOf: () => 1 })
  expect(source).toContain('>feature/narro')
  expect(source).not.toContain('days ago')
})

test('a row per branch, with HEAD, the lane color, chips and escaped names', () => {
  const branches = [
    branch('main', { status: 'base', isHead: true, hasRemote: true }),
    branch('fix/<b>&co', { status: 'stale' }),
  ]
  const { source, height, alt } = branchListSvg(branches, { width: 600, today: '2026-11-19', laneOf: () => 2 })
  expect(height).toBe(2 * BRANCH_ROW)
  expect(alt).toBe('2 branches: main (base), fix/<b>&co (stale).')
  expect(source).toContain('>HEAD</text>')
  expect(source).toContain('class="f2"')
  expect(source).toContain('fix/&lt;b&gt;&amp;co')
  expect(source).toContain('class="c-stale"')
  // The base has no bar; the other branch has both halves.
  expect(source.match(/class="behind"/g)).toHaveLength(1)
})

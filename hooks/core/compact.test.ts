import { expect, test } from 'claude-code/testing'

import type { Commit } from '../../types'
import { authors, compactCommits } from './compact'
import { layoutGraph, tipOf } from './layout'

const c = (id: string, parents: string, refs = '', author = 'Lars', date = '2026-11-01'): Commit => ({
  id,
  parents: parents.split(' ').filter(Boolean),
  date,
  author,
  refs: refs.split(', ').filter(Boolean),
  subject: id,
})

// main: m9 (ref) ← c8 … c1 (CMS edits) ← m0, and feature f1 branching off c4.
const HISTORY: Commit[] = [
  c('m9', 'c8', 'HEAD -> main', 'Daniel', '2026-11-19'),
  c('f1', 'c4', 'feature', 'Daniel', '2026-11-18'),
  c('c8', 'c7', '', 'Linda', '2026-11-17'),
  c('c7', 'c6', '', 'Lars', '2026-11-16'),
  c('c6', 'c5', '', 'Linda', '2026-11-15'),
  c('c5', 'c4', '', 'Lars', '2026-11-14'),
  c('c4', 'c3', '', 'Lars', '2026-11-13'),
  c('c3', 'c2', '', 'Lars', '2026-11-12'),
  c('c2', 'c1', '', 'Linda', '2026-11-11'),
  c('c1', 'm0', '', 'Lars', '2026-11-10'),
  c('m0', '', 'tag: v1', 'Daniel', '2026-11-01'),
]

test('quiet chains fold into one row, broken where a branch leaves', () => {
  const rows = compactCommits(HISTORY)
  expect(rows.map(row => `${row.id}${row.count ? `×${row.count}` : ''}`)).toEqual([
    'm9',
    'f1',
    'c8×4', // c8..c5: c4 has two children (c5 and f1), so the chain stops above it
    'c4×4', // c4..c1
    'm0',
  ])
  const top = rows[2]!
  expect(top).toMatchObject({ parents: ['c4'], date: '2026-11-17', firstDate: '2026-11-14', subject: '4 commits' })
  expect(top.author).toBe('Linda, Lars')
})

test('short chains are left alone', () => {
  expect(compactCommits(HISTORY, 9).map(row => row.id)).toEqual(HISTORY.map(commit => commit.id))
})

test('the folded history still lays out with main in lane 0', () => {
  const rows = compactCommits(HISTORY)
  const layout = layoutGraph(rows, tipOf(rows, 'main'))
  const lanes = Object.fromEntries(layout.rows.map(row => [rows[row.row]!.id, row.lane]))
  expect(lanes).toEqual({ m9: 0, f1: 1, c8: 0, c4: 0, m0: 0 })
  expect(layout.edges.every(edge => edge.to !== undefined)).toBe(true)
})

test('authors are listed most frequent first, three at most', () => {
  expect(authors([c('a', 'b', '', 'A'), c('b', 'c', '', 'B'), c('c', 'd', '', 'B')])).toBe('B, A')
  expect(authors(['A', 'B', 'C', 'D'].map(name => c(name, 'x', '', name)))).toBe('A, B, C, …')
})

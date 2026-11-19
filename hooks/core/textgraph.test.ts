import { expect, test } from 'claude-code/testing'

import type { Commit } from '../../types'
import { layoutGraph, tipOf } from './layout'
import { plain, textGraph } from './textgraph'

const c = (id: string, parents: string, subject: string, refs = ''): Commit => ({
  id,
  parents: parents.split(' ').filter(Boolean),
  date: '2026-11-01',
  author: 'T',
  refs: refs.split(', ').filter(Boolean),
  subject,
})

// The same history as the layout test (git log --all --date-order).
const FIXTURE: Commit[] = [
  c('a279873', '8063846', 'B3', 'feat-b'),
  c('8063846', '94a51e5 4934788', 'Merge main into feat-b'),
  c('4934788', '912ce36', 'M4', 'HEAD -> main'),
  c('c7acc3e', '94a51e5', 'C1', 'feat-c'),
  c('94a51e5', '81d8c29', 'B2'),
  c('912ce36', '61fba08 c3297e0', 'Merge feat-a'),
  c('81d8c29', '61fba08', 'B1'),
  c('61fba08', 'edb90a5', 'M3'),
  c('c3297e0', 'a58606d', 'A2', 'feat-a'),
  c('a58606d', 'edb90a5', 'A1'),
  c('edb90a5', '2042d7a', 'M2'),
  c('2042d7a', '', 'M1'),
]

test('the text graph draws lanes, bends and HEAD like git log --graph', () => {
  const layout = layoutGraph(FIXTURE, tipOf(FIXTURE, 'main'))
  const lines = textGraph(FIXTURE, layout, { headId: '4934788' })
  const drawn = lines.map(line => `${plain(line)}${line.commit ? ` ${line.commit.subject}` : ''}`.trimEnd())
  expect(drawn).toEqual([
    '  ●   B3',
    '  ●   Merge main into feat-b',
    '╭─┤', // the merge's second parent joins main's lane
    '◉ │   M4',
    '│ │ ● C1',
    '│ ├─╯', // feat-c joins feat-b at B2
    '│ ●   B2',
    '● │   Merge feat-a',
    '├─┼─╮', // feat-a leaves main, crossing feat-b
    '│ ● │ B1',
    '├─╯ │', // feat-b started from M3
    '●   │ M3',
    '│   ● A2',
    '│   ● A1',
    '├───╯', // feat-a started from M2
    '●     M2',
    '●     M1',
  ])  // Every commit gets exactly one line, in order.
  expect(lines.filter(line => line.commit).map(line => line.commit!.subject)).toEqual(FIXTURE.map(commit => commit.subject))
  // Lane 0 holds main's commits only.
  for (const line of lines.filter(line => line.commit)) {
    const first = plain(line)[0]
    expect(first === '●' || first === '◉').toBe(['M4', 'Merge feat-a', 'M3', 'M2', 'M1'].includes(line.commit!.subject))
  }
})

test('a straight history has no connecting lines', () => {
  const commits = [c('c', 'b', 'C', 'HEAD -> main'), c('b', 'a', 'B'), c('a', '', 'A')]
  const lines = textGraph(commits, layoutGraph(commits, 'c'), { headId: 'c' })
  expect(lines.map(plain)).toEqual(['◉', '●', '●'])
})

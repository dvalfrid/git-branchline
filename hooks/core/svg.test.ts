import { expect, test } from 'claude-code/testing'

import type { Commit } from '../../types'
import { layoutGraph } from './layout'
import { compactCommits } from './compact'
import { MAX_SOURCE, ROW, edgePath, graphSvg, pills, tooltip } from './svg'

const c = (id: string, parents: string, refs = '', subject = id): Commit => ({
  id,
  parents: parents.split(' ').filter(Boolean),
  date: '2026-11-19',
  author: 'Daniel',
  refs: refs.split(', ').filter(Boolean),
  subject,
})

test('decorations become pills, HEAD first and origin/HEAD dropped', () => {
  expect(pills(['HEAD -> main', 'origin/main', 'origin/HEAD', 'tag: v1', 'feature/x'])).toEqual([
    { text: 'HEAD', kind: 'head' },
    { text: 'main', kind: 'branch' },
    { text: 'origin/main', kind: 'remote' },
    { text: 'v1', kind: 'tag' },
    { text: 'feature/x', kind: 'branch' },
  ])
})

test('edge paths: straight, bend at the parent, bend at the child, open', () => {
  // lane x: 12 + lane*16 + 8 → lane 0 at 20, lane 1 at 36; row y: row*24 + 12.
  expect(edgePath(0, 3, 0, 0, 0, 999)).toBe('M20 12L20 84')
  expect(edgePath(0, 3, 1, 1, 0, 999)).toBe('M36 12L36 60C36 72 20 72 20 84')
  expect(edgePath(0, 3, 0, 1, 1, 999)).toBe('M20 12C20 24 36 24 36 36L36 84')
  expect(edgePath(0, 1, 0, 1, 1, 999)).toBe('M20 12C20 24 36 24 36 36')
  expect(edgePath(2, undefined, 1, 1, 1, 240)).toBe('M36 60L36 240')
})

test('the svg has a dot per commit, a path per edge, and escapes text', () => {
  const commits = [c('b', 'a', 'HEAD -> main', 'Fix <b> & "quotes"'), c('a', '')]
  const { source, rows, alt } = graphSvg(commits, layoutGraph(commits, 'b'), { headId: 'b' })
  expect(rows).toBe(2)
  expect(alt).toBe('Commit graph: 2 commits on 1 lane.')
  expect(source.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  expect(source).toContain(`height="${2 * ROW}"`)
  expect(source.match(/<circle class="f/g)).toHaveLength(2)
  expect(source.match(/<circle class="ring"/g)).toHaveLength(1)
  expect(source.match(/<path /g)).toHaveLength(1)
  expect(source).toContain('Fix &lt;b&gt; &amp; &quot;quotes&quot;')
  expect(source).not.toContain('<b>')
})

test('a long history is cut to fit the source limit', () => {
  const commits = Array.from({ length: 400 }, (_, i) =>
    c(`c${i}`, i < 399 ? `c${i + 1}` : '', i % 5 === 0 ? `tag: v${i}, origin/branch-${i}` : '', 'x'.repeat(200)),
  )
  const graph = graphSvg(commits, layoutGraph(commits, 'c0'), { maxRows: 400 })
  expect(graph.source.length).toBeLessThanOrEqual(MAX_SOURCE)
  expect(graph.rows).toBeLessThan(400)
  expect(graph.alt).toContain(`the newest ${graph.rows} of 400 commits`)
})

test('hovering a row shows its commit, and a folded row lists its commits', () => {
  const commits = [c('d', 'c', 'HEAD -> main', 'Tip'), c('c', 'b'), c('b', 'a'), c('a', 'z'), c('z', 'y'), c('y', '')]
  const rows = compactCommits(commits)
  expect(rows.map(row => row.count ?? 1)).toEqual([1, 4, 1])

  expect(tooltip(rows[0]!)).toBe('d  2026-11-19  Daniel: Tip\n  HEAD -> main')
  expect(tooltip(rows[1]!).split('\n')).toEqual([
    '4 commits (show every commit with the button below)',
    'c  2026-11-19  Daniel: c',
    'b  2026-11-19  Daniel: b',
    'a  2026-11-19  Daniel: a',
    'z  2026-11-19  Daniel: z',
  ])

  const { source } = graphSvg(rows, layoutGraph(rows, 'd'))
  expect(source.match(/<g class="r"><title>/g)).toHaveLength(3)
  expect(source).toContain('&gt;')
})

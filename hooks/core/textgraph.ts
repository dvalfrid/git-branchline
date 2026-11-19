// The commit graph as text for the terminal, in the style of
// `git log --graph`: one line per commit, plus a line between two commits
// wherever an edge bends from one lane to another. Pure: layout in, lines out.

import type { GraphCommit } from './compact'
import type { Layout } from './layout'

/** A run of text in one color (an index into the lane colors; undefined: none of its own). */
export type Span = { text: string; lane?: number }

export type TextLine = {
  /** The graph part, two cells per lane. */
  graph: Span[]
  /** The commit drawn on this line; absent on a connecting line. */
  commit?: GraphCommit
  isHead?: boolean
}

// Which ways a cell connects: up, down, left, right.
type Flags = { u?: boolean; d?: boolean; l?: boolean; r?: boolean }

const GLYPHS: Record<string, string> = {
  ud: '│',
  lr: '─',
  udlr: '┼',
  ur: '╰',
  ul: '╯',
  dr: '╭',
  dl: '╮',
  udr: '├',
  udl: '┤',
  ulr: '┴',
  dlr: '┬',
  u: '│',
  d: '│',
  l: '─',
  r: '─',
}

const glyph = (flags: Flags): string =>
  GLYPHS[`${flags.u ? 'u' : ''}${flags.d ? 'd' : ''}${flags.l ? 'l' : ''}${flags.r ? 'r' : ''}`] ?? ' '

export type TextGraphOptions = {
  headId?: string
  maxRows?: number
  /** Color of an edge and of a commit; by lane when absent. */
  edgeColor?: (edge: Layout['edges'][number]) => number
  rowColor?: (id: string, lane: number) => number
}

export const textGraph = (commits: GraphCommit[], layout: Layout, options: TextGraphOptions = {}): TextLine[] => {
  const edgeColor = options.edgeColor ?? (edge => edge.viaLane)
  const rowColor = options.rowColor ?? ((_, lane) => lane)
  const rows = Math.min(layout.rows.length, options.maxRows ?? 150)
  // Two cells per lane, without a spacer after the last.
  const width = layout.laneCount * 2 - 1
  const lines: TextLine[] = []

  for (let r = 0; r < rows; r++) {
    const row = layout.rows[r]!
    const commit = commits[row.row]!

    // The commit's own line: its mark, and the lanes edges pass down through.
    const cells: Span[] = Array.from({ length: width }, () => ({ text: ' ' }))
    for (const edge of layout.edges) {
      const to = edge.to ?? Infinity
      if (edge.from < r && r < to) cells[edge.viaLane * 2] = { text: '│', lane: edgeColor(edge) }
    }
    const isHead = commit.id === options.headId
    cells[row.lane * 2] = { text: commit.count ? '■' : isHead ? '◉' : '●', lane: rowColor(commit.id, row.lane) }
    lines.push({ graph: merge(cells), commit, isHead })

    if (r === rows - 1) break

    // The line to the next commit: kept only where an edge changes lane.
    const flags: Flags[] = Array.from({ length: width }, () => ({}))
    const laneAt: (number | undefined)[] = Array.from({ length: width }, () => undefined)
    let bends = false
    for (const edge of layout.edges) {
      const to = edge.to ?? Infinity
      if (!(edge.from <= r && r < to)) continue
      const top = r === edge.from ? edge.fromLane : edge.viaLane
      const bottom = r + 1 === to ? edge.toLane : edge.viaLane
      const color = edgeColor(edge)
      if (top === bottom) {
        set(flags, laneAt, top * 2, { u: true, d: true }, color)
        continue
      }
      bends = true
      const [a, b] = [top * 2, bottom * 2]
      const step = b > a ? 1 : -1
      set(flags, laneAt, a, { u: true, [step > 0 ? 'r' : 'l']: true }, color)
      for (let x = a + step; x !== b; x += step) set(flags, laneAt, x, { l: true, r: true }, color)
      set(flags, laneAt, b, { d: true, [step > 0 ? 'l' : 'r']: true }, color)
    }
    if (bends) {
      lines.push({ graph: merge(flags.map((f, x) => ({ text: glyph(f), lane: laneAt[x] }))) })
    }
  }
  return lines
}

const set = (flags: Flags[], laneAt: (number | undefined)[], x: number, add: Flags, lane: number) => {
  Object.assign(flags[x]!, add)
  // A vertical line keeps its own color where a bend crosses it.
  if (laneAt[x] === undefined || add.u || add.d) laneAt[x] = lane
}

/** Neighbouring cells of the same color become one span. */
const merge = (cells: Span[]): Span[] => {
  const out: Span[] = []
  for (const cell of cells) {
    const last = out[out.length - 1]
    if (last && last.lane === cell.lane) last.text += cell.text
    else out.push({ ...cell })
  }
  return out
}

/** The plain text of a graph part, for tests and for reading. */
export const plain = (line: TextLine): string => line.graph.map(span => span.text).join('')

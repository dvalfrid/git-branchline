// Draws the commit graph as one SVG document. Pure: layout and commits in,
// markup out. Colors follow the light or dark scheme through a media query,
// since the drawing is shown as an image and inherits no text color.

import type { GraphCommit } from './compact'
import type { Layout } from './layout'

export const ROW = 24
export const LANE = 16
export const PAD = 12
export const WIDTH = 720
/** The engine refuses an Svg source longer than this. */
export const MAX_SOURCE = 131_072
/** Rows drawn at most; edges to commits further down end at the bottom. */
export const MAX_ROWS = 150

const FONT = 12
const CHAR = 6.6
const RADIUS = 4

/** Lane colors that work in light and dark mode; lane 0 (main) is grey. */
export const LANE_COLORS = ['#5F5E5A', '#1D9E75', '#D85A30', '#7F77DD', '#D4537E', '#378ADD']

const STYLE = [
  `text{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:${FONT}px}`,
  '.fg{fill:#2c2c2a}.dim{fill:#73726c}',
  '.pill{fill:#f1efe8;stroke:#b4b2a9}.pt{fill:#444441;font-size:10.5px}',
  '.head{fill:#FAEEDA;stroke:#BA7517}.ht{fill:#633806;font-weight:600;font-size:10.5px}',
  '.tag{fill:none;stroke:#888780;stroke-dasharray:2 2}.rem{fill:none}',
  '.ring{fill:none;stroke:#BA7517;stroke-width:2}',
  '.hit{fill:transparent}.r:hover .hit{fill:#88878026}',
  ...LANE_COLORS.map((color, i) => `.s${i}{stroke:${color}}.f${i}{fill:${color}}`),
  '@media (prefers-color-scheme:dark){',
  '.fg{fill:#e8e6dc}.dim{fill:#a3a19a}',
  '.pill{fill:#2c2c2a;stroke:#5f5e5a}.pt{fill:#d3d1c7}',
  '.head{fill:#412402;stroke:#EF9F27}.ht{fill:#FAC775}',
  '.ring{stroke:#EF9F27}',
  '.s0{stroke:#9c9a92}.f0{fill:#9c9a92}',
  '}',
].join('')

export type GraphOptions = {
  /** The checked-out commit, ringed. */
  headId?: string
  maxRows?: number
  width?: number
}

export type Graph = { source: string; rows: number; alt: string; width: number; height: number }

/**
 * The SVG for the first rows of the layout. Rows are dropped until the
 * source fits within MAX_SOURCE.
 */
export const graphSvg = (commits: GraphCommit[], layout: Layout, options: GraphOptions = {}): Graph => {
  let rows = Math.min(layout.rows.length, options.maxRows ?? MAX_ROWS)
  for (;;) {
    const source = draw(commits, layout, rows, options)
    if (source.length <= MAX_SOURCE || rows <= 1) {
      const lanes = layout.laneCount === 1 ? '1 lane' : `${layout.laneCount} lanes`
      const total = commits.reduce((sum, commit) => sum + (commit.count ?? 1), 0)
      const unit = total === commits.length ? 'commits' : `rows (${total} commits, quiet stretches folded)`
      const shown = rows < commits.length ? `the newest ${rows} of ${commits.length} ${unit}` : `${rows} ${unit}`
      const width = options.width ?? WIDTH
      return { source, rows, alt: `Commit graph: ${shown} on ${lanes}.`, width, height: Math.max(rows, 1) * ROW }
    }
    rows = Math.floor(rows * 0.8)
  }
}

const laneX = (lane: number) => PAD + lane * LANE + LANE / 2
const rowY = (row: number) => row * ROW + ROW / 2
const color = (lane: number) => lane % LANE_COLORS.length

const draw = (commits: GraphCommit[], layout: Layout, rows: number, options: GraphOptions): string => {
  const width = options.width ?? WIDTH
  const height = Math.max(rows, 1) * ROW
  const textX = PAD + layout.laneCount * LANE + 8
  const out: string[] = []

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<style>${STYLE}</style>`,
    '<g fill="none" stroke-width="2" stroke-linecap="round">',
  )
  for (const edge of layout.edges) {
    if (edge.from >= rows) continue
    const to = edge.to !== undefined && edge.to < rows ? edge.to : undefined
    out.push(`<path class="s${color(edge.viaLane)}" d="${edgePath(edge.from, to, edge.fromLane, edge.viaLane, edge.toLane, height)}"/>`)
  }
  out.push('</g>')

  for (const row of layout.rows.slice(0, rows)) {
    const commit = commits[row.row]!
    const x = laneX(row.lane)
    const y = rowY(row.row)
    const hasRefs = commit.refs.length > 0
    out.push(
      `<g class="r"><title>${esc(tooltip(commit))}</title>`,
      `<rect class="hit" x="0" y="${row.row * ROW}" width="${width}" height="${ROW}"/>`,
    )
    if (commit.count) {
      // A folded chain: a square instead of a dot.
      const side = RADIUS * 2 + 2
      out.push(`<rect class="f${color(row.lane)}" x="${x - side / 2}" y="${y - side / 2}" width="${side}" height="${side}" rx="2"/>`)
    } else {
      out.push(`<circle class="f${color(row.lane)}" cx="${x}" cy="${y}" r="${hasRefs ? RADIUS + 1 : RADIUS}"/>`)
    }
    if (commit.id === options.headId) out.push(`<circle class="ring" cx="${x}" cy="${y}" r="${RADIUS + 4}"/>`)

    let cursor = textX
    for (const ref of pills(commit.refs)) {
      const w = Math.round(ref.text.length * CHAR * 0.92 + 10)
      const cls = ref.kind === 'head' ? 'head' : ref.kind === 'tag' ? 'pill tag' : ref.kind === 'remote' ? 'pill rem' : 'pill'
      out.push(
        `<rect class="${cls}" x="${cursor}" y="${y - 8}" width="${w}" height="16" rx="8"/>`,
        `<text class="${ref.kind === 'head' ? 'ht' : 'pt'}" x="${cursor + 5}" y="${y + 3.5}">${esc(ref.text)}</text>`,
      )
      cursor += w + 4
    }

    const dates = commit.firstDate && commit.firstDate !== commit.date ? `${commit.firstDate} – ${commit.date}` : commit.date
    const meta = `${commit.author} · ${dates}`
    const metaWidth = meta.length * CHAR
    const room = Math.floor((width - PAD - metaWidth - 12 - cursor) / CHAR)
    out.push(
      `<text class="${commit.count ? 'dim' : 'fg'}" x="${cursor + 2}" y="${y + 4}">${esc(clip(commit.subject, room))}</text>`,
      `<text class="dim" x="${width - PAD}" y="${y + 4}" text-anchor="end">${esc(meta)}</text>`,
      '</g>',
    )
  }

  out.push('</svg>')
  return out.join('')
}

/**
 * The path of one edge: a bend out of the child's lane into the lane it runs
 * in, straight down, and a bend into the parent's lane. An edge whose parent
 * is not drawn runs to the bottom.
 */
export const edgePath = (
  from: number,
  to: number | undefined,
  fromLane: number,
  viaLane: number,
  toLane: number,
  height: number,
): string => {
  const x1 = laneX(fromLane)
  const y1 = rowY(from)
  const xv = laneX(viaLane)
  const x2 = to === undefined ? xv : laneX(toLane)
  const y2 = to === undefined ? height : rowY(to)
  const half = ROW / 2

  if (to !== undefined && to - from === 1 && x1 !== x2) {
    return `M${x1} ${y1}C${x1} ${y1 + half} ${x2} ${y2 - half} ${x2} ${y2}`
  }
  let d = `M${x1} ${y1}`
  let y = y1
  if (x1 !== xv) {
    d += `C${x1} ${y1 + half} ${xv} ${y1 + half} ${xv} ${y1 + ROW}`
    y = y1 + ROW
  }
  if (x2 !== xv) {
    if (y2 - ROW > y) d += `L${xv} ${y2 - ROW}`
    d += `C${xv} ${y2 - half} ${x2} ${y2 - half} ${x2} ${y2}`
  } else if (y2 > y) {
    d += `L${x2} ${y2}`
  }
  return d
}

/** Ref prefixes drawn as remote branches. */
export const REMOTES = ['origin', 'upstream']

/** Tooltip lines shown on hover: one line per commit, folded rows listing theirs. */
export const TOOLTIP_LINES = 30

export const tooltip = (commit: GraphCommit): string => {
  const line = (c: { id: string; date: string; author: string; subject: string }) =>
    `${c.id}  ${c.date}  ${c.author}: ${c.subject}`
  if (!commit.members) return [line(commit), ...commit.refs.map(ref => `  ${ref}`)].join('\n')
  const shown = commit.members.slice(0, TOOLTIP_LINES).map(line)
  const rest = commit.members.length - shown.length
  return [`${commit.members.length} commits (show every commit with the button below)`, ...shown, ...(rest > 0 ? [`… and ${rest} more`] : [])].join('\n')
}

export type Pill = { text: string; kind: 'head' | 'branch' | 'remote' | 'tag' }

/** `HEAD -> main, origin/main, tag: v1` decorations as pills, HEAD first. */
export const pills = (refs: string[]): Pill[] =>
  refs.flatMap((ref): Pill[] => {
    if (ref.startsWith('HEAD -> ')) return [{ text: 'HEAD', kind: 'head' }, { text: ref.slice(8), kind: 'branch' }]
    if (ref === 'HEAD') return [{ text: 'HEAD', kind: 'head' }]
    if (ref.startsWith('tag: ')) return [{ text: ref.slice(5), kind: 'tag' }]
    if (ref.endsWith('/HEAD')) return []
    return [{ text: ref, kind: REMOTES.some(remote => ref.startsWith(`${remote}/`)) ? 'remote' : 'branch' }]
  })

const clip = (text: string, room: number): string =>
  room <= 1 ? '' : text.length <= room ? text : `${text.slice(0, room - 1)}…`

// Control characters are refused in an Svg source; the rest is escaped.
const esc = (text: string): string =>
  text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

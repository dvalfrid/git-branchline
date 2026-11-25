// Draws a group of branches as one SVG: a colored dot (the branch's lane color
// in the graph), the name, how long ago, an ahead/behind bar and a status chip.
// Pure, like svg.ts.

import type { Branch } from '../../types'
import { LANE_COLORS } from './svg'

export const BRANCH_ROW = 30
const PAD = 12
const FONT = 12.5
/** Average glyph widths for the name, regular (weight 500) and bold (HEAD). */
const CHAR = 6.9
const CHAR_BOLD = 7.4
const BAR_HALF = 64

const STYLE = [
  `text{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:${FONT}px}`,
  '.fg{fill:#2c2c2a}.dim{fill:#73726c}.num{font-size:11px;font-variant-numeric:tabular-nums}',
  '.name{font-weight:500}.head{font-weight:700}',
  '.line{stroke:#d3d1c7}.axis{stroke:#b4b2a9}',
  '.behind{fill:#b4b2a9}',
  '.hit{fill:transparent}.r:hover .hit{fill:#88878022}',
  '.hc{fill:#FAEEDA;stroke:#BA7517}.hct{fill:#633806;font-weight:700;font-size:10px}',
  '.c-base{fill:#F1EFE8}.t-base{fill:#5F5E5A}',
  '.c-open{fill:#E1F5EE}.t-open{fill:#0F6E56}',
  '.c-merged{fill:#EEEDFE}.t-merged{fill:#534AB7}',
  '.c-stale{fill:#FAECE7}.t-stale{fill:#993C1D}',
  '.chip{font-size:10.5px;font-weight:600}',
  ...LANE_COLORS.map((color, i) => `.f${i}{fill:${color}}`),
  '@media (prefers-color-scheme:dark){',
  '.fg{fill:#e8e6dc}.dim{fill:#a3a19a}.line{stroke:#3a3a37}.axis{stroke:#5f5e5a}.behind{fill:#5f5e5a}',
  '.hc{fill:#412402;stroke:#EF9F27}.hct{fill:#FAC775}',
  '.c-base{fill:#2c2c2a}.t-base{fill:#d3d1c7}',
  '.c-open{fill:#04342C}.t-open{fill:#5DCAA5}',
  '.c-merged{fill:#26215C}.t-merged{fill:#AFA9EC}',
  '.c-stale{fill:#4A1B0C}.t-stale{fill:#F0997B}',
  '.f0{fill:#9c9a92}',
  '}',
].join('')

const STATUS_TEXT: Record<Branch['status'], string> = { base: 'base', open: 'open', merged: 'merged', stale: 'stale' }

export type BranchListOptions = {
  width: number
  /** YYYY-MM-DD, for "3 days ago". */
  today: string
  /** Lane of each branch tip in the graph, by sha; branches not drawn get none. */
  laneOf?: (sha: string) => number | undefined
}

/** Room the name should keep before the columns on the right shrink. */
const MIN_NAME = 130
const NAME_LEFT = PAD + 18

/** Room for "↓123 ↑45" where a narrow pane writes the counts instead of a bar. */
const COUNTS_WIDTH = 60

/**
 * Columns, from the right: chip, ahead/behind, age; the name takes the rest.
 * A narrower pane gets shorter bars and a short age ("3w"), then the counts
 * as text ("↓49 ↑4") instead of a bar, then no age, so the name keeps room
 * to be read.
 */
type Columns = {
  /** Half the bar's width, or 0 where the counts are written as text. */
  half: number
  ageStyle: 'long' | 'short' | 'none'
  chipRight: number
  /** The bar's axis, or the right edge of the counts. */
  barCenter: number
  ageRight: number
  nameEnd: number
}

type Layout = { half: number; ageStyle: Columns['ageStyle']; chipGap: number; ageWidth: number }

/** The narrowest layout, used when not even it leaves the name its room. */
const NARROWEST: Layout = { half: 0, ageStyle: 'none', chipGap: 66, ageWidth: 0 }

const LAYOUTS: Layout[] = [
  { half: BAR_HALF, ageStyle: 'long', chipGap: 92, ageWidth: 92 },
  { half: 48, ageStyle: 'short', chipGap: 76, ageWidth: 44 },
  { half: 0, ageStyle: 'short', chipGap: 66, ageWidth: 44 },
  NARROWEST,
]

export const columnsFor = (width: number): Columns => {
  const chipRight = width - PAD
  const place = (layout: Layout): Columns => {
    const barCenter = layout.half > 0 ? chipRight - layout.chipGap - layout.half - 28 : chipRight - layout.chipGap
    const ageRight = layout.half > 0 ? barCenter - layout.half - 34 : barCenter - COUNTS_WIDTH
    return { half: layout.half, ageStyle: layout.ageStyle, chipRight, barCenter, ageRight, nameEnd: ageRight - layout.ageWidth }
  }
  for (const layout of LAYOUTS) {
    const columns = place(layout)
    if (columns.nameEnd - NAME_LEFT >= MIN_NAME) return columns
  }
  return place(NARROWEST)
}

export const branchListSvg = (branches: Branch[], options: BranchListOptions): { source: string; height: number; alt: string } => {
  const { width, today } = options
  const height = branches.length * BRANCH_ROW
  const { half, ageStyle, chipRight, barCenter, ageRight, nameEnd: columnEnd } = columnsFor(width)
  const nameLeft = NAME_LEFT
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet">`,
    `<style>${STYLE}</style>`,
  ]

  branches.forEach((branch, i) => {
    const top = i * BRANCH_ROW
    const y = top + BRANCH_ROW / 2
    const lane = options.laneOf?.(branch.sha)
    out.push(
      `<g class="r"><title>${esc(tooltip(branch))}</title>`,
      `<rect class="hit" x="0" y="${top}" width="${width}" height="${BRANCH_ROW}" rx="6"/>`,
    )
    if (i > 0) out.push(`<line class="line" x1="${PAD}" x2="${width - PAD}" y1="${top}" y2="${top}"/>`)

    // Dot in the branch's graph color; hollow when the tip is not in the graph.
    out.push(
      lane === undefined
        ? `<circle cx="${PAD + 5}" cy="${y}" r="4" fill="none" stroke="#888780" stroke-width="1.5"/>`
        : `<circle class="f${lane % LANE_COLORS.length}" cx="${PAD + 5}" cy="${y}" r="5"/>`,
    )

    // Name, with a HEAD chip in front and a ⇅ after a branch that is also on a remote.
    let x = nameLeft
    if (branch.isHead) {
      out.push(`<rect class="hc" x="${x}" y="${y - 8}" width="38" height="16" rx="8"/>`, `<text class="hct" x="${x + 6}" y="${y + 3.5}">HEAD</text>`)
      x += 44
    }
    const suffix = branch.hasRemote ? ' ⇅' : ''
    // The base has no counts, so with no age after it the name runs on to the chip.
    const nameEnd = branch.status === 'base' && half === 0 && ageStyle === 'none' ? barCenter - 8 : columnEnd
    const room = Math.floor((nameEnd - x) / (branch.isHead ? CHAR_BOLD : CHAR)) - suffix.length
    out.push(
      `<text class="fg ${branch.isHead ? 'head' : 'name'}" x="${x}" y="${y + 4.5}">${esc(clip(branch.name, room))}<tspan class="dim">${suffix}</tspan></text>`,
    )

    if (ageStyle !== 'none') {
      const when = ageStyle === 'long' ? age(branch.date, today) : shortAge(branch.date, today)
      out.push(`<text class="dim" x="${ageRight}" y="${y + 4.5}" text-anchor="end">${esc(when)}</text>`)
    }

    // Ahead/behind as text in a narrow pane: "↓49 ↑4".
    if (branch.status !== 'base' && half === 0) {
      const { behind, ahead } = branch
      const parts =
        behind === undefined || ahead === undefined
          ? ['<tspan class="dim">?</tspan>']
          : [
              behind > 0 ? `<tspan class="dim">↓${behind}</tspan>` : '',
              ahead > 0 ? `<tspan class="f${(lane ?? 1) % LANE_COLORS.length}">↑${ahead}</tspan>` : '',
            ].filter(Boolean)
      if (parts.length === 0) parts.push('<tspan class="dim">=</tspan>')
      out.push(`<text class="num" x="${barCenter}" y="${y + 4}" text-anchor="end">${parts.join(' ')}</text>`)
    }

    // Ahead/behind: behind grows left in grey, ahead grows right in the lane color.
    if (branch.status !== 'base' && half > 0) {
      out.push(`<line class="axis" x1="${barCenter}" x2="${barCenter}" y1="${y - 8}" y2="${y + 8}"/>`)
      const behind = branch.behind
      const ahead = branch.ahead
      if (behind !== undefined && behind > 0) {
        const w = barWidth(behind, half)
        out.push(
          `<rect class="behind" x="${barCenter - 1 - w}" y="${y - 4}" width="${w}" height="8" rx="2"/>`,
          `<text class="dim num" x="${barCenter - w - 5}" y="${y + 4}" text-anchor="end">${behind}</text>`,
        )
      }
      if (ahead !== undefined && ahead > 0) {
        const w = barWidth(ahead, half)
        out.push(
          `<rect class="f${(lane ?? 1) % LANE_COLORS.length}" x="${barCenter + 1}" y="${y - 4}" width="${w}" height="8" rx="2"/>`,
          `<text class="fg num" x="${barCenter + w + 5}" y="${y + 4}">${ahead}</text>`,
        )
      }
      if (behind === undefined || ahead === undefined) {
        out.push(`<text class="dim num" x="${barCenter + 6}" y="${y + 4}">?</text>`)
      }
    }

    // Status chip.
    const label = STATUS_TEXT[branch.status]
    const chipWidth = Math.round(label.length * 6.6 + 16)
    out.push(
      `<rect class="c-${branch.status}" x="${chipRight - chipWidth}" y="${y - 9}" width="${chipWidth}" height="18" rx="9"/>`,
      `<text class="chip t-${branch.status}" x="${chipRight - chipWidth / 2}" y="${y + 3.5}" text-anchor="middle">${label}</text>`,
      '</g>',
    )
  })

  out.push('</svg>')
  const alt = `${branches.length} ${branches.length === 1 ? 'branch' : 'branches'}: ${branches
    .slice(0, 8)
    .map(branch => `${branch.name} (${STATUS_TEXT[branch.status]})`)
    .join(', ')}${branches.length > 8 ? ', …' : ''}.`
  return { source: out.join(''), height, alt }
}

/** Bar length grows with the log of the count, so 1 and 1000 both read. */
export const barWidth = (count: number, half: number = BAR_HALF): number =>
  Math.min(half - 18, Math.round(((4 + 9 * Math.log2(1 + count)) * half) / BAR_HALF))

/** "today", "1d", "3w", "4mo", "2y": the age for a narrow pane. */
export const shortAge = (date: string, today: string): string => {
  const days = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000)
  if (!Number.isFinite(days)) return ''
  if (days <= 0) return 'today'
  if (days < 14) return `${days}d`
  if (days < 60) return `${Math.round(days / 7)}w`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${Math.round(days / 365)}y`
}

/** "today", "yesterday", "3 days ago", "5 weeks ago", "4 months ago", "2 years ago". */
export const age = (date: string, today: string): string => {
  const days = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000)
  if (!Number.isFinite(days)) return date
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  if (days < 365) return `${Math.round(days / 30)} months ago`
  const years = Math.round(days / 365)
  return years === 1 ? 'a year ago' : `${years} years ago`
}

const tooltip = (branch: Branch): string =>
  [
    `${branch.name}${branch.isHead ? ' (HEAD)' : ''}`,
    `${branch.sha}  last commit ${branch.date}`,
    branch.upstream ? `tracks ${branch.upstream}` : branch.kind === 'remote' ? 'remote only' : branch.hasRemote ? 'also on origin' : 'local only',
    branch.status === 'base'
      ? 'the branch others are compared with'
      : `${branch.behind ?? '?'} behind, ${branch.ahead ?? '?'} ahead of the base`,
  ].join('\n')

const clip = (text: string, room: number): string =>
  room <= 1 ? '' : text.length <= room ? text : `${text.slice(0, room - 1)}…`

const esc = (text: string): string =>
  text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Lane layout for the commit graph. Pure: commits in, rows and edges out.
//
// Commits come newest first (git log --date-order). Walking down, each lane
// holds the id of the commit it expects next. A commit takes the lane that
// expects it (lane 0 for the base branch's first-parent line), its first
// parent continues in that lane, and each further parent of a merge gets a
// lane of its own unless one already expects it.

import type { Commit } from '../../types'

export type Row = {
  id: string
  /** Index in the commit list, top row 0. */
  row: number
  lane: number
}

export type Edge = {
  /** Row of the child commit. */
  from: number
  /** Row of the parent, or `undefined` when the parent is below the list. */
  to: number | undefined
  fromLane: number
  /** The lane the edge runs down in between the two rows. */
  viaLane: number
  /** The parent's lane; equals `viaLane` when the parent is below the list. */
  toLane: number
  /** True for the second and later parents of a merge. */
  isMerge: boolean
}

export type Layout = {
  rows: Row[]
  edges: Edge[]
  /** How many lanes are used: the widest point of the graph. */
  laneCount: number
}

/** The base branch's first-parent line, from its tip down the list. */
export const firstParentLine = (commits: Commit[], tip: string | undefined): Set<string> => {
  const line = new Set<string>()
  if (!tip) return line
  const byId = new Map(commits.map(commit => [commit.id, commit]))
  for (let id: string | undefined = tip; id && byId.has(id) && !line.has(id); id = byId.get(id)?.parents[0]) {
    line.add(id)
  }
  return line
}

/** The commit a ref decoration points at: `main`, `origin/main`, `HEAD -> main`. */
export const tipOf = (commits: Commit[], ref: string): string | undefined =>
  commits.find(commit => commit.refs.some(r => r === ref || r === `HEAD -> ${ref}`))?.id

export const layoutGraph = (commits: Commit[], baseTip?: string): Layout => {
  const baseLine = firstParentLine(commits, baseTip)
  const reserved = baseLine.size > 0
  const firstFree = reserved ? 1 : 0

  // lanes[i] is the id lane i expects next, or undefined when the lane is free.
  const lanes: (string | undefined)[] = reserved ? [undefined] : []
  const rowOf = new Map<string, number>()
  const laneOf = new Map<string, number>()
  // Edges wait here until the parent's row is known: parent id → pending edges.
  const pending = new Map<string, Omit<Edge, 'to' | 'toLane'>[]>()
  const rows: Row[] = []
  let laneCount = lanes.length

  const freeLane = (): number => {
    for (let i = firstFree; i < lanes.length; i++) if (lanes[i] === undefined) return i
    lanes.push(undefined)
    return lanes.length - 1
  }

  commits.forEach((commit, row) => {
    const expecting = lanes.flatMap((id, i) => (id === commit.id ? [i] : []))
    const lane = baseLine.has(commit.id) ? 0 : (expecting[0] ?? freeLane())
    for (const i of expecting) lanes[i] = undefined

    rows.push({ id: commit.id, row, lane })
    rowOf.set(commit.id, row)
    laneOf.set(commit.id, lane)

    commit.parents.forEach((parent, index) => {
      let via: number
      if (index === 0) {
        // The first parent always continues straight down in this lane.
        via = lane
      } else {
        const existing = lanes.indexOf(parent)
        via = existing >= firstFree && existing !== -1 ? existing : freeLane()
      }
      if (index === 0 || lanes[via] === undefined) lanes[via] = parent
      const edge = { from: row, fromLane: lane, viaLane: via, isMerge: index > 0 }
      pending.set(parent, [...(pending.get(parent) ?? []), edge])
    })

    laneCount = Math.max(laneCount, lane + 1, lanes.length)
  })

  const edges: Edge[] = []
  for (const [parent, waiting] of pending) {
    const to = rowOf.get(parent)
    const toLane = laneOf.get(parent)
    for (const edge of waiting) {
      edges.push(
        to === undefined || toLane === undefined
          ? { ...edge, to: undefined, toLane: edge.viaLane }
          : { ...edge, to, toLane },
      )
    }
  }
  edges.sort((a, b) => a.from - b.from || a.viaLane - b.viaLane)

  return { rows, edges, laneCount: Math.max(laneCount, 1) }
}

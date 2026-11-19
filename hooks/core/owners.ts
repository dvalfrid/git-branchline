// Which branch each commit belongs to, so the graph can color and name whole
// branches instead of lanes (a lane is reused by later branches). Pure.
//
// Walking from each branch tip down its first parents, a commit goes to the
// first branch that reaches it: the base first, then HEAD's branch, then the
// rest newest first. Commits no branch reaches (a branch merged and deleted)
// get one named from the merge commit that brought them in, when it says.

import type { Commit } from '../../types'
import type { Edge } from './layout'
import { REMOTES } from './svg'

export type Owner = {
  name: string
  /** Index into the lane colors: 0 (grey) for the base, then cycling. */
  color: number
  /** True when no ref names it and the name came from a merge message (or none). */
  isMerged: boolean
  /** The owner's newest and oldest commit in the list. */
  tip: string
  start: string
}

export type Owners = {
  owners: Owner[]
  /** Owner index by commit id. */
  ownerOf: Map<string, number>
}

const COLORS = 6

/** Branch names a decoration list holds: `HEAD -> main, origin/x, tag: v1` → main, origin/x. */
export const branchNames = (refs: string[]): string[] =>
  refs.flatMap(ref => {
    if (ref.startsWith('tag: ') || ref === 'HEAD' || ref.endsWith('/HEAD')) return []
    return [ref.startsWith('HEAD -> ') ? ref.slice(8) : ref]
  })

const MERGE = /^Merge (?:branch|remote-tracking branch) '([^']+)'|^Merge pull request #\d+ from ([^\s]+)/

export const assignOwners = (commits: Commit[], base: string): Owners => {
  const byId = new Map(commits.map(commit => [commit.id, commit]))
  const ownerOf = new Map<string, number>()
  const owners: Owner[] = []

  // Tips in priority order: the base, HEAD's branch, then by position (newest first).
  type Tip = { name: string; id: string; isMerged: boolean; isBase?: boolean }
  const tips: Tip[] = []
  const seen = new Set<string>()
  const addTip = (name: string, id: string, isBase = false) => {
    if (!seen.has(name)) {
      seen.add(name)
      tips.push({ name, id, isMerged: false, isBase })
    }
  }
  // A local name and its remote copy are one branch: the local name wins.
  const preferredName = (commit: Commit) => {
    const names = branchNames(commit.refs)
    return names.find(name => !REMOTES.some(remote => name.startsWith(`${remote}/`))) ?? names[0]
  }
  const baseTip = commits.find(commit => branchNames(commit.refs).includes(base))
  if (baseTip) addTip(preferredName(baseTip) ?? base, baseTip.id, true)
  const head = commits.find(commit => commit.refs.some(ref => ref.startsWith('HEAD -> ')))
  if (head) addTip(head.refs.find(ref => ref.startsWith('HEAD -> '))!.slice(8), head.id)
  for (const commit of commits) {
    const name = preferredName(commit)
    if (name) addTip(name, commit.id)
  }

  const walk = (tip: Tip) => {
    let id: string | undefined = tip.id
    if (ownerOf.has(id)) return
    const index = owners.length
    // Grey for the base, the other colors in turn for the rest.
    const color = tip.isBase ? 0 : 1 + (owners.filter(owner => owner.color !== 0).length % (COLORS - 1))
    let last = id
    while (id && byId.has(id) && !ownerOf.has(id)) {
      ownerOf.set(id, index)
      last = id
      id = byId.get(id)!.parents[0]
    }
    owners.push({ name: tip.name, color, isMerged: tip.isMerged, tip: tip.id, start: last })
  }
  for (const tip of tips) walk(tip)

  // What is left came in through merges: name it from the merge message.
  for (const commit of commits) {
    for (const parent of commit.parents.slice(1)) {
      if (!byId.has(parent) || ownerOf.has(parent)) continue
      const match = MERGE.exec(commit.subject)
      walk({ name: match?.[1] ?? match?.[2] ?? 'merged branch', id: parent, isMerged: true })
    }
  }
  for (const commit of commits) if (!ownerOf.has(commit.id)) walk({ name: 'unnamed', id: commit.id, isMerged: true })

  return { owners, ownerOf }
}

/**
 * An edge's color: a first-parent edge belongs to the child's branch (it is
 * that branch's line), a merge edge to the branch it brings in.
 */
export const edgeOwner = (edge: Edge, rows: { id: string }[], owners: Owners): number | undefined => {
  const child = rows[edge.from]?.id
  if (!child) return undefined
  if (!edge.isMerge) return owners.ownerOf.get(child)
  const parent = edge.to !== undefined ? rows[edge.to]?.id : undefined
  return parent !== undefined ? owners.ownerOf.get(parent) : owners.ownerOf.get(child)
}

// Folds long, quiet stretches of history into one row: a chain of commits in
// a line with no refs, no merges and no branches off them, such as a run of
// CMS edits. Pure: commits in, commits out, before the layout runs.

import type { Commit } from '../../types'

/** Chains shorter than this stay as they are. */
export const MIN_RUN = 4

/** A row of the graph: a commit, or a folded chain standing in for several. */
export type GraphCommit = Commit & {
  /** How many commits the row stands for; absent for a single commit. */
  count?: number
  /** For a folded row, the date of its oldest commit. */
  firstDate?: string
}

export const compactCommits = (commits: Commit[], minRun = MIN_RUN): GraphCommit[] => {
  const byId = new Map(commits.map(commit => [commit.id, commit]))
  const children = new Map<string, number>()
  for (const commit of commits) {
    for (const parent of commit.parents) children.set(parent, (children.get(parent) ?? 0) + 1)
  }
  const isQuiet = (commit: Commit) => commit.refs.length === 0 && commit.parents.length === 1

  const folded = new Set<string>()
  const out: GraphCommit[] = []
  for (const commit of commits) {
    if (folded.has(commit.id)) continue
    const chain = [commit]
    if (isQuiet(commit)) {
      let next = byId.get(commit.parents[0]!)
      while (next && isQuiet(next) && children.get(next.id) === 1 && !folded.has(next.id)) {
        chain.push(next)
        next = byId.get(next.parents[0]!)
      }
    }
    if (chain.length < minRun) {
      out.push(commit)
      continue
    }
    for (const member of chain) folded.add(member.id)
    const last = chain[chain.length - 1]!
    out.push({
      id: commit.id,
      parents: last.parents,
      date: commit.date,
      firstDate: last.date,
      author: authors(chain),
      refs: [],
      subject: `${chain.length} commits`,
      count: chain.length,
    })
  }
  return out
}

/** Distinct authors, most frequent first, at most three then `…`. */
export const authors = (chain: Commit[]): string => {
  const counts = new Map<string, number>()
  for (const commit of chain) counts.set(commit.author, (counts.get(commit.author) ?? 0) + 1)
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  return names.length > 3 ? `${names.slice(0, 3).join(', ')}, …` : names.join(', ')
}

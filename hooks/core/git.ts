// Pure parsing of git output. No `$` here, so this file can be reused
// outside the mod (for example in an MCP server).

import type { Branch, BranchStatus, Commit, Tag } from '../../types'

export const FS = '\x1f'
export const RS = '\x1e'

/** Unmerged branches with no commit for this many days count as stale. */
export const STALE_DAYS = 90

export const REF_FORMAT = [
  '%(refname)',
  '%(objectname:short)',
  '%(upstream:short)',
  '%(committerdate:short)',
  '%(HEAD)',
].join('%1f')

export const LOG_FORMAT = ['%h', '%p', '%ad', '%an', '%D', '%s'].join('%x1f') + '%x1e'

export type RawRef = {
  refname: string
  sha: string
  upstream: string
  date: string
  isHead: boolean
}

export type Counts = Map<string, { ahead: number; behind: number }>

export const parseRefs = (stdout: string): RawRef[] =>
  lines(stdout).map(line => {
    const [refname = '', sha = '', upstream = '', date = '', head = ''] = line.split(FS)
    return { refname, sha, upstream, date, isHead: head.trim() === '*' }
  })

/** Lines of `<refname><FS><ahead> <behind>` to a map keyed by refname. */
export const parseAheadBehind = (stdout: string): Counts => {
  const map: Counts = new Map()
  for (const line of lines(stdout)) {
    const [refname = '', counts = ''] = line.split(FS)
    const [ahead, behind] = counts.trim().split(/\s+/).map(Number)
    if (refname && isCount(ahead) && isCount(behind)) map.set(refname, { ahead, behind })
  }
  return map
}

/** `git rev-list --left-right --count base...branch` prints `behind<TAB>ahead`. */
export const parseLeftRight = (stdout: string): { ahead: number; behind: number } | undefined => {
  const [behind, ahead] = stdout.trim().split(/\s+/).map(Number)
  return isCount(ahead) && isCount(behind) ? { ahead, behind } : undefined
}

export const parseLog = (stdout: string): Commit[] =>
  stdout
    .split(RS)
    .map(record => record.replace(/^\r?\n/, ''))
    .filter(record => record.trim() !== '')
    .map(record => {
      const [id = '', parents = '', date = '', author = '', refs = '', subject = ''] = record.split(FS)
      return {
        id,
        parents: parents.split(' ').filter(Boolean),
        date,
        author,
        refs: refs
          .split(',')
          .map(ref => ref.trim())
          .filter(Boolean),
        subject: subject.replace(/\r?\n$/, ''),
      }
    })

/**
 * The default branch's short name: from `origin/HEAD` when set, else the first
 * of main and master that exists locally, else the checked-out branch.
 */
export const defaultBranch = (refs: RawRef[], originHead: string | undefined): string | undefined => {
  if (originHead) return originHead.replace(/^origin\//, '')
  const locals = new Set(refs.filter(isLocal).map(ref => short(ref.refname)))
  for (const name of ['main', 'master']) if (locals.has(name)) return name
  const head = refs.find(ref => ref.isHead)
  return head ? short(head.refname) : undefined
}

/** `origin/<default>` when it exists, else the local default branch. */
export const baseRef = (refs: RawRef[], defaultName: string): string =>
  refs.some(ref => ref.refname === `refs/remotes/origin/${defaultName}`) ? `origin/${defaultName}` : defaultName

export type BuildInput = {
  refs: RawRef[]
  counts: Counts
  defaultName: string
  base: string
  /** YYYY-MM-DD, for deciding what is stale. */
  today: string
}

/**
 * The branch table: every local branch, plus remote branches that no local
 * branch tracks or mirrors. Base first, then HEAD, then newest first.
 */
export const buildBranches = ({ refs, counts, defaultName, base, today }: BuildInput): Branch[] => {
  const locals = refs.filter(isLocal)
  const covered = new Set<string>()
  for (const local of locals) {
    if (local.upstream) covered.add(local.upstream)
    covered.add(`origin/${short(local.refname)}`)
  }
  const remotes = refs.filter(
    ref => ref.refname.startsWith('refs/remotes/') && !ref.refname.endsWith('/HEAD') && !covered.has(short(ref.refname)),
  )

  const baseNames = new Set([defaultName, base])
  const branches = [...locals, ...remotes].map(ref => {
    const name = short(ref.refname)
    const count = counts.get(ref.refname)
    const status: BranchStatus = baseNames.has(name)
      ? 'base'
      : count && count.ahead === 0
        ? 'merged'
        : daysBetween(ref.date, today) > STALE_DAYS
          ? 'stale'
          : 'open'
    const branch: Branch = {
      name,
      kind: isLocal(ref) ? 'local' : 'remote',
      sha: ref.sha,
      date: ref.date,
      status,
      isHead: ref.isHead,
    }
    if (ref.upstream) branch.upstream = ref.upstream
    if (count) {
      branch.ahead = count.ahead
      branch.behind = count.behind
    }
    return branch
  })

  const rank = (branch: Branch) => (branch.status === 'base' ? 0 : branch.isHead ? 1 : 2)
  return branches.sort(
    (a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date) || a.name.localeCompare(b.name),
  )
}

export const buildTags = (refs: RawRef[]): Tag[] =>
  refs
    .filter(ref => ref.refname.startsWith('refs/tags/'))
    .map(ref => ({ name: short(ref.refname), sha: ref.sha }))

/** `refs/heads/x` to `x`, `refs/remotes/origin/x` to `origin/x`, `refs/tags/v1` to `v1`. */
export const short = (refname: string): string => refname.replace(/^refs\/(heads|remotes|tags)\//, '')

const isLocal = (ref: RawRef): boolean => ref.refname.startsWith('refs/heads/')

const isCount = (value: number | undefined): value is number =>
  value !== undefined && Number.isInteger(value) && value >= 0

const lines = (stdout: string): string[] => stdout.split(/\r?\n/).filter(line => line.trim() !== '')

const daysBetween = (from: string, to: string): number => {
  const a = Date.parse(from)
  const b = Date.parse(to)
  return Number.isFinite(a) && Number.isFinite(b) ? (b - a) / 86_400_000 : 0
}

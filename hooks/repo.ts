// Reads the repository with git. Takes a `run` function instead of `$`, so
// tests and other hosts can supply their own.

import type { Snapshot } from '../types'
import {
  LOG_FORMAT,
  REF_FORMAT,
  baseRef,
  buildBranches,
  buildTags,
  defaultBranch,
  parseAheadBehind,
  parseLeftRight,
  parseLog,
  parseRefs,
  short,
  type Counts,
  type RawRef,
} from './core/git'

export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type Run = (argv: string[]) => Promise<RunResult>
type Git = (...args: string[]) => Promise<RunResult>

/** How many commits to read for the graph. */
export const COMMIT_LIMIT = 200

export const readRepo = async (run: Run, now: Date): Promise<Snapshot> => {
  const top = await run(['git', 'rev-parse', '--show-toplevel'])
  if (top.exitCode !== 0) return { state: 'not-repo' }
  const root = top.stdout.trim()
  const git: Git = (...args) => run(['git', '-C', root, ...args])

  const refsOut = await git('for-each-ref', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes', 'refs/tags')
  if (refsOut.exitCode !== 0) return { state: 'error', message: firstLine(refsOut.stderr) }
  const refs = parseRefs(refsOut.stdout)

  const originHeadOut = await git('symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD')
  const originHead = originHeadOut.exitCode === 0 ? originHeadOut.stdout.trim() || undefined : undefined
  const defaultName = defaultBranch(refs, originHead)

  const logOut = await git(
    'log',
    '--all',
    '--date-order',
    '-n',
    String(COMMIT_LIMIT),
    `--format=${LOG_FORMAT}`,
    '--date=short',
  )
  const commits = logOut.exitCode === 0 ? parseLog(logOut.stdout) : []

  const headRef = refs.find(ref => ref.isHead)
  const head = headRef ? short(headRef.refname) : await detachedHead(git)
  const readAt = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const tags = buildTags(refs)

  if (!defaultName) return { state: 'ok', root, base: '', head, branches: [], tags, commits, readAt }

  const base = baseRef(refs, defaultName)
  const counts = await readCounts(git, refs, base)
  const branches = buildBranches({ refs, counts, defaultName, base, today: isoDate(now) })

  return { state: 'ok', root, base, head, branches, tags, commits, readAt }
}

/**
 * Ahead/behind for every branch against `base`: one call with
 * `%(ahead-behind:...)` (git 2.41 and later), else one rev-list per branch.
 */
const readCounts = async (git: Git, refs: RawRef[], base: string): Promise<Counts> => {
  const one = await git('for-each-ref', `--format=%(refname)%1f%(ahead-behind:${base})`, 'refs/heads', 'refs/remotes')
  if (one.exitCode === 0) return parseAheadBehind(one.stdout)

  const counts: Counts = new Map()
  for (const ref of refs) {
    const isBranch = ref.refname.startsWith('refs/heads/') || ref.refname.startsWith('refs/remotes/')
    if (!isBranch || ref.refname.endsWith('/HEAD')) continue
    const out = await git('rev-list', '--left-right', '--count', `${base}...${ref.refname}`)
    const count = out.exitCode === 0 ? parseLeftRight(out.stdout) : undefined
    if (count) counts.set(ref.refname, count)
  }
  return counts
}

const detachedHead = async (git: Git): Promise<string> => {
  const out = await git('rev-parse', '--short', 'HEAD')
  return out.exitCode === 0 ? `${out.stdout.trim()} (detached)` : '(no commits)'
}

const firstLine = (text: string): string => text.trim().split(/\r?\n/)[0] || 'git failed'
const pad = (n: number): string => String(n).padStart(2, '0')
const isoDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

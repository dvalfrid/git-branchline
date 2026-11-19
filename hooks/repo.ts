// Reads the repository with git. Takes a `run` function instead of `$`, so
// tests and other hosts can supply their own.

import type { BranchDetails, Snapshot } from '../types'
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

/**
 * A cheap fingerprint of the repo: every ref with its commit, which branch is
 * checked out, and HEAD's commit (for a detached HEAD). Any commit, fetch,
 * pull, checkout, merge, rebase, reset or tag changes it.
 */
export const readSignature = async (run: Run): Promise<string> => {
  const refs = await run(['git', 'for-each-ref', '--format=%(refname) %(objectname) %(HEAD)'])
  if (refs.exitCode !== 0) return 'not-repo'
  const head = await run(['git', 'rev-parse', '--verify', '--quiet', 'HEAD'])
  return `${head.stdout.trim()}\n${refs.stdout}`
}

/** How many of the branch's own commits and changed files the details list. */
export const DETAIL_COMMITS = 15
export const DETAIL_FILES = 10

/**
 * What a branch has that the base lacks: its commits and the files they
 * change. For the base itself, its latest commits and no files.
 */
export const readBranchDetails = async (run: Run, base: string, name: string): Promise<BranchDetails> => {
  const isBase = name === base || base.endsWith(`/${name}`)
  const range = isBase ? [name] : [`${base}..${name}`]
  const log = await run(['git', 'log', '-n', String(DETAIL_COMMITS), '--format=%h%x1f%ad%x1f%an%x1f%s', '--date=short', ...range, '--'])
  if (log.exitCode !== 0) return { name, state: 'error', message: firstLine(log.stderr) }
  const commits = log.stdout
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .map(line => {
      const [id = '', date = '', author = '', subject = ''] = line.split('\x1f')
      return { id, date, author, subject }
    })
  if (isBase) return { name, state: 'ok', isBase, commits, files: [], added: 0, removed: 0, fileCount: 0 }

  const numstat = await run(['git', 'diff', '--numstat', `${base}...${name}`, '--'])
  const files = numstat.exitCode === 0 ? parseNumstat(numstat.stdout) : []
  const added = files.reduce((sum, file) => sum + file.added, 0)
  const removed = files.reduce((sum, file) => sum + file.removed, 0)
  const top = [...files].sort((a, b) => b.added + b.removed - (a.added + a.removed)).slice(0, DETAIL_FILES)
  return { name, state: 'ok', isBase, commits, files: top, added, removed, fileCount: files.length }
}

/** `git diff --numstat`: `added<TAB>removed<TAB>path`, `-` for binary files. */
export const parseNumstat = (stdout: string): { path: string; added: number; removed: number }[] =>
  stdout
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .map(line => {
      const [added = '0', removed = '0', ...path] = line.split('\t')
      return { path: path.join('\t'), added: Number(added) || 0, removed: Number(removed) || 0 }
    })

/**
 * Deletes local branches with `git branch -d`, which refuses a branch whose
 * commits are not merged anywhere, so no work is lost. One call per branch,
 * so one refusal does not stop the rest.
 */
export const deleteBranches = async (
  run: Run,
  root: string,
  names: string[],
): Promise<{ name: string; ok: boolean; message: string }[]> => {
  const results: { name: string; ok: boolean; message: string }[] = []
  for (const name of names) {
    const out = await run(['git', '-C', root, 'branch', '-d', '--', name])
    results.push({ name, ok: out.exitCode === 0, message: firstLine(out.exitCode === 0 ? out.stdout : out.stderr) })
  }
  return results
}

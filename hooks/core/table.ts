// Turns a snapshot into text for the pane. Pure, like git.ts.

import type { Branch, BranchGroup, Snapshot } from '../../types'
import { cellCodeSpan } from './markdown'

type Ok = Extract<Snapshot, { state: 'ok' }>

export const headline = (snapshot: Ok): string => {
  const repo = snapshot.root.split(/[\\/]/).filter(Boolean).pop() ?? snapshot.root
  const parts = [`**${escape(repo)}**`, `HEAD ${code(snapshot.head)}`]
  if (snapshot.base) parts.push(`compared with ${code(snapshot.base)}`)
  parts.push(`read ${snapshot.readAt}`)
  return parts.join(' · ')
}

/**
 * One short line for the row above the prompt: the checked-out branch and
 * how it stands against the base, `feature/x · 2 ahead, 1 behind origin/main`.
 */
export const bandStatus = (snapshot: Ok): string => {
  const branch = snapshot.branches.find(b => b.isHead && b.kind === 'local')
  if (!branch) return `HEAD ${snapshot.head}`
  if (branch.status === 'base' || !snapshot.base || branch.ahead === undefined || branch.behind === undefined) return branch.name
  const parts = [
    branch.ahead > 0 ? `${branch.ahead} ahead` : '',
    branch.behind > 0 ? `${branch.behind} behind` : '',
  ].filter(Boolean)
  return `${branch.name} · ${parts.length > 0 ? `${parts.join(', ')} ${snapshot.base}` : `even with ${snapshot.base}`}`
}

/** The branch table as markdown, or a sentence when there are no branches. */
export const branchTable = (branches: Branch[]): string => {
  if (branches.length === 0) return '_No branches yet._'
  const rows = branches.map(
    branch => `| ${[name(branch), branch.date, count(branch, 'behind'), count(branch, 'ahead'), status(branch)].join(' | ')} |`,
  )
  return ['| Branch | Last commit | Behind | Ahead | Status |', '|---|---|--:|--:|---|', ...rows].join('\n')
}

export const STATUS_LABEL: Record<Branch['status'], string> = {
  base: 'base',
  open: 'open',
  merged: 'merged',
  stale: 'stale',
}

const code = cellCodeSpan

const name = (branch: Branch): string => (branch.isHead ? `**${code(branch.name)}**` : code(branch.name))

const count = (branch: Branch, which: 'ahead' | 'behind'): string => {
  if (branch.status === 'base') return '–'
  const value = branch[which]
  return value === undefined ? '?' : String(value)
}

const status = (branch: Branch): string => {
  const parts: string[] = []
  if (branch.isHead) parts.push('HEAD')
  parts.push(STATUS_LABEL[branch.status])
  if (branch.kind === 'remote') parts.push('remote only')
  return parts.join(' · ')
}

const escape = (text: string): string => text.replace(/([\\`*_|[\]])/g, '\\$1')

export const GROUPS: { id: BranchGroup; title: string }[] = [
  { id: 'active', title: 'Active' },
  { id: 'tracked', title: 'Local and remote' },
  { id: 'remote', title: 'Remote only' },
  { id: 'old', title: 'Old local' },
]

/** The groups in table order, empty ones left out; branches keep their order. */
export const groupBranches = (branches: Branch[]): { id: BranchGroup; title: string; branches: Branch[] }[] =>
  GROUPS.map(group => ({ ...group, branches: branches.filter(branch => branch.group === group.id) })).filter(
    group => group.branches.length > 0,
  )

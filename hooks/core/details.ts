// Text for an opened branch: the details shown under its row, and the
// question put in the prompt box. Pure.

import type { Branch, BranchDetails } from '../../types'
import { codeSpan } from './markdown'

export const detailsMarkdown = (branch: Branch, details: BranchDetails, base: string): string => {
  if (details.state === 'loading') return '_Reading…_'
  if (details.state === 'error') return `git failed: ${details.message}`
  if (details.isBase) {
    const lines = details.commits.map(commit => `- ${commitLine(commit)}`)
    return [`Latest commits on ${code(branch.name)}:`, ...lines].join('\n')
  }

  const ahead = branch.ahead ?? details.commits.length
  const parts = [`**${plural(ahead, 'commit')}** not on ${code(base)}`]
  if (branch.behind !== undefined) parts.push(`${branch.behind} behind`)
  if (details.fileCount > 0) parts.push(`${plural(details.fileCount, 'file')}, +${details.added} −${details.removed}`)
  const out = [parts.join(' · ')]

  if (details.commits.length > 0) {
    out.push('', ...details.commits.map(commit => `- ${commitLine(commit)}`))
    if (ahead > details.commits.length) out.push(`- _… and ${ahead - details.commits.length} more_`)
  } else {
    out.push('', `_Everything on it is already on ${code(base)}._`)
  }
  if (details.files.length > 0) {
    out.push('', ...details.files.map(file => `- ${code(file.path)} +${file.added} −${file.removed}`))
    if (details.fileCount > details.files.length) out.push(`- _… and ${details.fileCount - details.files.length} more files_`)
  }
  return out.join('\n')
}

/** The question the Ask button puts in the prompt box; it changes nothing by itself. */
export const askPrompt = (branch: Branch, base: string): string => {
  if (branch.status === 'base') {
    return `Give me an overview of the latest work on ${code(branch.name)} in this repo. Don't change anything.`
  }
  const where =
    branch.ahead !== undefined && branch.behind !== undefined
      ? `${plural(branch.ahead, 'commit')} ahead of and ${branch.behind} behind ${code(base)}`
      : `compared with ${code(base)}`
  const remote = branch.kind === 'remote' ? 'It exists only on the remote. ' : ''
  return (
    `Look at the branch ${code(branch.name)} in this repo: ${where}, last commit ${branch.date}. ${remote}` +
    `What does it contain, is it ready to merge, does it need updating from ${code(base)}, or can it be deleted? ` +
    `Don't change anything yet.`
  )
}

/** Whether the pane may delete the branch itself: local, not checked out, nothing unmerged. */
export const canDeleteHere = (branch: Branch): boolean =>
  branch.kind === 'local' && !branch.isHead && branch.status !== 'base' && branch.ahead === 0

/**
 * The prompt for a delete the pane leaves to Claude: an unmerged local branch
 * (work would be lost) or a branch on the remote (others may use it).
 */
export const deletePrompt = (branch: Branch, base: string, where: 'local' | 'remote'): string => {
  if (where === 'remote') {
    const remoteName = branch.kind === 'remote' ? branch.name : branch.upstream ?? `origin/${branch.name}`
    const [remote = 'origin', ...rest] = remoteName.split('/')
    return (
      `Delete the branch ${code(remoteName)} on the remote (${code(`git push ${remote} --delete ${rest.join('/')}`)}). ` +
      `First check whether it is merged into ${code(base)} and whether an open pull request uses it, tell me, and ask before you delete.`
    )
  }
  const ahead = branch.ahead !== undefined ? `${plural(branch.ahead, 'commit')} that ${branch.ahead === 1 ? 'is' : 'are'} not on ${code(base)}` : `commits that may not be on ${code(base)}`
  return (
    `Delete the local branch ${code(branch.name)}. It has ${ahead}, so \`git branch -d\` will refuse it. ` +
    `First show me those commits and whether they exist anywhere else, then ask before you force the delete with \`git branch -D\`.`
  )
}

const commitLine = (commit: { id: string; date: string; author: string; subject: string }) =>
  `${code(commit.id)} ${commit.date} ${escape(commit.author)}: ${escape(commit.subject)}`

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const code = codeSpan
const escape = (text: string) => text.replace(/([\\`*_[\]<>|])/g, '\\$1')

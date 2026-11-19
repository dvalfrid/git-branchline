// Text for an opened branch: the details shown under its row, and the
// question put in the prompt box. Pure.

import type { Branch, BranchDetails } from '../../types'

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
    return `Give me an overview of the latest work on \`${branch.name}\` in this repo. Don't change anything.`
  }
  const where =
    branch.ahead !== undefined && branch.behind !== undefined
      ? `${plural(branch.ahead, 'commit')} ahead of and ${branch.behind} behind \`${base}\``
      : `compared with \`${base}\``
  const remote = branch.kind === 'remote' ? 'It exists only on the remote. ' : ''
  return (
    `Look at the branch \`${branch.name}\` in this repo: ${where}, last commit ${branch.date}. ${remote}` +
    `What does it contain, is it ready to merge, does it need updating from \`${base}\`, or can it be deleted? ` +
    `Don't change anything yet.`
  )
}

const commitLine = (commit: { id: string; date: string; author: string; subject: string }) =>
  `${code(commit.id)} ${commit.date} ${escape(commit.author)}: ${escape(commit.subject)}`

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const code = (text: string) => '`' + text.replace(/`/g, "'") + '`'
const escape = (text: string) => text.replace(/([\\`*_[\]<>|])/g, '\\$1')

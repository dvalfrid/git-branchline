// Markdown pieces shared by the pane's text. Pure.

/**
 * A name as an inline code span, exactly as it is: a fence of backticks one
 * longer than any run inside it, so a branch or path holding backticks (Git
 * allows them) shows whole and cannot end the span early, in the pane or in a
 * prompt put in the prompt box.
 */
export const codeSpan = (text: string): string => {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

/** The same inside a table cell, where a pipe would end the cell. */
export const cellCodeSpan = (text: string): string => codeSpan(text).replace(/\|/g, '\\|')
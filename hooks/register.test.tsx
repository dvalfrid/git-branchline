import { expect, test } from 'claude-code/testing'

import { FS, RS } from './core/git'

const PANE = {
  plugin: 'git-branchline',
  component: 'Pane',
  requestId: 'branchline',
  props: {
    title: 'Branchline',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const row = (...fields: string[]) => fields.join(FS)

/** A small repo: main (HEAD), an open feature, a stale branch, a merged remote-only branch, a tag. */
const fakeGit = (argv: readonly string[]): { exitCode: number; stdout: string; stderr: string } => {
  const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '' })
  const args = argv.join(' ')
  if (args === 'git rev-parse --show-toplevel') return ok('D:/Development/demo\n')
  if (args.includes('symbolic-ref')) return ok('origin/main\n')
  if (args.includes('ahead-behind:origin/main')) {
    return ok(
      [
        row('refs/heads/main', '0 0'),
        row('refs/heads/feature/x', '2 1'),
        row('refs/heads/old', '3 40'),
        row('refs/remotes/origin/HEAD', '0 0'),
        row('refs/remotes/origin/main', '0 0'),
        row('refs/remotes/origin/cms', '0 5'),
      ].join('\n') + '\n',
    )
  }
  if (args.includes('for-each-ref')) {
    return ok(
      [
        row('refs/heads/main', 'a1', 'origin/main', '2026-11-18', '*'),
        row('refs/heads/feature/x', 'b2', '', '2026-11-17', ' '),
        row('refs/heads/old', 'c3', '', '2026-01-01', ' '),
        row('refs/remotes/origin/HEAD', 'a1', '', '2026-11-18', ' '),
        row('refs/remotes/origin/main', 'a1', '', '2026-11-18', ' '),
        row('refs/remotes/origin/cms', 'd4', '', '2026-11-10', ' '),
        row('refs/tags/v1', 'a1', '', '2026-11-01', ' '),
      ].join('\n') + '\n',
    )
  }
  if (args.includes(' log ')) {
    return ok(
      row('a1', 'e5', '2026-11-18', 'Daniel', 'HEAD -> main, origin/main, tag: v1', 'Add pane') +
        RS +
        '\n' +
        row('e5', '', '2026-11-01', 'Daniel', '', 'First') +
        RS +
        '\n',
    )
  }
  return { exitCode: 1, stdout: '', stderr: `unexpected: ${args}` }
}

test('the pane shows the branch table, on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => ({ value: fakeGit(e.argv) }))

  const { text } = await $.command.run({ command: 'branchline' })
  expect(text).toBe('Branchline updated.')

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    const headline = await ui.find({ type: 'Markdown', text: /demo/ })
    expect(headline?.text).toContain('HEAD `main`')
    expect(headline?.text).toContain('compared with `origin/main`')

    const svg = await ui.find({ type: 'Svg' })
    expect(svg !== undefined).toBe(surface === 'desktop' || surface === 'vscode')
    // Drawn at the pane's width (80 cells) and its full height, never scaled.
    if (svg) expect([svg.props.width, svg.props.height]).toEqual([672, 2 * 24])

    const table = (await ui.find({ type: 'Markdown', text: /\| Branch \|/ }))?.text ?? ''
    const lines = table.split('\n').slice(2)
    expect(lines).toEqual([
      '| **`main`** | 2026-11-18 | – | – | HEAD · base |',
      '| `feature/x` | 2026-11-17 | 1 | 2 | open |',
      '| `origin/cms` | 2026-11-10 | 5 | 0 | merged · remote only |',
      '| `old` | 2026-01-01 | 40 | 3 | stale |',
    ])
    await ui.unmount()
  }
})

test('a folder outside git says so', async ($, on) => {
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } }))

  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe("This session's folder is not a Git repository.")
  await ui.unmount()
})

test('before the first read the pane says it is reading', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('Reading the repository…')
  await ui.unmount()
})

test('quiet stretches fold when they do not fit, and the button shows every commit', async ($, on) => {
  // Below the tip, seven quiet commits fold into one square; the root (no parent) stays.
  const log =
    Array.from({ length: 9 }, (_, i) =>
      row(`c${i}`, i < 8 ? `c${i + 1}` : '', '2026-11-01', 'Lars', i === 0 ? 'HEAD -> main' : '', `edit ${i}`),
    ).join(RS + '\n') + RS
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    if (args.includes(' log ')) return { value: { exitCode: 0, stdout: log, stderr: '' } }
    if (args.includes('ahead-behind')) return { value: { exitCode: 0, stdout: row('refs/heads/main', '0 0'), stderr: '' } }
    if (args.includes('for-each-ref')) {
      return { value: { exitCode: 0, stdout: row('refs/heads/main', 'c0', '', '2026-11-01', '*'), stderr: '' } }
    }
    if (args.includes('symbolic-ref')) return { value: { exitCode: 1, stdout: '', stderr: '' } }
    return { value: fakeGit(e.argv) }
  })

  await $.command.run({ command: 'branchline' })

  // A tall pane has room for all nine: nothing folds until the button asks.
  const tall = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(((await tall.find({ type: 'Svg' }))?.props as { alt: string }).alt).toBe('Commit graph: 9 commits on 1 lane.')
  expect((await tall.find({ key: 'compact' }))?.text).toBe('Fold quiet stretches')
  await tall.unmount()

  // A short pane folds by itself.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 10 } } })

  const svg = async () => (await ui.find({ type: 'Svg' }))?.props as { alt: string; source: string }
  expect((await svg()).alt).toBe('Commit graph: 3 rows (9 commits, quiet stretches folded) on 1 lane.')
  expect((await svg()).source).toContain('7 commits')
  expect((await ui.find({ key: 'compact' }))?.text).toBe('Show every commit')

  await ui.press({ key: 'compact' })
  expect((await svg()).alt).toBe('Commit graph: 9 commits on 1 lane.')
  expect((await ui.find({ key: 'compact' }))?.text).toBe('Fold quiet stretches')
  await ui.unmount()
})

test("Claude's git commands make the pane read the repo again", async ($, on) => {
  let tip = 'a1'
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.call', () => ({ result: {} }))
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    // The signature and the refs follow `tip`, so a new commit changes both.
    if (args.includes('%(refname) %(objectname)')) {
      return { value: { exitCode: 0, stdout: `refs/heads/main ${tip} *\n`, stderr: '' } }
    }
    if (args.includes('rev-parse --verify')) return { value: { exitCode: 0, stdout: `${tip}\n`, stderr: '' } }
    if (args.includes('for-each-ref') && !args.includes('ahead-behind')) {
      return { value: { exitCode: 0, stdout: row('refs/heads/main', tip, '', '2026-11-19', '*') + '\n', stderr: '' } }
    }
    if (args.includes(' log ')) {
      return { value: { exitCode: 0, stdout: row(tip, '', '2026-11-19', 'Daniel', 'HEAD -> main', `commit ${tip}`) + RS, stderr: '' } }
    }
    return { value: fakeGit(e.argv) }
  })

  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const source = async () => ((await ui.find({ type: 'Svg' }))?.props as { source: string }).source
  expect(await source()).toContain('commit a1')

  // A command without git leaves the pane as it is.
  tip = 'b2'
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(await source()).toContain('commit a1')

  await $.tool.call({ tool: 'Bash', command: 'git commit -m next' })
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(await source()).toContain('commit b2')
  await ui.unmount()
})

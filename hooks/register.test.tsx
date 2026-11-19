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

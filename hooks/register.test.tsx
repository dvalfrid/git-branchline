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

/** YYYY-MM-DD this many days before today: 'active' depends on how recent a branch is. */
const daysAgo = (days: number): string => {
  const date = new Date(Date.now() - days * 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const MAIN_DATE = daysAgo(1)
const FEATURE_DATE = daysAgo(2)
const CMS_DATE = daysAgo(9)

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
        row('refs/heads/main', 'a1', 'origin/main', MAIN_DATE, '*'),
        row('refs/heads/feature/x', 'b2', '', FEATURE_DATE, ' '),
        row('refs/heads/old', 'c3', '', '2026-01-01', ' '),
        row('refs/remotes/origin/HEAD', 'a1', '', MAIN_DATE, ' '),
        row('refs/remotes/origin/main', 'a1', '', MAIN_DATE, ' '),
        row('refs/remotes/origin/cms', 'd4', '', CMS_DATE, ' '),
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

test('the pane shows the branches in groups, on every surface', async ($, on) => {
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

    // The Graph tab first: the graph where the surface draws SVG.
    expect((await ui.find({ key: 'tab-graph' }))?.props.variant).toBe('primary')
    const svg = await ui.find({ type: 'Svg' })
    expect(svg !== undefined).toBe(surface === 'desktop' || surface === 'vscode')
    // Drawn at the pane's width (80 cells, less padding) and its full height, never scaled.
    if (svg) expect([svg.props.width, svg.props.height]).toEqual([624, 2 * 24])

    // The Branches tab: groups in order, old local branches folded away.
    await ui.press({ key: 'tab-branches' })
    expect((await ui.find({ key: 'tab-branches' }))?.text).toBe('Branches (4)')
    const headers = (await ui.findAll({ type: 'Button' })).map(button => button.text).filter(text => /^[▾▸]/.test(text))
    expect(headers).toEqual(['▾ Active (2)', '▾ Remote only (1)', '▸ Old local (1)'])

    if (surface === 'terminal') {
      // No SVG there: the groups are Markdown tables.
      const tables = (await ui.findAll({ type: 'Markdown', text: /\| Branch \|/ })).map(table => table.text.split('\n').slice(2))
      expect(tables).toEqual([
        [`| **\`main\`** | ${MAIN_DATE} | – | – | HEAD · base |`, `| \`feature/x\` | ${FEATURE_DATE} | 1 | 2 | open |`],
        [`| \`origin/cms\` | ${CMS_DATE} | 5 | 0 | merged · remote only |`],
      ])
    } else {
      const lists = (await ui.findAll({ type: 'Svg' })).map(list => (list.props as { alt: string }).alt)
      // One drawn row per branch, each with its open button.
      expect(lists).toEqual(['1 branch: main (base).', '1 branch: feature/x (open).', '1 branch: origin/cms (merged).'])
      expect(await ui.find({ key: 'open-feature/x' })).toBeDefined()
    }
    await ui.press({ key: 'tab-graph' })
    await ui.unmount()
  }
})

test('a group header folds its branches away and back', async ($, on) => {
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => ({ value: fakeGit(e.argv) }))
  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-branches' })
  const lists = async () => (await ui.findAll({ type: 'Svg' })).map(list => (list.props as { alt: string }).alt)

  expect(await lists()).toHaveLength(3)
  await ui.press({ key: 'toggle-old' })
  expect((await lists())[3]).toBe('1 branch: old (stale).')

  await ui.press({ key: 'toggle-active' })
  expect((await lists()).some(alt => alt.includes('feature/x'))).toBe(false)
  expect((await ui.find({ key: 'toggle-active' }))?.text).toBe('▸ Active (2)')
  await ui.unmount()
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

  // A tall pane has room for all nine: nothing folds.
  const tall = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(((await tall.find({ type: 'Svg' }))?.props as { alt: string }).alt).toBe('Commit graph: 9 commits on 1 lane.')
  await tall.unmount()

  // A short pane folds by itself.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 10 } } })
  const svg = async () => (await ui.find({ type: 'Svg' }))?.props as { alt: string; source: string }
  expect((await svg()).alt).toBe('Commit graph: 3 rows (9 commits, quiet stretches folded) on 1 lane.')
  expect((await svg()).source).toContain('7 commits')
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

test('opening a branch shows its commits and files, and Ask fills the prompt', async ($, on) => {
  const filled: string[] = []
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    if (args.includes('origin/main..feature/x')) {
      return { value: { exitCode: 0, stdout: [row('b2', FEATURE_DATE, 'Daniel', 'Add <menu>'), row('b1', FEATURE_DATE, 'Daniel', 'Start menu')].join('\n') + '\n', stderr: '' } }
    }
    if (args.includes('--numstat')) return { value: { exitCode: 0, stdout: '10\t2\tsrc/menu.ts\n1\t0\tREADME.md\n', stderr: '' } }
    return { value: fakeGit(e.argv) }
  })
  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-branches' })

  await ui.press({ key: 'open-feature/x' })
  await new Promise(resolve => setTimeout(resolve, 10))
  const details = (await ui.find({ type: 'Markdown', text: /not on/ }))?.text ?? ''
  expect(details.split('\n')).toEqual([
    '**2 commits** not on `origin/main` · 1 behind · 2 files, +11 −2',
    '',
    `- \`b2\` ${FEATURE_DATE} Daniel: Add \\<menu\\>`,
    `- \`b1\` ${FEATURE_DATE} Daniel: Start menu`,
    '',
    '- `src/menu.ts` +10 −2',
    '- `README.md` +1 −0',
  ])
  expect((await ui.find({ key: 'open-feature/x' }))?.text).toBe('⌄')

  await ui.press({ key: 'ask-feature/x' })
  expect(filled).toHaveLength(1)
  expect(filled[0]).toContain('`feature/x`')
  expect(filled[0]).toContain("Don't change anything yet.")

  await ui.press({ key: 'open-feature/x' })
  expect(await ui.find({ type: 'Markdown', text: /not on/ })).toBeUndefined()
  await ui.unmount()
})

test('the terminal gets a text graph with git-style decorations', async ($, on) => {
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => ({ value: fakeGit(e.argv) }))
  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  const top = await ui.find({ type: 'Text', text: /Add pane/ })
  expect(top?.text).toBe(`◉ (HEAD → main ⇅, tag: v1) Add pane  Daniel · 2026-11-18`)
  expect((await ui.find({ type: 'Text', text: /First/ }))?.text).toBe('● First  Daniel · 2026-11-01')
  await ui.unmount()
})

/** The demo repo plus two merged local branches; `git branch -d` refuses `done2`. */
const withMerged = (deleted: string[]) => (argv: readonly string[]) => {
  const args = argv.join(' ')
  const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '' })
  if (args.includes('branch -d -- ')) {
    const name = argv[argv.length - 1]!
    deleted.push(name)
    return name === 'done2'
      ? { exitCode: 1, stdout: '', stderr: "error: the branch 'done2' is not fully merged" }
      : ok(`Deleted branch ${name} (was c1).\n`)
  }
  if (args.includes('ahead-behind')) {
    return ok(fakeGit(argv).stdout + [row('refs/heads/done1', '0 3'), row('refs/heads/done2', '0 7')].join('\n') + '\n')
  }
  if (args.includes('for-each-ref') && args.includes('refs/tags')) {
    return ok(fakeGit(argv).stdout + [row('refs/heads/done1', 'c1', '', '2026-01-02', ' '), row('refs/heads/done2', 'c2', '', '2026-01-03', ' ')].join('\n') + '\n')
  }
  if (args.includes('origin/main..')) return ok('')
  if (args.includes('--numstat')) return ok('')
  return fakeGit(argv)
}

const branchesPane = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], deleted: string[], filled: string[] = []) => {
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('process.run', (_, e) => ({ value: withMerged(deleted)(e.argv) }))
  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-branches' })
  await ui.press({ key: 'toggle-old' })
  return ui
}
const settle = () => new Promise(resolve => setTimeout(resolve, 10))

test('a merged local branch is deleted after a second press', async ($, on) => {
  const deleted: string[] = []
  const ui = await branchesPane($, on, deleted)

  await ui.press({ key: 'open-done1' })
  await settle()
  await ui.press({ key: 'delete-done1' })
  expect(deleted).toEqual([]) // nothing yet: the first press only asks
  expect((await ui.find({ type: 'Text', text: /Delete done1\?/ }))?.text).toBe('Delete done1? Everything on it is merged.')

  await ui.press({ key: 'confirm-done1' })
  await settle()
  expect(deleted).toEqual(['done1'])
  expect((await ui.find({ type: 'Text', text: /Deleted/ }))?.text).toBe('Deleted done1.')
  await ui.unmount()
})

test('unmerged and remote deletes are handed to Claude, never run here', async ($, on) => {
  const deleted: string[] = []
  const filled: string[] = []
  const ui = await branchesPane($, on, deleted, filled)

  // feature/x has two commits not on origin/main: no direct delete button.
  await ui.press({ key: 'open-feature/x' })
  await settle()
  expect(await ui.find({ key: 'delete-feature/x' })).toBeUndefined()
  await ui.press({ key: 'delete-ask-feature/x' })
  expect(filled[0]).toContain('`git branch -D`')

  await ui.press({ key: 'open-origin/cms' })
  await settle()
  await ui.press({ key: 'delete-remote-origin/cms' })
  expect(filled[1]).toContain('`git push origin --delete cms`')
  expect(deleted).toEqual([])
  await ui.unmount()
})

test('Old local deletes its merged branches together, and says what git refused', async ($, on) => {
  const deleted: string[] = []
  const ui = await branchesPane($, on, deleted)

  await ui.press({ key: 'delete-merged' })
  expect((await ui.find({ type: 'Markdown', text: /Delete these/ }))?.text).toBe(
    'Delete these 2 merged branches?\n\n- `done2`\n- `done1`',
  )
  await ui.press({ key: 'confirm-bulk' })
  await settle()
  expect(deleted).toEqual(['done2', 'done1'])
  expect((await ui.find({ type: 'Text', text: /refused/ }))?.text).toBe(
    "Deleted 1; git refused done2 (error: the branch 'done2' is not fully merged)",
  )
  await ui.unmount()
})

test('with no surface yet, the pane opens when one attaches instead of failing', async ($, on) => {
  let surfaces: string[] = []
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  on('process.run', (_, e) => ({ value: fakeGit(e.argv) }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  expect(opened).toEqual([])

  surfaces = ['desktop']
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await settle()
  expect(opened).toEqual(['branchline'])

  // A second client (a phone) does not reopen a pane the person may have closed.
  await $.session.attach({ surface: 'mobile', clientId: 'mobile:default' })
  await settle()
  expect(opened).toEqual(['branchline'])
})

const logsOf = (on: Parameters<Parameters<typeof test>[1]>[1], logs: string[]) => {
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => {
    if (e.argv.includes('log') && e.argv.some(arg => arg.startsWith('--format=%h%x1f%p'))) logs.push(e.argv.join(' '))
    return { value: fakeGit(e.argv) }
  })
}

test('the graph reads branch history only by default', async ($, on) => {
  const logs: string[] = []
  logsOf(on, logs)
  await $.command.run({ command: 'branchline' })
  expect(logs.at(-1)).toContain(' log --branches --remotes HEAD ')
  expect(logs.at(-1)).not.toContain('--all')
})

test('the Show tag-only commits setting reads every ref', { options: { showTagOnlyCommits: true } }, async ($, on) => {
  const logs: string[] = []
  logsOf(on, logs)
  await $.command.run({ command: 'branchline' })
  expect(logs.at(-1)).toContain(' log --all ')
})

const BAND = {
  plugin: 'git-branchline',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('a row above the prompt opens the pane while it is closed', async ($, on) => {
  let panes: { id: string; title: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }[] = []
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('session.surfaces', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: panes }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => ({ value: fakeGit(e.argv) }))
  // Beneath the plugin the engine draws no row of its own.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })

  // The session starts with the pane closed: the row offers it, with the checked-out branch.
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ key: 'open-pane' }))?.text).toBe('Branchline')
  expect((await band.find({ type: 'Text', text: /main/ }))?.text).toBe('main')

  // Pressed: the pane opens and the row goes.
  await band.press({ key: 'open-pane' })
  expect(await band.find({ key: 'open-pane' })).toBeUndefined()

  // A reload that finds the pane still up keeps the row away.
  panes = [{ id: 'branchline', title: 'Branchline', isShown: true, isFocused: false, isPlaced: true }]
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  expect(await band.find({ key: 'open-pane' })).toBeUndefined()
  await band.unmount()
})

test('no row above the prompt outside a Git repository', async ($, on) => {
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('session.surfaces', () => ({ value: [] }))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'open-pane' })).toBeUndefined()
  await band.unmount()
})

const nineCommits = (on: Parameters<Parameters<typeof test>[1]>[1]) => {
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
}

test('with folding set to never, a short pane draws every commit; the settings sit beside the tabs', { options: { foldQuietStretches: 'never' } }, async ($, on) => {
  nineCommits(on)
  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 10 } } })
  expect(((await ui.find({ type: 'Svg' }))?.props as { alt: string }).alt).toBe('Commit graph: 9 commits on 1 lane.')
  expect((await ui.findAll({ type: 'Button' })).map(button => button.text)).toEqual(['Graph', 'Branches (1)', '☐ Fold quiet stretches', '☐ Show tag-only commits'])
  await ui.unmount()
})

test('with folding set to always, a tall pane folds too', { options: { foldQuietStretches: 'always' } }, async ($, on) => {
  nineCommits(on)
  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(((await ui.find({ type: 'Svg' }))?.props as { alt: string }).alt).toBe('Commit graph: 3 rows (9 commits, quiet stretches folded) on 1 lane.')
  await ui.unmount()
})

const storeIn = (on: Parameters<Parameters<typeof test>[1]>[1], kept: Map<string, unknown>) => {
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)
    return { value: undefined }
  })
}

test('the settings changed in the pane are kept for later sessions', async ($, on) => {
  const kept = new Map<string, unknown>()
  nineCommits(on)
  storeIn(on, kept)
  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'fold' })
  await ui.press({ key: 'tag-only' })
  await settle()
  expect(kept.get('prefs')).toEqual({ fold: 'never', tagOnly: true })
  expect((await ui.find({ key: 'fold' }))?.text).toBe('☐ Fold quiet stretches')
  expect((await ui.find({ key: 'tag-only' }))?.text).toBe('☑ Show tag-only commits')
  await ui.unmount()
})

test('what the pane kept wins over the userConfig default', { options: { foldQuietStretches: 'never' } }, async ($, on) => {
  nineCommits(on)
  storeIn(on, new Map<string, unknown>([['prefs', { fold: 'always', tagOnly: false }]]))
  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(((await ui.find({ type: 'Svg' }))?.props as { alt: string }).alt).toBe('Commit graph: 3 rows (9 commits, quiet stretches folded) on 1 lane.')
  await ui.unmount()
})

test('a group of many branches shows the first 30 until asked for all', async ($, on) => {
  const names = Array.from({ length: 40 }, (_, i) => `old-${String(i).padStart(2, '0')}`)
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    if (args.includes(' log ')) return { value: { exitCode: 0, stdout: row('c0', '', '2026-01-01', 'Lars', 'HEAD -> main', 'start') + RS, stderr: '' } }
    if (args.includes('ahead-behind')) {
      return { value: { exitCode: 0, stdout: [row('refs/heads/main', '0 0'), ...names.map(n => row(`refs/heads/${n}`, '0 1'))].join('\n'), stderr: '' } }
    }
    if (args.includes('for-each-ref')) {
      const refs = [row('refs/heads/main', 'c0', '', '2026-01-01', '*'), ...names.map(n => row(`refs/heads/${n}`, 'c0', '', '2025-01-01', ''))]
      return { value: { exitCode: 0, stdout: refs.join('\n'), stderr: '' } }
    }
    if (args.includes('symbolic-ref')) return { value: { exitCode: 1, stdout: '', stderr: '' } }
    return { value: fakeGit(e.argv) }
  })
  await $.command.run({ command: 'branchline' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-branches' })
  await ui.press({ key: 'toggle-old' })
  const rows = async () => (await ui.findAll({ type: 'Button', text: '›' })).length
  expect(await rows()).toBe(31)
  expect((await ui.find({ key: 'more-old' }))?.text).toBe('Show all 40 branches')
  await ui.press({ key: 'more-old' })
  expect(await rows()).toBe(41)
  expect((await ui.find({ key: 'more-old' }))?.text).toBe('Show the first 30')
  await ui.unmount()
})
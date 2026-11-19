import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'git-branchline',
  component: 'Pane',
  requestId: 'branchline',
  props: {
    title: 'Branchline',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the pane draws its placeholder on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'branchline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const text = await ui.find({ type: 'Text', text: /Git graph/ })
    expect(text?.text).toBe('The Git graph will appear here.')
    await ui.unmount()
  }
})

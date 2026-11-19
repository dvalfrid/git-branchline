import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'
import { compactCommits } from './core/compact'
import { layoutGraph, tipOf } from './core/layout'
import { graphSvg } from './core/svg'
import { branchTable, headline } from './core/table'
import { readRepo, readSignature } from './repo'
import { createWatcher, runsGit, type Watcher } from './watch'

const PANE = 'branchline'
const TITLE = 'Branchline'
/** How often to look for changes made outside the session (a terminal, GitKraken). */
const POLL_MS = 5000
const LOADING: Snapshot = { state: 'loading' }

// Change the shape tag whenever Snapshot's fields change: it declines what an
// earlier version stored, which outlives a reload.
const snapshot = atom({ plugin: 'git-branchline', key: 'snapshot' } as const, LOADING, {
  shape: 'snapshot-1',
})

const isCompact = atom({ plugin: 'git-branchline', key: 'isCompact' } as const, true)

const refresh = async ($: EngineInterface): Promise<void> => {
  let next: Snapshot
  try {
    next = await readRepo(argv => $.process.run(argv), new Date())
  } catch (error) {
    next = { state: 'error', message: error instanceof Error ? error.message : String(error) }
  }
  await update($, snapshot, () => next)
}

// One watcher per load of the module: a reload starts over (and stops the
// previous load's timer), and session.start runs again.
let watcher: Watcher | undefined
const watch = ($: EngineInterface): Watcher =>
  (watcher ??= createWatcher(
    () => readSignature(argv => $.process.run(argv)).catch(() => 'unreadable'),
    () => refresh($),
  ))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'branchline',
      description: "Show the Git history of this session's repo in a pane",
    })
    void $.ui.open({ id: PANE, title: TITLE })
    void watch($).check(true)
    $.clock.every(POLL_MS, () => void watch($).check())

    return next(e)
  })

  on('command.run', { command: 'branchline' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await watch($).check(true)

    return { text: 'Branchline updated.' }
  })

  // Claude's own git commands: look right after they finish instead of
  // waiting for the next poll.
  // Watching never decides a call: if the hook fails, the call runs as it would
  // have (next(e) replays what an earlier next settled to).
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (runsGit(e.command)) void watch($).check()
    return ran
  }).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const ran = await next(e)
    if (runsGit(e.command)) void watch($).check()
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Markdown, Svg, Button } = $.ui.resolve(e)
    const shot = await read($, snapshot)
    const compact = await read($, isCompact)

    if (shot.state === 'loading') return <Text dimColor>Reading the repository…</Text>
    if (shot.state === 'not-repo') return <Text>This session's folder is not a Git repository.</Text>
    if (shot.state === 'error') return <Text>git failed: {shot.message}</Text>

    // The graph where the surface draws SVG and has room; the table everywhere.
    const drawsGraph = (e.surface === 'desktop' || e.surface === 'vscode') && Svg && shot.commits.length > 0
    const rows = compact ? compactCommits(shot.commits) : shot.commits
    const graph = drawsGraph
      ? graphSvg(rows, layoutGraph(rows, tipOf(rows, shot.base)), {
          headId: rows.find(commit => commit.refs.some(ref => ref === 'HEAD' || ref.startsWith('HEAD -> ')))?.id,
        })
      : undefined
    const folds = rows.length < shot.commits.length || !compact

    return (
      <Box flexDirection="column" gap={1}>
        <Markdown text={headline(shot)} />
        {graph && Svg && <Svg source={graph.source} alt={graph.alt} isInteractive />}
        {graph && folds && (
          <Button key="compact" dimColor onPress={() => void update($, isCompact, value => !value)}>
            {compact ? 'Show every commit' : 'Fold quiet stretches'}
          </Button>
        )}
        <Markdown text={branchTable(shot.branches)} />
      </Box>
    )
  })
}

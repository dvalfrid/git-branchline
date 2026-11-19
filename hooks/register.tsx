import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BranchGroup, FoldMode, Snapshot } from '../types'
import { compactCommits } from './core/compact'
import { layoutGraph, tipOf } from './core/layout'
import { ROW, graphSvg } from './core/svg'
import { branchTable, groupBranches, headline } from './core/table'
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
  shape: 'snapshot-2',
})

// Folding: 'auto' folds only when the commits do not fit in the pane; the
// button sets 'fold' or 'expand' for the rest of the session.
const foldMode = atom({ plugin: 'git-branchline', key: 'foldMode' } as const, 'auto' as FoldMode)

// Branch groups folded away in the table; old local branches start folded.
const hiddenGroups = atom({ plugin: 'git-branchline', key: 'hiddenGroups' } as const, ['old'] as BranchGroup[])

/**
 * Pixels per pane cell on the desktop app, measured: a pane 76 cells wide
 * is about 640 px, and a body row about 22 px tall.
 */
const PX_PER_COLUMN = 8.4
const PX_PER_ROW = 22

/** The graph's width in pixels for a pane this many cells wide. */
// Less the body's padding and scroll bar: a graph wider than its slot is scaled
// down and centred, which leaves a gap above it.
const graphWidth = (columns: number): number => Math.max(360, Math.round(columns * PX_PER_COLUMN) - 48)

/** Commit rows that fit in the pane beside the headline, button and table header. */
const rowsThatFit = (bodyRows: number): number => Math.floor((bodyRows * PX_PER_ROW) / ROW) - 6

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
    const mode = await read($, foldMode)
    const hidden = await read($, hiddenGroups)

    if (shot.state === 'loading') return <Text dimColor>Reading the repository…</Text>
    if (shot.state === 'not-repo') return <Text>This session's folder is not a Git repository.</Text>
    if (shot.state === 'error') return <Text>git failed: {shot.message}</Text>

    // The graph where the surface draws SVG; the table everywhere.
    const drawsGraph = (e.surface === 'desktop' || e.surface === 'vscode') && Svg && shot.commits.length > 0
    const fits = shot.commits.length <= rowsThatFit(e.props.scroll.bodyRows)
    const folded = mode === 'fold' || (mode === 'auto' && !fits)
    const rows = folded ? compactCommits(shot.commits) : shot.commits
    const graph = drawsGraph
      ? graphSvg(rows, layoutGraph(rows, tipOf(rows, shot.base)), {
          headId: rows.find(commit => commit.refs.some(ref => ref === 'HEAD' || ref.startsWith('HEAD -> ')))?.id,
          width: graphWidth(e.props.bodyColumns),
        })
      : undefined
    // The button only where folding changes something.
    const canFold = folded ? rows.length < shot.commits.length : compactCommits(shot.commits).length < shot.commits.length

    // Branches first, so the graph growing below never moves them; each group
    // folds away with its header. The fold button sits above the graph for the same reason.
    const groups = groupBranches(shot.branches).map(group => {
      const isHidden = hidden.includes(group.id)
      const toggle = () =>
        void update($, hiddenGroups, list => (isHidden ? list.filter(id => id !== group.id) : [...list, group.id]))
      return (
        <Box key={`group-${group.id}`} flexDirection="column">
          <Button key={`toggle-${group.id}`} plain dimColor={isHidden} onPress={toggle}>
            {`${isHidden ? '▸' : '▾'} ${group.title} (${group.branches.length})`}
          </Button>
          {!isHidden && <Markdown text={branchTable(group.branches)} />}
        </Box>
      )
    })

    return (
      <Box flexDirection="column" gap={1}>
        <Markdown text={headline(shot)} />
        {groups.length > 0 ? groups : <Text dimColor>No branches yet.</Text>}
        {graph && canFold && (
          <Button key="compact" dimColor onPress={() => void update($, foldMode, () => (folded ? 'expand' : 'fold'))}>
            {folded ? 'Show every commit' : 'Fold quiet stretches'}
          </Button>
        )}
        {graph && Svg && (
          <Svg source={graph.source} alt={graph.alt} width={graph.width} height={graph.height} isInteractive />
        )}
      </Box>
    )
  })
}
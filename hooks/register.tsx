import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'
import { compactCommits } from './core/compact'
import { layoutGraph, tipOf } from './core/layout'
import { graphSvg } from './core/svg'
import { branchTable, headline } from './core/table'
import { readRepo } from './repo'

const PANE = 'branchline'
const TITLE = 'Branchline'
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'branchline',
      description: "Show the Git history of this session's repo in a pane",
    })
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)

    return next(e)
  })

  on('command.run', { command: 'branchline' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await refresh($)

    return { text: 'Branchline updated.' }
  })

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
        {graph && Svg && <Svg source={graph.source} alt={graph.alt} />}
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

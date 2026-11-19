import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Branch, BranchDetails, BranchGroup, FoldMode, Snapshot, View } from '../types'
import { compactCommits } from './core/compact'
import { layoutGraph, tipOf } from './core/layout'
import { LANE_COLORS, ROW, graphSvg, pills } from './core/svg'
import { textGraph } from './core/textgraph'
import { branchListSvg } from './core/branches-svg'
import { askPrompt, detailsMarkdown } from './core/details'
import { branchTable, groupBranches, headline } from './core/table'
import { readBranchDetails, readRepo, readSignature } from './repo'
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

// The branch opened in the Branches tab and what was read for it.
const openedBranch = atom({ plugin: 'git-branchline', key: 'opened' } as const, null as BranchDetails | null, {
  shape: 'opened-1',
})

/** Width kept at the right of each branch row for its open button. */
const ROW_BUTTON = 36

/** Opens a branch (reading its commits and files), or closes it with `undefined`. */
const openBranch = async ($: EngineInterface, base: string, name: string | undefined): Promise<void> => {
  if (name === undefined) return void (await update($, openedBranch, () => null))
  await update($, openedBranch, () => ({ name, state: 'loading' }))
  let details: BranchDetails
  try {
    details = await readBranchDetails(argv => $.process.run(argv), base, name)
  } catch (error) {
    details = { name, state: 'error', message: error instanceof Error ? error.message : String(error) }
  }
  // Only if the person has not opened another branch meanwhile.
  await update($, openedBranch, current => (current?.name === name ? details : current))
}

// Which tab the pane shows.
const view = atom({ plugin: 'git-branchline', key: 'view' } as const, 'graph' as View)

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
    const tab = await read($, view)
    const opened = await read($, openedBranch)

    if (shot.state === 'loading') return <Text dimColor>Reading the repository…</Text>
    if (shot.state === 'not-repo') return <Text>This session's folder is not a Git repository.</Text>
    if (shot.state === 'error') return <Text>git failed: {shot.message}</Text>

    const fits = shot.commits.length <= rowsThatFit(e.props.scroll.bodyRows)
    const folded = mode === 'fold' || (mode === 'auto' && !fits)
    const rows = folded ? compactCommits(shot.commits) : shot.commits
    const layout = layoutGraph(rows, tipOf(rows, shot.base))
    const width = graphWidth(e.props.bodyColumns)

    const tabs = (
      <Box flexDirection="row" gap={1}>
        {(['graph', 'branches'] as const).map(id => (
          <Button
            key={`tab-${id}`}
            variant={tab === id ? 'primary' : 'secondary'}
            onPress={() => void update($, view, () => id)}
          >
            {id === 'graph' ? 'Graph' : `Branches (${shot.branches.length})`}
          </Button>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Markdown text={headline(shot)} />
        {tabs}
        {tab === 'graph' ? graphTab() : branchesTab()}
      </Box>
    )

    function graphTab() {
      if (shot.state !== 'ok' || shot.commits.length === 0) return <Text dimColor>No commits yet.</Text>
      if (e.surface === 'mobile') return <Text dimColor>The graph is drawn in the desktop app, VS Code and the terminal; the branches are under Branches.</Text>
      const headId = rows.find(commit => commit.refs.some(ref => ref === 'HEAD' || ref.startsWith('HEAD -> ')))?.id
      // The button only where folding changes something.
      const canFold = folded
        ? rows.length < shot.commits.length
        : compactCommits(shot.commits).length < shot.commits.length
      const foldButton = canFold && (
        <Button key="compact" dimColor onPress={() => void update($, foldMode, () => (folded ? 'expand' : 'fold'))}>
          {folded ? 'Show every commit' : 'Fold quiet stretches'}
        </Button>
      )

      if (e.surface === 'terminal' || !Svg) {
        // The terminal draws no SVG: a text graph, a line per commit.
        const lines = textGraph(rows, layout, { headId })
        return (
          <Box flexDirection="column">
            {foldButton}
            {lines.map((line, i) => (
              <Text key={`line-${i}`} wrap="truncate-end">
                {line.graph.map(span => (span.lane === undefined ? span.text : <Text color={termColor(span.lane)}>{span.text}</Text>))}
                {line.commit && <Text> </Text>}
                {line.commit && refLabel(line.commit.refs)}
                {line.commit && <Text dimColor={line.commit.count !== undefined}>{line.commit.subject}</Text>}
                {line.commit && <Text dimColor>{`  ${line.commit.author} · ${line.commit.firstDate ? `${line.commit.firstDate} – ` : ''}${line.commit.date}`}</Text>}
              </Text>
            ))}
          </Box>
        )
      }

      const graph = graphSvg(rows, layout, { headId, width })
      return (
        <Box flexDirection="column" gap={1}>
          {foldButton}
          <Svg source={graph.source} alt={graph.alt} width={graph.width} height={graph.height} isInteractive />
        </Box>
      )
    }

    /** `(HEAD → main ⇅, v1) ` with HEAD in the warning color, as git log decorates. */
    function refLabel(refs: string[]) {
      const all = pills(refs)
      if (all.length === 0) return null
      return (
        <Text>
          {'('}
          {all.map((pill, i) => (
            <Text color={pill.kind === 'head' ? 'warning' : pill.kind === 'tag' ? undefined : termColor(1)} bold={pill.kind !== 'tag'}>
              {`${i > 0 ? (all[i - 1]!.kind === 'head' ? ' → ' : ', ') : ''}${pill.kind === 'tag' ? `tag: ${pill.text}` : pill.text}`}
            </Text>
          ))}
          {') '}
        </Text>
      )
    }

    function branchesTab() {
      if (shot.state !== 'ok') return null
      const base = shot.base
      const groups = groupBranches(shot.branches)
      if (groups.length === 0) return <Text dimColor>No branches yet.</Text>
      // Each branch's dot takes the color of its tip's lane in the graph.
      const laneOf = (sha: string) =>
        layout.rows.find(row => row.id.startsWith(sha) || sha.startsWith(row.id))?.lane
      const today = isoToday()
      const drawsRows = Svg && e.surface !== 'terminal'

      const branchRow = (branch: Branch) => {
        const isOpen = opened?.name === branch.name
        const strip = branchListSvg([branch], { width: width - ROW_BUTTON, today, laneOf })
        return (
          <Box key={`branch-${branch.name}`} flexDirection="column">
            <Box flexDirection="row" alignItems="center">
              {Svg && <Svg source={strip.source} alt={strip.alt} width={width - ROW_BUTTON} height={strip.height} />}
              <Button
                key={`open-${branch.name}`}
                plain
                dimColor={!isOpen}
                onPress={() => void openBranch($, base, isOpen ? undefined : branch.name)}
              >
                {isOpen ? '⌄' : '›'}
              </Button>
            </Box>
            {isOpen && opened && (
              <Box flexDirection="column" gap={1} paddingLeft={2} paddingBottom={1}>
                <Markdown text={detailsMarkdown(branch, opened, base)} />
                <Box flexDirection="row" gap={1}>
                  <Button key={`ask-${branch.name}`} variant="primary" onPress={() => void $.prompt.fill({ text: askPrompt(branch, base), mode: 'replace' }).catch(() => $.ui.toast('Could not fill the prompt box.'))}>
                    Ask Claude about it
                  </Button>
                  <Button key={`copy-${branch.name}`} onPress={press => void $.ui.copy({ text: branch.name, surface: press.surface }).catch(() => $.ui.toast('Could not copy the name.'))}>
                    Copy name
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        )
      }

      return (
        <Box flexDirection="column" gap={1}>
          {groups.map(group => {
            const isHidden = hidden.includes(group.id)
            const toggle = () =>
              void update($, hiddenGroups, list => (isHidden ? list.filter(id => id !== group.id) : [...list, group.id]))
            return (
              <Box key={`group-${group.id}`} flexDirection="column">
                <Button key={`toggle-${group.id}`} plain dimColor={isHidden} onPress={toggle}>
                  {`${isHidden ? '▸' : '▾'} ${group.title} (${group.branches.length})`}
                </Button>
                {!isHidden && drawsRows && group.branches.map(branchRow)}
                {!isHidden && !drawsRows && <Markdown text={branchTable(group.branches)} />}
              </Box>
            )
          })}
        </Box>
      )
    }
  })
}
/** Lane colors on the terminal; main's grey is lightened so it reads on a dark background. */
const termColor = (lane: number): string => (lane % LANE_COLORS.length === 0 ? '#8a8880' : LANE_COLORS[lane % LANE_COLORS.length]!)

const isoToday = (): string => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
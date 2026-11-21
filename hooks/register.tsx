import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Branch, BranchDetails, BranchGroup, FoldMode, Notice, PendingDelete, Snapshot, View } from '../types'
import { compactCommits } from './core/compact'
import { layoutGraph, tipOf } from './core/layout'
import { assignOwners, edgeOwner } from './core/owners'
import { LANE_COLORS, ROW, graphSvg, pills } from './core/svg'
import { textGraph } from './core/textgraph'
import { branchListSvg } from './core/branches-svg'
import { askPrompt, canDeleteHere, deletePrompt, detailsMarkdown } from './core/details'
import { bandStatus, branchTable, groupBranches, headline } from './core/table'
import { deleteBranches, readBranchDetails, readRepo, readSignature } from './repo'
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

// Local branches waiting for the second press, and the outcome of the last delete.
const pendingDelete = atom({ plugin: 'git-branchline', key: 'pendingDelete' } as const, null as PendingDelete | null)
const noticeAtom = atom({ plugin: 'git-branchline', key: 'notice' } as const, null as Notice | null)

/**
 * Deletes merged local branches with `git branch -d` (which refuses unmerged
 * work), says what happened, and reads the repo again.
 */
const runDelete = async ($: EngineInterface, root: string, names: string[]): Promise<void> => {
  await update($, pendingDelete, () => null)
  let notice: Notice
  try {
    const results = await deleteBranches(argv => $.process.run(argv), root, names)
    const done = results.filter(result => result.ok).map(result => result.name)
    const failed = results.filter(result => !result.ok)
    notice = failed.length === 0
      ? { text: `Deleted ${done.length === 1 ? done[0] : `${done.length} branches`}.`, isError: false }
      : { text: `${done.length > 0 ? `Deleted ${done.length}; ` : ''}git refused ${failed.map(f => `${f.name} (${f.message})`).join(', ')}`, isError: true }
  } catch (error) {
    notice = { text: `git failed: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
  await update($, noticeAtom, () => notice)
  await update($, openedBranch, current => (current && names.includes(current.name) ? null : current))
  await watch($).check(true)
}

// Which tab the pane shows.
const view = atom({ plugin: 'git-branchline', key: 'view' } as const, 'graph' as View)

// Branch groups folded away in the table; old local branches start folded.
const hiddenGroups = atom({ plugin: 'git-branchline', key: 'hiddenGroups' } as const, ['old'] as BranchGroup[])

// Groups showing every branch. Others show the first GROUP_LIMIT: each branch
// is a drawing of its own, and a repository can have hundreds.
const fullGroups = atom({ plugin: 'git-branchline', key: 'fullGroups' } as const, [] as BranchGroup[])
const GROUP_LIMIT = 30

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
    next = await readRepo(argv => $.process.run(argv), new Date(), { includeTagOnly: (await read($, prefs)).tagOnly })
  } catch (error) {
    next = { state: 'error', message: error instanceof Error ? error.message : String(error) }
  }
  await update($, snapshot, () => next)
}

// Two settings, kept between sessions and chats: folding of quiet stretches
// and tag-only commits. The plugin's userConfig gives the defaults (the config
// menu, or settings.json); a change made in the pane is kept in $.store and
// wins. The desktop app lists no settings for a plugin loaded from a folder,
// so the pane is where they are changed there.
type FoldOption = 'auto' | 'always' | 'never'
type Prefs = { fold: FoldOption; tagOnly: boolean }
const isFold = (value: unknown): value is FoldOption => value === 'auto' || value === 'always' || value === 'never'
const prefsOf = (options: PluginOptions, stored: unknown): Prefs => {
  const kept = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof Prefs, unknown>>
  return {
    fold: isFold(kept.fold) ? kept.fold : isFold(options.foldQuietStretches) ? options.foldQuietStretches : 'auto',
    tagOnly: typeof kept.tagOnly === 'boolean' ? kept.tagOnly : options.showTagOnlyCommits === true,
  }
}
const foldModeOf = (fold: FoldOption): FoldMode => (fold === 'always' ? 'fold' : fold === 'never' ? 'expand' : 'auto')
const PREFS_KEY = 'prefs'
const prefs = atom({ plugin: 'git-branchline', key: 'prefs' } as const, { fold: 'auto', tagOnly: false } as Prefs)
let options: PluginOptions = {}

/** Reads the settings: what the pane kept, else the userConfig defaults. */
const loadPrefs = async ($: EngineInterface): Promise<void> => {
  const stored = await $.store.get(PREFS_KEY).catch(() => undefined)
  await update($, prefs, () => prefsOf(options, stored))
}

/**
 * Changes a setting from the pane: drawn at once, kept for later sessions.
 *
 * The press or pick gave the pane the keyboard, and while it holds the
 * keyboard the desktop app stops scrolling it short of the top. A mod cannot
 * hand the keyboard back (filling the prompt box does not move it), so on a
 * graphical surface the pane is closed and opened again, which drops it.
 * Settings change seldom; tabs and branch buttons show an Esc hint instead.
 */
const setPref = async ($: EngineInterface, change: Partial<Prefs>, surface: string): Promise<void> => {
  const next = { ...(await read($, prefs)), ...change }
  await update($, prefs, () => next)
  await $.store.set(PREFS_KEY, next)
  if (change.tagOnly !== undefined) await watch($).check(true)
  if (surface !== 'terminal') {
    await $.ui.close({ id: PANE })
    await showPane($)
  }
}

// One watcher per load of the module: a reload starts over (and stops the
// previous load's timer), and session.start runs again.
let watcher: Watcher | undefined
const watch = ($: EngineInterface): Watcher =>
  (watcher ??= createWatcher(
    () => readSignature(argv => $.process.run(argv)).catch(() => 'unreadable'),
    () => refresh($),
  ))

// Whether the pane is open; the row above the prompt offers to open it while not.
const paneUp = atom({ plugin: 'git-branchline', key: 'paneUp' } as const, false)

/** Opens (or brings back) the pane and remembers that it is up. */
const showPane = async ($: EngineInterface): Promise<void> => {
  await $.ui.open({ id: PANE, title: TITLE })
  await update($, paneUp, () => true)
}

// The pane opens by itself once per load: at session start when a surface is
// there, else when the first one attaches (the desktop app may connect after
// the session has started). Opening with none attached is refused.
let hasOpened = false
const openPane = async ($: EngineInterface): Promise<void> => {
  if (hasOpened || (await $.session.surfaces()).length === 0) return
  hasOpened = true
  await showPane($).catch(() => {
    hasOpened = false
  })
}

export const register: Register = (on, given) => {
  options = given
  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    void openPane($)
    return attached
  })
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'branchline',
      description: "Show the Git history of this session's repo in a pane",
    })
    // A reload keeps a pane that was up: ask the engine rather than guess.
    void $.ui.panes()
      .then(panes => update($, paneUp, () => panes.some(pane => pane.id === PANE)))
      .catch(() => undefined)
    void openPane($)
    // The settings first, so the first read knows whether to take tag-only commits.
    await loadPrefs($).catch(() => undefined)
    void watch($).check(true)

    $.clock.every(POLL_MS, () => void watch($).check())

    return next(e)
  })

  on('command.run', { command: 'branchline' }, async $ => {
    await loadPrefs($).catch(() => undefined)
    await showPane($)
    await watch($).check(true)

    return { text: 'Branchline updated.' }
  })

  // Closed by the person (or dropped by a reload): the row above the prompt comes back.
  // Never holds a close up: if the hook fails, the pane closes as it would have.
  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) await update($, paneUp, () => false)
    return closed
  }).catch(($, e, next) => next(e))

  // While the pane is closed, a row above the prompt opens it, with the
  // checked-out branch beside the button. Nothing outside a Git repository.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, paneUp))) return next(e)
    const shot = await read($, snapshot)
    if (shot.state !== 'ok') return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1}>
        <Button
          key="open-pane"
          onPress={() =>
            void showPane($)
              .then(() => watch($).check(true))
              .catch(error => $.ui.toast(`Branchline: ${error instanceof Error ? error.message : String(error)}`))
          }
        >
          Branchline
        </Button>
        <Text dimColor wrap="truncate-end">{bandStatus(shot)}</Text>
      </Box>
    )
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
    const chosen = await read($, prefs)
    const mode = foldModeOf(chosen.fold)
    const hidden = await read($, hiddenGroups)
    const full = await read($, fullGroups)
    const tab = await read($, view)
    const opened = await read($, openedBranch)
    const pending = await read($, pendingDelete)
    const notice = await read($, noticeAtom)

    if (shot.state === 'loading') return <Text dimColor>Reading the repository…</Text>
    if (shot.state === 'not-repo') return <Text>This session's folder is not a Git repository.</Text>
    if (shot.state === 'error') return <Text>git failed: {shot.message}</Text>

    const fits = shot.commits.length <= rowsThatFit(e.props.scroll.bodyRows)
    const folded = mode === 'fold' || (mode === 'auto' && !fits)
    const rows = folded ? compactCommits(shot.commits) : shot.commits
    const layout = layoutGraph(rows, tipOf(rows, shot.base))
    // Which branch each commit belongs to: graph colors, hover and the Branches dots follow it.
    const owners = assignOwners(rows, shot.base)
    const rowIds = layout.rows.map(row => ({ id: rows[row.row]!.id }))
    const colorOfCommit = (id: string, lane: number) => { const o = owners.ownerOf.get(id); return o === undefined ? lane : owners.owners[o]!.color }
    const colorOfEdge = (edge: (typeof layout.edges)[number]) => { const o = edgeOwner(edge, rowIds, owners); return o === undefined ? edge.viaLane : owners.owners[o]!.color }
    const width = graphWidth(e.props.bodyColumns)

    // One row under the headline: the tabs, then (on the Graph tab) the two
    // settings as check boxes, kept between sessions.
    const onGraph = tab === 'graph' && shot.commits.length > 0 && e.surface !== 'mobile'
    const toolbar = (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
        {(['graph', 'branches'] as const).map(id => (
          <Button
            key={`tab-${id}`}
            variant={tab === id ? 'primary' : 'secondary'}
            onPress={() => void update($, view, () => id)}
          >
            {id === 'graph' ? 'Graph' : `Branches (${shot.branches.length})`}
          </Button>
        ))}
        {onGraph && (
          // Checked folds when the graph does not fit (or always, if the
          // userConfig default says so); unchecked never folds.
          <Button
            key="fold"
            plain
            dimColor={chosen.fold === 'never'}
            onPress={press => void setPref($, { fold: chosen.fold === 'never' ? 'auto' : 'never' }, press.surface).catch(() => undefined)}
          >
            {`${chosen.fold === 'never' ? '☐' : '☑'} Fold quiet stretches`}
          </Button>
        )}
        {onGraph && (
          <Button
            key="tag-only"
            plain
            dimColor={!chosen.tagOnly}
            onPress={press => void setPref($, { tagOnly: !chosen.tagOnly }, press.surface).catch(() => undefined)}
          >
            {`${chosen.tagOnly ? '☑' : '☐'} Show tag-only commits`}
          </Button>
        )}
        {e.props.isFocused && e.surface !== 'terminal' && (
          // While the pane holds the keyboard, the desktop app can stop
          // scrolling short of the top; Esc hands the keyboard back.
          <Text key="esc-hint" dimColor>Esc to scroll freely</Text>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Markdown text={headline(shot)} />
        {toolbar}
        {tab === 'graph' ? graphTab() : branchesTab()}
      </Box>
    )

    function graphTab() {
      if (shot.state !== 'ok' || shot.commits.length === 0) return <Text dimColor>No commits yet.</Text>
      if (e.surface === 'mobile') return <Text dimColor>The graph is drawn in the desktop app, VS Code and the terminal; the branches are under Branches.</Text>
      const headId = rows.find(commit => commit.refs.some(ref => ref === 'HEAD' || ref.startsWith('HEAD -> ')))?.id
      if (e.surface === 'terminal' || !Svg) {
        // The terminal draws no SVG: a text graph, a line per commit.
        const lines = textGraph(rows, layout, { headId, edgeColor: colorOfEdge, rowColor: colorOfCommit })
        return (
          <Box flexDirection="column">
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

      const graph = graphSvg(rows, layout, { headId, width, owners })
      return <Svg source={graph.source} alt={graph.alt} width={graph.width} height={graph.height} isInteractive />
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
      // Each branch's dot takes its color in the graph.
      const laneOf = (sha: string) => {
        const row = layout.rows.find(row => row.id.startsWith(sha) || sha.startsWith(row.id))
        return row && colorOfCommit(row.id, row.lane)
      }
      const today = isoToday()
      const drawsRows = Svg && e.surface !== 'terminal'

      const fillPrompt = (text: string) =>
        void $.prompt.fill({ text, mode: 'replace' }).catch(() => $.ui.toast('Could not fill the prompt box.'))
      const root = shot.root

      // Deleting: what the pane does itself (merged local branches, after a
      // second press) and what it leaves to Claude (unmerged or remote).
      const confirmDelete = (branch: Branch) => (
            <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1} alignItems="center">
              <Text>{`Delete ${branch.name}? Everything on it is merged.`}</Text>
              <Button key={`confirm-${branch.name}`} variant="primary" onPress={() => void runDelete($, root, [branch.name])}>
                Yes, delete
              </Button>
              <Button key={`cancel-${branch.name}`} onPress={() => void update($, pendingDelete, () => null)}>
                Cancel
              </Button>
            </Box>
      )

      const deleteButtons = (branch: Branch) => {
        if (branch.isHead || branch.status === 'base') return null
        return (
          <>
            {canDeleteHere(branch) && (
              <Button key={`delete-${branch.name}`} onPress={() => void update($, pendingDelete, () => ({ names: [branch.name], isBulk: false }))}>
                Delete branch
              </Button>
            )}
            {branch.kind === 'local' && !canDeleteHere(branch) && (
              <Button key={`delete-ask-${branch.name}`} dimColor onPress={() => fillPrompt(deletePrompt(branch, base, 'local'))}>
                Delete via Claude…
              </Button>
            )}
            {(branch.kind === 'remote' || branch.hasRemote) && (
              <Button key={`delete-remote-${branch.name}`} dimColor onPress={() => fillPrompt(deletePrompt(branch, base, 'remote'))}>
                Delete on origin via Claude…
              </Button>
            )}
          </>
        )
      }

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
                {pending?.isBulk === false && pending.names[0] === branch.name ? (
                  confirmDelete(branch)
                ) : (
                  // One row of actions, wrapping only when the pane is too narrow.
                  <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
                    <Button key={`ask-${branch.name}`} variant="primary" onPress={() => fillPrompt(askPrompt(branch, base))}>
                      Ask Claude about it
                    </Button>
                    <Button key={`copy-${branch.name}`} onPress={press => void $.ui.copy({ text: branch.name, surface: press.surface }).catch(() => $.ui.toast('Could not copy the name.'))}>
                      Copy name
                    </Button>
                    {deleteButtons(branch)}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )
      }

      // In Old local: delete every merged branch at once, after a look at the list.
      const bulkDelete = (branches: Branch[]) => {
        const merged = branches.filter(canDeleteHere).map(branch => branch.name)
        if (merged.length === 0) return null
        if (pending?.isBulk) {
          const names = pending.names
          return (
            <Box flexDirection="column" gap={1} paddingLeft={2}>
              <Markdown text={`Delete ${names.length === 1 ? 'this merged branch' : `these ${names.length} merged branches`}?\n\n${names.map(name => `- \`${name}\``).join('\n')}`} />
              <Box flexDirection="row" gap={1}>
                <Button key="confirm-bulk" variant="primary" onPress={() => void runDelete($, root, names)}>
                  {names.length === 1 ? 'Yes, delete' : `Yes, delete ${names.length}`}
                </Button>
                <Button key="cancel-bulk" onPress={() => void update($, pendingDelete, () => null)}>
                  Cancel
                </Button>
              </Box>
            </Box>
          )
        }
        return (
          <Button
            key="delete-merged"
            dimColor
            onPress={() => void update($, pendingDelete, () => ({ names: merged, isBulk: true }))}
          >
            {`Delete merged branches (${merged.length})…`}
          </Button>
        )
      }

      return (
        <Box flexDirection="column" gap={1}>
          {notice && (
            <Box flexDirection="row" gap={1}>
              <Text color={notice.isError ? 'error' : 'success'}>{notice.text}</Text>
              <Button key="dismiss-notice" plain dimColor onPress={() => void update($, noticeAtom, () => null)}>
                ✕
              </Button>
            </Box>
          )}
          {groups.map(group => {
            const isHidden = hidden.includes(group.id)
            const toggle = () =>
              void update($, hiddenGroups, list => (isHidden ? list.filter(id => id !== group.id) : [...list, group.id]))
            const isFull = full.includes(group.id) || group.branches.length <= GROUP_LIMIT
            const shown = isFull ? group.branches : group.branches.slice(0, GROUP_LIMIT)
            const more = group.branches.length > GROUP_LIMIT && (
              <Button
                key={`more-${group.id}`}
                plain
                dimColor
                onPress={() =>
                  void update($, fullGroups, list => (isFull ? list.filter(id => id !== group.id) : [...list, group.id]))
                }
              >
                {isFull ? `Show the first ${GROUP_LIMIT}` : `Show all ${group.branches.length} branches`}
              </Button>
            )
            return (
              <Box key={`group-${group.id}`} flexDirection="column">
                <Button key={`toggle-${group.id}`} plain dimColor={isHidden} onPress={toggle}>
                  {`${isHidden ? '▸' : '▾'} ${group.title} (${group.branches.length})`}
                </Button>
                {!isHidden && group.id === 'old' && bulkDelete(group.branches)}
                {!isHidden && drawsRows && shown.map(branchRow)}
                {!isHidden && !drawsRows && <Markdown text={branchTable(shown)} />}
                {!isHidden && more}
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
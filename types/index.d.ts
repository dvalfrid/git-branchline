// The contract for the values git-branchline keeps in $.state.

/** How a branch stands against the base branch (origin/main or main). */
export type BranchStatus = 'base' | 'open' | 'merged' | 'stale'

/**
 * active: HEAD, the base, and unmerged local branches with a commit in the
 * last ACTIVE_DAYS. tracked: other local branches that also exist on a remote.
 * remote: remote-only branches. old: other local-only branches.
 */
export type BranchGroup = 'active' | 'tracked' | 'remote' | 'old'

export type Branch = {
  /** Short name: `main`, `feature/x`, or `origin/x` for a remote-only branch. */
  name: string
  kind: 'local' | 'remote'
  sha: string
  /** Committer date of the tip, YYYY-MM-DD. */
  date: string
  upstream?: string
  /** Commits on the base that the branch lacks. Unknown when absent. */
  behind?: number
  /** Commits on the branch that the base lacks. Unknown when absent. */
  ahead?: number
  status: BranchStatus
  isHead: boolean
  /** A local branch that also exists on a remote (tracked, or origin/<same name>). */
  hasRemote: boolean
  /** Which part of the branch table it is listed in. */
  group: BranchGroup
}

export type FoldMode = 'auto' | 'fold' | 'expand'

/** Branches waiting for the second press: one opened branch, or the bulk delete in Old local. */
export type PendingDelete = { names: string[]; isBulk: boolean }

/** A line shown above the branches after something was done. */
export type Notice = { text: string; isError: boolean }

/** The pane's tabs. */
export type View = 'graph' | 'branches'

export type Tag = { name: string; sha: string }

export type Commit = {
  id: string
  parents: string[]
  date: string
  author: string
  refs: string[]
  subject: string
}

export type Snapshot =
  | { state: 'loading' }
  | { state: 'not-repo' }
  | { state: 'error'; message: string }
  | {
      state: 'ok'
      root: string
      /** The ref branches are compared with, e.g. `origin/main`. */
      base: string
      /** The checked-out branch, or a short sha when HEAD is detached. */
      head: string
      branches: Branch[]
      tags: Tag[]
      commits: Commit[]
      /** Local time of the read, HH:MM. */
      readAt: string
    }

/** What a branch has that the base lacks, read when the branch is opened in the pane. */
export type BranchDetails =
  | { name: string; state: 'loading' }
  | { name: string; state: 'error'; message: string }
  | {
      name: string
      state: 'ok'
      /** True for the base branch itself: its latest commits, no diff. */
      isBase: boolean
      commits: { id: string; date: string; author: string; subject: string }[]
      /** The most changed files, at most DETAIL_FILES. */
      files: { path: string; added: number; removed: number }[]
      added: number
      removed: number
      fileCount: number
    }

declare module 'claude-code' {
  interface PluginState {
    'git-branchline': {
      snapshot: Shaped<Snapshot>
      /** Folding of quiet chains: 'auto' folds only when the graph does not fit. */
      foldMode: FoldMode
      /** Branch groups the person has folded away in the table. */
      hiddenGroups: BranchGroup[]
      /** The tab the pane shows. */
      view: View
      /** The branch opened in the Branches tab, with what was read for it. */
      opened: Shaped<BranchDetails | null>
      /** Local branches waiting for a second press to be deleted. */
      pendingDelete: PendingDelete | null
      /** The outcome of the last delete, shown above the branches. */
      notice: Notice | null
    }
  }
}

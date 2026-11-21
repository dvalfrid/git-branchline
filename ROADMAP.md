# Roadmap

## Now / next

Steps 1–9 are done. Open questions are below; anything new starts as an issue.

## Steps

- [x] **1. A skeleton that loads**: `plugin.json`, `hooks.json` and a
      `register.tsx` that opens an empty "Branchline" pane and registers
      `/branchline`.
- [x] **2. Reading the repository**: run git through `$.process.run`, parse
      refs and log (separator `%x1f`), keep it in an atom. Show the branch
      table first (branch, date, behind/ahead of main, status).
- [x] **3. Lane layout**: compute lanes automatically, tested against a case
      with merge commits (two parents) and branches that joined.
- [x] **4. SVG graph on desktop**: dots, edges, ref pills, `HEAD` marked.
- [x] **5. Folding** of commit runs without refs (optional).
- [x] **6. Live updates**: a `tool.call` hook for git commands and a poll of a
      `HEAD`/refs fingerprint through `$.clock.every`.
- [x] **7. Terminal fallback**: a text graph for `surface === 'terminal'`.
- [x] **8. Interaction**: open a branch to see its commits and files, ask
      Claude about it, copy its name.
- [x] **9. Sharing**: `marketplace.json`, an install line in the README,
      license, contributing guide and CI.

## Open questions

- Should branches fully merged into main be hidden by default?
- How many commits back (200?), and how far back in time for old branches?
- Automatic `git fetch`: off by default. Turn it on through `userConfig`?
- Expanding one folded group with a click: split the graph into SVG pieces
  around each group and put a button on the group's row? Try whether it looks
  good.
- The graph shows at most 150 rows. Is a "Show more" button needed to go
  further back in large repositories?

## Decisions

- 2026-11-19: project created. The desktop app is the main target. The mod
  only reads the repository and changes nothing in it.
- 2026-11-19: the name is `git-branchline` (display name "Branchline for
  Claude Code", command `/branchline`, pane title "Branchline"). The pane
  opens at session start.
- 2026-11-19: after changing `CLAUDE_CODE_PLUGIN_DIRS`, the desktop app must
  be quit fully and started again; a new session with + is not enough.
- 2026-11-19, step 2: branches are compared with `origin/<default branch>` if
  it exists, else the local default branch (from `origin/HEAD`, else main,
  master, else HEAD). Ahead/behind is read with `%(ahead-behind:…)` in one call
  (git 2.41+), else one `rev-list` per branch. Status: `base`, `merged` (no
  commits of its own), `stale` (older than 90 days), else `open`; HEAD is shown
  separately. Remote branches are shown only when no local branch tracks or
  mirrors them. Pure logic lives in `hooks/core/` (without `$`) so it can be
  reused, for example in an MCP server.
- 2026-11-19, step 3: `hooks/core/layout.ts` puts each commit in a lane. The
  base branch's first-parent line (from `origin/main` or `main`) has lane 0 to
  itself. The first parent continues in the child's lane; a merge's other
  parents get a new lane unless one is already waiting for them. Each edge has
  `fromLane`, `viaLane` (the lane it runs down) and `toLane`, so the drawing
  can bend right after the child and again at the parent. A parent below the
  200 commits gives an open edge (no `to`). Tested against a real history with
  two merges and a branch off a branch, the same shape as `git log --graph`.
- 2026-11-19, step 4: `hooks/core/svg.ts` draws the graph as one SVG document
  (row height 24 px, lane width 16 px): dots in the branch color, a larger dot
  for commits with refs, a ring around HEAD, ref pills (HEAD in the warning
  color, tags dashed, `origin/`/`upstream/` unfilled), subject and "author ·
  date". Colors follow light/dark mode through `prefers-color-scheme`, since
  the SVG is shown as an image and does not inherit the text color. At most
  150 rows, fewer if the source would pass 131,072 characters.
- 2026-11-19, step 5: `hooks/core/compact.ts` folds a chain of at least 4
  commits that have no refs, are not merges and have no branch leaving them
  (only the top one may have several children). The row shows "N commits",
  the authors (most frequent first, at most three) and the date range, drawn
  as a square. The root commit is never folded.
- 2026-11-19: hover in the graph. The SVG is drawn with `isInteractive`, and
  each row has a `<title>` (hash, date, author, message, refs) and is
  highlighted under the pointer. A folded row lists its commits (at most 30).
  Clicks in the graph do not reach the mod: the SVG is shown in a frame
  without scripts, and a `Button` only takes text. Expanding a single group by
  clicking it would need the graph split into pieces with a button on the
  folded row (see open questions).
- 2026-11-19, step 6: `hooks/watch.ts` reads a cheap fingerprint of the
  repository (every ref with its commit, the checked-out branch, and `HEAD`)
  and reads everything again only when it changed. The fingerprint is checked
  every 5 seconds and right after every Bash or PowerShell call that runs
  `git`. `/branchline` always reads again. Checks that arrive during a read are
  coalesced into one more. The tool-call hooks have `.catch`, so an error in
  the mod never stops Claude's commands.
- 2026-11-19: the graph is drawn at the pane's width and its full height,
  without scaling (`width`/`height` on `Svg`), so you move through the graph by
  scrolling the pane. Without an explicit height the interactive frame was
  150 px tall and 150 commits shrank to unreadable. The desktop app gives the
  pane's size in cells: measured, 76 cells ≈ 640 px (8.4 px per cell) and a row
  ≈ 22 px. Folding happens only when the commits do not fit the pane
  (`foldMode` `auto`); the button picks `fold` or `expand` for the rest of the
  session.
- 2026-11-19: the branch table is split into groups, in this order: Active
  (HEAD, the base, and unmerged local branches with a commit in the last 14
  days), Local and remote (other local branches that are also on a remote),
  Remote only, and Old local (the remaining local ones). Each group has a
  header that folds it; Old local starts folded. A pane split into a graph
  half and a branches half, each scrolling on its own, was wanted, but a `Box`
  cannot scroll vertically (only `overflow: hidden`), so the whole pane
  scrolls as one; tabs are used instead.
- 2026-11-19: the graph is drawn 48 px narrower than the pane's measured width
  (padding and scroll bar) and anchored at the top, so it is not scaled down
  and centered with a gap above it. A local branch and its `origin/` copy on
  the same commit show as one pill (`main ⇅`). Pills that would run into the
  author and date are replaced with `+N`.
- 2026-11-19: the pane has two tabs, **Graph** and **Branches (N)**, as buttons
  under the headline (the selected one as `primary`), kept for the session
  (`view` in `$.state`). Branches are drawn as SVG per group
  (`hooks/core/branches-svg.ts`): a dot in the branch's graph color, the name
  (HEAD as a pill, `⇅` when the branch is also on a remote), age in words ("3
  days ago"), a bar for behind (gray, to the left) and ahead (the branch color,
  to the right) on a log scale, and a colored status chip. In the terminal,
  which has no `Svg`, the groups are Markdown tables.
- 2026-11-19, step 8: each branch in the Branches tab is its own row (an SVG
  strip) with a `›` button on the right, since clicks do not reach into an
  SVG. The button opens the branch: the mod reads `git log base..branch` (at
  most 15 commits) and `git diff --numstat base...branch` (the 10 most changed
  files) and shows them under the row. **Ask Claude about it** fills the
  prompt box with a question about the branch (contents, ready to merge, needs
  updating, can be deleted) that ends "Don't change anything yet." It is not
  sent; the user sends it. **Copy name** copies the branch name.
- 2026-11-19, step 7: in the terminal the Graph tab draws a text graph
  (`hooks/core/textgraph.ts`) in the style of `git log --graph`: a line per
  commit (`●`, `◉` for HEAD, `■` for a folded row) and a connecting line only
  where an edge changes lanes, drawn with rounded box characters
  (`╭ ╮ ╰ ╯ ├ ┤ ┼`). Refs are written as `(HEAD → main ⇅, tag: v1)`, with author
  and date dimmed last. On mobile the Graph tab points to Branches.
- 2026-11-19: deleting branches from the Branches tab. An opened local branch
  with no commits of its own (0 ahead of the base) gets **Delete branch**,
  which asks "Delete x? Everything on it is merged." and then runs
  `git branch -d -- x`. A local branch with commits of its own gets **Delete
  via Claude…**, and a branch on a remote **Delete on origin via Claude…**;
  both only fill the prompt box with a question asking Claude to show what
  would be lost and ask first. The Old local group has **Delete merged branches
  (N)…**, which lists the branches and deletes them after confirmation, one at
  a time, and says which ones git refused. HEAD and the base cannot be deleted
  from here.
- 2026-11-19: the graph is colored per **branch**, not per lane
  (`hooks/core/owners.ts`). Each commit belongs to the first branch that
  reaches it along first parents: the base first, then HEAD's branch, then the
  others from the top. Commits no branch reaches (a merged and deleted branch)
  get a name from the merge commit's message ("Merge branch 'x'", "Merge pull
  request #n from x"). A first-parent edge belongs to the child's branch, a
  merge edge to the branch it brings in. The same colors are used in the
  terminal graph and for the dot in the Branches tab. Hovering a branch's line
  or dot dims the others and shows its name. Where a branch starts, `↳ name`
  is written in its color.
- 2026-11-19: the pane opens only when a surface is attached: at session start
  if one is there, otherwise when the first one attaches (`session.attach`),
  once per load. Before, a session with no attached app gave a `no-surface`
  error.
- 2026-11-19: by default the graph reads only what branches, remote branches
  and HEAD reach (`git log --branches --remotes HEAD`), not `--all`. Commits
  only a tag keeps alive (for example release-candidate builds tagged on
  merges that never landed on a branch) are hidden until **Show tag-only
  commits** is pressed. Tags on commits that are on branches show as before.
  With the button on, such lines are named after their tag ("… (tag only, on
  no branch)" on hover), and a commit a merge brought in without a branch name
  in its message gets the pull request number (`#726`) instead of "merged
  branch".
- 2026-11-20: the API has no place for a mod's own icon in the desktop app's
  toolbar or sidebar. Instead the mod draws a row above the prompt
  (`AbovePrompt`) with a **Branchline** button and the checked-out branch
  beside it (`feature/x · 2 ahead, 1 behind origin/main`). The row shows only
  while the pane is closed and the session is in a Git repository. Whether the
  pane is open is kept in `paneUp`: set when the mod opens it, cleared by a
  `ui.close` hook, and read again from `$.ui.panes()` on reload. The test kit
  cannot close a pane the way a person does; the `ui.close` path was tried by
  hand in the desktop app and works.
- 2026-11-20: published as open source under the MIT license, with English
  documentation, at `dvalfrid/git-branchline`. The repository is its own
  marketplace (`.claude-plugin/marketplace.json`). CI runs
  `claude plugin validate` and `claude plugin test` on every push and pull
  request.
- 2026-11-21: all the pane's buttons are in one row under the headline: the
  two tabs, then (on the Graph tab) **Fold quiet stretches** and **Show
  tag-only commits**. A header that stays put while the content scrolls was
  wanted, but a Pane has no sticky part, and both ways tried fell short in the
  desktop app. Scrolling the content itself (a `ui.scroll` hook and a cropped
  SVG) got no scroll events while the tree fit the pane, and swapping the
  SVG's source on every step made the pane flash. A header drawn over the
  content (`position="absolute"` at `top={scroll.offset}`) followed the
  scroll only after each redraw, so it jumped. So the header scrolls with
  the content, until the API offers buttons in a pane's own title bar or a
  part that does not scroll.
- 2026-11-21: in the desktop app, a graph `Svg` that changes height while the
  pane is open puts the pane's scrolling out of step: the app believes it is
  a few rows down (`offset` 2) while the scroll bar is at the top, sends no
  scroll event upwards, and the headline can no longer be reached. Switching
  tabs hid it for a moment; only a pane mounted afresh (switching chats) set
  it right. Keying the graph by its size and drawing the pane short for a
  moment did not help. So **Fold quiet stretches** and **Show tag-only
  commits** close the pane and open it again (`$.ui.close`, then `$.ui.open`),
  which the app animates. To make that movement feel like a setting being
  changed, the two are drawn as check boxes (`☐`/`☑` on a plain Button, since
  there is no check box element), their labels fixed. A height change from
  new commits does not reopen the pane; whether it trips the same fault is
  not known yet.
- 2026-11-21: **Fold quiet stretches** and **Show tag-only commits** moved
  from the pane to the plugin's settings (`userConfig` in `plugin.json`:
  `foldQuietStretches` `auto`/`always`/`never`, `showTagOnlyCommits`), so they
  are kept between sessions and chats. They are seldom changed, and a folded
  row lists its commits on hover. A change reloads the module; `session.start`
  compares the settings with those the pane was last drawn with (`drawnWith`)
  and, when they differ and the pane is open, closes and opens it, for the
  scrolling fault above. The desktop app's plugin settings list only
  installed plugins, not one loaded from a folder, so the pane changes them
  itself through `$.config.set` (as the config menu would): a picker for
  folding and a check box for tag-only commits, beside the tabs.
- 2026-11-21, corrected: the scrolling fault comes from the keyboard, not
  from the graph's height. Once a press or a pick in the pane gives it the
  keyboard, the desktop app stops scrolling short of the top (a scroll event
  says `offset` 2 while the scroll bar is at the top, and none comes upwards);
  Esc, which hands the keyboard back, sets it right, as does switching chats.
  A mod cannot hand the keyboard back: filling the prompt box with its own
  draft (`$.prompt.fill`) was tried and does not move it. So a change of
  either setting closes the pane and opens it again (dropping the keyboard;
  the app slides it in, and settings change seldom), and while `isFocused`
  after any other press the pane says "Esc to scroll freely". To be reported
  to Anthropic.
- 2026-11-21: `$.config.set` finds no settings rows for a plugin loaded from a
  folder in the desktop app, and its Plugins settings list only installed
  plugins. So the pane keeps the two settings itself in `$.store` (`prefs`),
  read at `session.start` and `/branchline`; the `userConfig` values are the
  defaults when nothing is kept. Two check boxes (folding: checked `auto`,
  unchecked `never`; tag-only commits) sit beside the tabs.
- 2026-11-21: tried against real repositories built for it (the mod's
  `repo.ts` and `core/` run with Node against git 2.56): an empty repository,
  no remote, `master` and `trunk` as the default branch, detached HEAD, a
  rebase in progress, shallow clones, a worktree, a submodule, a session in a
  subfolder, an unrelated orphan branch, unusual names (`ÅÄÖ`, `#`, emoji,
  markup, 200 characters) and 500 branches with 2,000 tags and 3,000
  commits. Nothing failed, and every SVG was well-formed. The large one reads
  in 0.6 s (the 5-second check 0.16 s); with git older than 2.41 (one
  `rev-list` per branch) it takes 7.5 s. A bare repository reads as "not a
  Git repository", which is left so. A branch group now shows its first 30
  branches, with a button for the rest.
- 2026-11-21: installing from the marketplace was tried in a clean
  configuration (`CLAUDE_CONFIG_DIR`), with and without an SSH key: Claude
  Code clones over SSH and falls back to HTTPS, and the plugin installs and is
  enabled. It notes that two userConfig options are not set; both have
  defaults. An installed plugin is kept per `version`, so each release raises
  it (see CONTRIBUTING.md).

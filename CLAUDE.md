# CLAUDE.md

Starting context for coding sessions in this project. Read this file and
`ROADMAP.md` first in every session.

## What it is

**git-branchline** (display name "Branchline") is a Claude Code mod (a
plugin) that shows the Git history of the session's repository in a pane
beside the chat: branches, tags, remotes, where `HEAD` is and how the
branches stand against `main` (ahead/behind). The pane updates by itself when
the history changes: commit, fetch, pull, checkout, merge.

The Claude desktop app (Code tab) is the main target; the terminal has a
simpler fallback, and mobile shows the branch list.

## How a mod is built (read before writing code)

**Load the `plugin-authoring` skill first in every coding session** (the Skill
tool). It has the API, examples and where the types are for the Claude Code
build that is running. Don't guess the API from memory; it changes between
versions. The types file `.claude-plugin/types/claude-code/index.d.ts` (about
14,000 lines, written by the engine when it loads the mod) is the reference:
grep it for `Pane: {`, `'tool.call'`, `$.process`, `Svg` and the like.

Layout:

```
git-branchline/
  .claude-plugin/plugin.json       the manifest
  .claude-plugin/marketplace.json  makes the repository installable
  hooks/hooks.json                 { "modules": ["./register.tsx"] }
  hooks/register.tsx               hooks, state atoms and drawing
  hooks/repo.ts                    reads the repository with git through a run function
  hooks/watch.ts                   cheap change detection and coalesced reloads
  hooks/core/*.ts                  pure logic without $ (parsing, layout, SVG, text)
  hooks/**/*.test.ts(x)            tests, run with `claude plugin test .`
  types/index.d.ts                 the contract for values in $.state (interface PluginState)
```

- Every hook is `($, e, next)`. `$` is the engine interface (there is no DOM
  and no Node in the module), `e` is the event and `next(e)` lets the rest run.
- **Pane:** `$.ui.open({ id, title })` opens it, and an
  `on('ui.render', { component: 'Pane', requestId: id }, …)` hook draws it.
  Elements come per surface: `const { Box, Text, Svg, Button } = $.ui.resolve(e)`,
  where `e.surface` is `desktop`, `terminal`, `vscode` or `mobile`.
- **Row above the prompt:** a `ui.render` hook on `{ component: 'AbovePrompt' }`.
- **State the drawing reads:** `atom(ref, initial, { shape })`, `read($, atom)`
  while drawing, `update($, atom, fn)` from other hooks. A write redraws.
  Change the `shape` tag when the data's shape changes.
- **Running git:** `$.process.run({ argv: ['git', '-C', repo, …] })`. Always
  pass argv as a list, never a joined shell string.
- **Slash command:** `$.command.register({ name: 'branchline', … })` in
  `session.start`, answered by a `command.run` hook.
- **Timer:** `$.clock.every(…)` (stopped on reload).
- Checks: `claude plugin validate .`, `claude plugin test .`,
  `node scripts/check.mjs` (the read-only rule, argv lists, imports and
  `.catch`), and `npx -p typescript@5 tsc -p .` once the engine has written
  `.claude-plugin/types/` (see CONTRIBUTING.md). The Checks workflow runs
  all four on Linux and Windows.

### Loading the mod during development

- **Terminal:** `claude --plugin-dir <path to this folder>`. The folder is
  watched and the mod reloads when you save.
- **Desktop app:** add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env`
  block of `~/.claude/settings.json` (not a project's settings), plus
  `"CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"`. Then quit the desktop app fully and
  start it again: a new session with + does not re-read the setting.
  **Ask the user before changing `~/.claude/settings.json`.**
- An error in a hook shows as a dim line in the transcript
  (`git-branchline: … hook skipped: …`) and in the debug log (`claude --debug`).

## Design

**Data:** a few git calls give everything.

```
git for-each-ref --format=…%(ahead-behind:<base>)… refs/heads refs/remotes refs/tags
git log --branches --remotes HEAD --date-order -n 200 --format=… (--all with the showTagOnlyCommits setting)
git rev-list --left-right --count <base>...<branch>   (fallback before git 2.41)
```

Fields are separated with `%x1f` and records with `%x1e`, which do not occur
in commit messages, and parsed to `{ id, parents[], date, author, refs[], subject }`.

**Layout:** commits newest first, one row each. The base branch's first-parent
line is lane 0. A commit inherits its child's lane; a new branch gets the next
free lane. Edges are straight in a lane and bend (a path with Q) where they
change lanes. Commits are colored by the branch that owns them
(`hooks/core/owners.ts`), not by lane.

**Folding:** a long run of commits in one lane with no refs and no forks
becomes one row ("12 commits (Lars, Linda, …)"), drawn as a square. It
happens only when the graph does not fit the pane, unless the
`foldQuietStretches` setting (`userConfig`) says `always` or `never`.

**Per surface:**
- `desktop`/`vscode`: an `Svg` element for the graph (source up to 131,072
  characters), and the Branches tab as SVG strips with buttons.
- `terminal`: a text graph in the style of `git log --graph --oneline`, and
  Markdown tables for branches.
- `mobile`: the branch list only.

**When it updates:**
1. After a tool call: a `tool.call` hook checks, after `await next(e)`,
   whether a Bash or PowerShell command ran `git`, and reads again if so.
2. A cheap poll every 5 seconds (`$.clock.every`) compares a fingerprint of
   refs and `HEAD`, and reads everything only when it changed. That catches
   changes made in a terminal or another Git client.
3. `/branchline` opens the pane and reads again.

**Which repository:** the session's working folder; the root comes from
`git rev-parse --show-toplevel`, with a friendly "not a Git repository" otherwise.

Lane colors that work in both light and dark mode: gray `#5F5E5A` (base),
teal `#1D9E75`, coral `#D85A30`, purple `#7F77DD`, pink `#D4537E`, blue `#378ADD`.

## Conventions

- English in code, identifiers and documentation.
- No npm dependencies in the mod (the module has no Node anyway). Tests run
  with `claude plugin test`.
- Reading is harmless, but the mod must **never** change the repository (no
  fetch, no checkout, no push) unless the maintainers have decided on such a
  feature. An automatic `git fetch` would be convenient, but it goes to the
  network and changes remote refs: if it is built, it is off by default and
  turned on through `userConfig`.
- The one exception: the mod may delete **merged local** branches with
  `git branch -d` (which refuses unmerged work), and only after two presses
  (button and confirmation). Everything else that changes the repository,
  such as `git branch -D` or deleting a branch on a remote, is left to Claude:
  the button only fills the prompt box, and Claude runs it with its usual
  permission prompts.
- Keep `ROADMAP.md` current: tick steps and write decisions there in the same
  commit, and add user-visible changes to `CHANGELOG.md`.
- Releases go through the Release workflow (`gh workflow run release.yml -f
  version=X.Y.Z`), which runs `scripts/release.mjs` (see CONTRIBUTING.md).
  The marketplace entry points at a release tag, so work on `main` reaches
  nobody until it is released. Never point the entry at `main` or `./`.

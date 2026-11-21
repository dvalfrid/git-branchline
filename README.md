# Branchline for Claude Code

[git-branchline.codeby.se](https://git-branchline.codeby.se)

`git-branchline` is a Claude Code mod that shows the Git history of the
session's repository in a pane beside the chat: branches, tags, remotes,
where `HEAD` is, and how each branch stands against the default branch. The
pane updates by itself when the history changes: a commit, fetch, pull,
checkout or merge, whether Claude ran it or you did in a terminal or another
Git client.

![The Branchline graph updating as commits, a merge and new branches land](docs/branchline.gif)

## Features

- **Graph tab**: the commit graph, colored by branch, with ref pills, `HEAD`
  marked and hover tooltips. Long quiet stretches fold into one row when the
  graph does not fit (see Settings). Commits only a tag keeps are hidden unless you ask for
  them.
- **Branches tab**: branches grouped as Active, Local and remote, Remote only
  and Old local, with age, ahead/behind bars and status. Open a branch to see
  its commits and most changed files, ask Claude about it, copy its name, or
  delete it.
- **A row above the prompt** opens the pane while it is closed, with the
  checked-out branch and how it stands against the base.
- **Terminal**: a text graph in the style of `git log --graph`.
- `/branchline` opens the pane and reads the repository again.

Branchline only reads the repository. The one exception: it can delete a
**merged local** branch with `git branch -d` (which refuses unmerged work),
after two presses. Anything else that changes the repository, such as
`git branch -D` or deleting a branch on a remote, is handed to Claude as a
prompt for you to send, and runs with Claude's usual permission prompts.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install git-branchline --marketplace dvalfrid/git-branchline
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in
every session).

From a shell:

```
claude plugin install git-branchline --marketplace dvalfrid/git-branchline
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to
the prompt box, then **Plugins**, **Add marketplace** with
`dvalfrid/git-branchline`, then **Add plugin**. A mod installed from a
terminal at the user scope also loads in the desktop app.

The install clones over SSH and falls back to HTTPS, so no GitHub key is
needed. It may say that two userConfig options are not set: both have
defaults (see Settings), so there is nothing to configure.

Requires Git on `PATH`. Git 2.41 or later reads ahead/behind counts in one
call; older versions fall back to one `rev-list` per branch, which takes
seconds in a repository with hundreds of branches.

## Known issues

- In the desktop app, after a click in the pane, it can stop scrolling a
  couple of rows short of its top while it holds the keyboard. Press Esc (the
  pane says so). Reported as
  [anthropics/claude-code#111465](https://github.com/anthropics/claude-code/issues/111465).
- In VS Code, a pane cannot be scrolled from code
  ([anthropics/claude-code#104733](https://github.com/anthropics/claude-code/issues/104733)).
  Branchline has not been tried there yet, nor on mobile.


## Settings

Two settings, kept between sessions. Change them beside the tabs in the pane
(two check boxes). Their defaults are the plugin's configuration
(Claude Code's config menu, or `pluginConfigs` in `~/.claude/settings.json`);
a change made in the pane wins over them:

| Setting | Values | Default |
|---|---|---|
| `foldQuietStretches` | `auto` (only when the graph does not fit), `always`, `never` | `auto` |
| `showTagOnlyCommits` | `true`, `false` | `false` |

Unchecked, **Fold quiet stretches** never folds; checked, it folds when the
graph does not fit (`auto`), or always if the default says `always`. A
folded row lists its commits when you hover it.

## Develop

```
git clone https://github.com/dvalfrid/git-branchline
claude --plugin-dir ./git-branchline
```

The folder is watched, and the mod reloads when you save. In the desktop app,
add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of
`~/.claude/settings.json` (and `"CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"`), then
quit the app fully and start it again.

Checks:

```
claude plugin validate .
claude plugin test .
node scripts/check.mjs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the code is laid out and how
to send a change, and [ROADMAP.md](ROADMAP.md) for what is planned and why
things are the way they are.

## License

[MIT](LICENSE)
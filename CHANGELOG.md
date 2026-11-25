# Changelog

All notable changes are listed here. Versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

- The README has a FAQ. Its first entry covers an update that fails with
  "Permission denied (publickey)" when the SSH key lives in an agent, with
  ways around it. The README also explains how to turn on auto-update.
- The README says Branchline needs Claude Code 2.1.284 or later (measured,
  where it said 2.1.326), and a FAQ entry covers a pane that does not load
  because the `claude` in the terminal is older than the desktop app.
- Fixed: in a narrow pane the Branches tab lost the branch names, and the
  age was drawn over the dot. A narrower pane now gets shorter ahead/behind
  bars and a short age ("3w"), then the counts as text ("↓49 ↑4") instead of
  a bar, then no age, so the name keeps its room.

## 0.3.2 (2026-11-21)

- The plugin's icon, documentation and support links are set in
  `plugin.json`, where the plugin directory reads them.
- The author and the marketplace's owner are Code By AB.

## 0.3.1 (2026-11-21)

- Fixed: a branch name holding backticks (Git allows them) is shown and put
  in a prompt exactly, instead of with `'` in their place or broken apart.
- `git diff` runs with `--no-ext-diff --no-textconv`, so a repository's own
  diff programs never run.
- The plugin is now called **Branchline** in the desktop app's Directory and
  in the plugin list, without "for Claude Code".

## 0.3.0 (2026-11-21)

- The desktop app's plugin Directory shows the plugin as **Branchline for
  Claude Code**, with a description, instead of "Git branchline".

## 0.2.0 (2026-11-21)

- All the pane's buttons are in one row under the headline.
- A branch group shows its first 30 branches, with **Show all N branches**
  below; each branch is a drawing of its own, and a repository can have
  hundreds.
- **Fold quiet stretches** and **Show tag-only commits** sit beside the tabs
  as check boxes, kept between sessions. Their defaults are settings
  (`userConfig`). A folded row lists its commits on hover.
- Changing either setting opens the pane again. After any other press, while
  the pane holds the keyboard, it says "Esc to scroll freely": the desktop
  app can then stop scrolling short of the pane's top.
- An icon for the plugin directory (`.claude-plugin/icon.png`, drawn from
  `assets/icon.svg`).
- An animated picture of the graph in the README (`docs/branchline.gif`).
- A website at https://git-branchline.codeby.se, served by GitHub Pages from
  `docs/`.

## 0.1.0 (2026-11-20)

First public version.

- Graph tab: commit graph colored by branch, ref pills, `HEAD`, hover
  tooltips, folding of quiet stretches, tag-only commits on request.
- Branches tab: grouped branches with age, ahead/behind and status; open a
  branch, ask Claude about it, copy its name, delete merged local branches.
- A row above the prompt that opens the pane while it is closed.
- Text graph in the terminal.
- Live updates after Claude's Git commands and every 5 seconds.
- `/branchline` command.
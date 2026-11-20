# Changelog

All notable changes are listed here. Versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

- An icon for the plugin directory (`.claude-plugin/icon.png`, drawn from`n  `assets/icon.svg`).
- An animated picture of the graph in the README (`docs/branchline.gif`).

## 0.1.0

First public version.

- Graph tab: commit graph colored by branch, ref pills, `HEAD`, hover
  tooltips, folding of quiet stretches, tag-only commits on request.
- Branches tab: grouped branches with age, ahead/behind and status; open a
  branch, ask Claude about it, copy its name, delete merged local branches.
- A row above the prompt that opens the pane while it is closed.
- Text graph in the terminal.
- Live updates after Claude's Git commands and every 5 seconds.
- `/branchline` command.
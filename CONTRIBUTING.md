# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Before you start

- Open an issue first for anything larger than a small fix, so we can agree
  on the approach before you spend time on it.
- Read [CLAUDE.md](CLAUDE.md): it describes how a Claude Code mod is built,
  how this one is laid out, and the rules it follows. It is also the context
  file a Claude Code session in this repository reads.
- [ROADMAP.md](ROADMAP.md) lists open questions and the decisions made so far,
  with the reasons.

## Setup

You need [Claude Code](https://claude.com/claude-code) and Git. There are no
npm dependencies.

```
git clone https://github.com/dvalfrid/git-branchline
cd git-branchline
claude --plugin-dir .
```

Claude Code writes the API types to `.claude-plugin/types/` when it loads the
mod from a watched folder (the folder is ignored by Git). Without a session
open, this writes them and stops at "Not logged in":

```
CLAUDE_CODE_PLUGIN_DIR_WATCH=1 claude -p ok --plugin-dir .
```

Then `npx -p typescript@5 tsc -p .` type-checks the code, tests included.

## Making a change

1. Keep pure logic in `hooks/core/` (no `$`), with tests beside it
   (`*.test.ts`). `hooks/repo.ts` runs Git, `hooks/register.tsx` wires the
   hooks and draws the pane.
2. Run the checks:
   ```
   claude plugin validate .
   claude plugin test .
   node scripts/check.mjs
   npx -p typescript@5 tsc -p .
   ```
   `scripts/check.mjs` holds the code to the rules below: every git call
   it finds must be a read (`rev-parse`, `for-each-ref`, `symbolic-ref`,
   `log`, `rev-list`, `diff`) or `branch -d`, with a literal subcommand; no
   shell as the program; `$.process.run` only through `repo.ts`; imports
   only from `claude-code` or relative paths; no leftover script lines; and
   no gating hook without `.catch`. The Checks workflow runs it on every push and pull
   request. A new git read goes on its list in the same change.
3. Try it in a real session, on the surfaces you changed (desktop app,
   terminal), and say in the pull request which ones you tried.
4. Record a decision or a ticked step in `ROADMAP.md` in the same commit, and
   add a line to `CHANGELOG.md` under Unreleased.

A release raises `version` in `.claude-plugin/plugin.json`: Claude Code keeps
an installed plugin per version, so people who installed it get the change
only when the number changes. Then tag it (`vX.Y.Z`) and move the Unreleased
lines in `CHANGELOG.md` under that version.

## Rules the code keeps

- Read-only by default. The mod never fetches, checks out or pushes on its
  own. The only change it makes itself is `git branch -d` on a merged local
  branch, after a confirmation. Anything else goes through Claude.
- Pass Git arguments as an argv list, never as a joined shell string.
- No npm dependencies in the mod.
- English in code, identifiers and documentation.

## Pull requests

- One topic per pull request, with a short description of what and why.
- The Checks workflow (`.github/workflows/checks.yml`) validates the plugin,
  runs the tests, checks the code rules and type-checks, on Linux and
  Windows, for every pull request.
- By contributing you agree that your work is released under the
  [MIT License](LICENSE).

## Conduct

Be kind and assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
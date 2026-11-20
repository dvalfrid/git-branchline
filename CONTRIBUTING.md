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
mod (the folder is ignored by Git). After that, `tsc -p .` type-checks the
code if you have TypeScript installed.

## Making a change

1. Keep pure logic in `hooks/core/` (no `$`), with tests beside it
   (`*.test.ts`). `hooks/repo.ts` runs Git, `hooks/register.tsx` wires the
   hooks and draws the pane.
2. Run the checks:
   ```
   claude plugin validate .
   claude plugin test .
   ```
3. Try it in a real session, on the surfaces you changed (desktop app,
   terminal), and say in the pull request which ones you tried.
4. Record a decision or a ticked step in `ROADMAP.md` in the same commit, and
   add a line to `CHANGELOG.md` under Unreleased.

## Rules the code keeps

- Read-only by default. The mod never fetches, checks out or pushes on its
  own. The only change it makes itself is `git branch -d` on a merged local
  branch, after a confirmation. Anything else goes through Claude.
- Pass Git arguments as an argv list, never as a joined shell string.
- No npm dependencies in the mod.
- English in code, identifiers and documentation.

## Pull requests

- One topic per pull request, with a short description of what and why.
- CI runs validation and the tests on every pull request.
- By contributing you agree that your work is released under the
  [MIT License](LICENSE).

## Conduct

Be kind and assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
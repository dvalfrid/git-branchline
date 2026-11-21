# Security

Branchline runs Git commands on your machine through Claude Code, so a bug
that makes it run an unexpected command, or change a repository without being
asked, is a security issue.

What Branchline runs: the Git reads `rev-parse`, `for-each-ref`,
`symbolic-ref`, `log`, `rev-list` and `diff --numstat --no-ext-diff
--no-textconv`, each as an argument list with no shell, and `git branch -d`
on a merged local branch after you press twice. Claude Code runs Git with the
repository's hooks off. Branchline sends nothing over the network. It can put
a question in the prompt box, with branch names quoted exactly, but never
sends it; you do. `scripts/check.mjs` holds the code to this in CI.

Please report one privately through
[GitHub security advisories](https://github.com/dvalfrid/git-branchline/security/advisories/new)
rather than in a public issue. You can expect an answer within a week.

Only the latest release is supported.
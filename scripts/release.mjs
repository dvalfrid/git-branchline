#!/usr/bin/env node
// Releases a version of the plugin. People who installed it get an update
// only when the version changes, and the marketplace entry points at a
// release tag, so main can hold work that is not released yet.
//
//   node scripts/release.mjs 0.2.0 --dry-run   shows what it would do, changes nothing
//   node scripts/release.mjs 0.2.0             releases 0.2.0
//
// In order: checks that main is clean and even with origin; runs the checks;
// sets the version in plugin.json and in the marketplace entry, points the
// entry at the tag v0.2.0 and moves CHANGELOG.md's Unreleased lines under
// 0.2.0; commits "Release 0.2.0"; checks that plugin.json and the entry agree
// and tags the commit v0.2.0; pushes the tag, then
// main (so the entry never points at a tag that is not there); and makes a
// GitHub release with the changelog lines.

import { execFileSync, execSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const args = process.argv.slice(2)
const isDry = args.includes('--dry-run')
const version = args.find(arg => !arg.startsWith('--'))
const remote = 'origin'
const branch = 'main'

const inActions = process.env.GITHUB_ACTIONS === 'true'
const stop = message => {
  console.error(inActions ? `::error::release: ${message}` : `release: ${message}`)
  process.exit(1)
}
/** A line for the run's summary page on GitHub (the Release workflow). */
const summary = text => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
}
const say = message => console.log(`release: ${message}`)
// On Windows, claude and npx are often .cmd files, which run only through a
// shell; there the arguments are quoted into one command line.
const needsShell = program => process.platform === 'win32' && (program === 'claude' || program === 'npx')
const quote = arg => (/^[\w./:@%=+-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`)
const exec = (program, argv, stdio) =>
  needsShell(program)
    ? execSync([program, ...argv].map(quote).join(' '), { cwd: root, encoding: 'utf8', stdio })
    : execFileSync(program, argv, { cwd: root, encoding: 'utf8', stdio })
const run = (program, argv, options = {}) => exec(program, argv, options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit')
const read = (program, argv) => exec(program, argv, ['ignore', 'pipe', 'pipe']).trim()

// The version asked for, above the current one.
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/
if (!version || !SEMVER.test(version)) stop('give the version to release, as X.Y.Z (and --dry-run to try it)')
const pluginPath = join(root, '.claude-plugin', 'plugin.json')
const marketPath = join(root, '.claude-plugin', 'marketplace.json')
const changelogPath = join(root, 'CHANGELOG.md')
const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'))
const parts = v => SEMVER.exec(v).slice(1).map(Number)
const isAbove = (a, b) => {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}
if (!isAbove(version, plugin.version)) stop(`${version} is not above the current version, ${plugin.version}`)
// One plugin in this repository, so its tags are plain vX.Y.Z, not the
// <plugin>--vX.Y.Z that `claude plugin tag` makes for repositories of several.
const tag = `v${version}`

// Where the plugin is published: owner/name from the manifest's repository.
const repo = /github\.com[/:]([^/]+\/[^/.]+)/.exec(plugin.repository ?? '')?.[1]
if (!repo) stop('plugin.json has no GitHub repository to point the marketplace entry at')

// main, clean, and even with origin.
if (read('git', ['rev-parse', '--abbrev-ref', 'HEAD']) !== branch) stop(`check out ${branch} first`)
if (read('git', ['status', '--porcelain', '--untracked-files=no']) !== '') stop('commit or put away the changes first')
run('git', ['fetch', '--quiet', remote, branch, '--tags'])
if (read('git', ['rev-parse', 'HEAD']) !== read('git', ['rev-parse', `${remote}/${branch}`])) {
  stop(`${branch} is not even with ${remote}/${branch}: pull or push first`)
}
if (read('git', ['tag', '--list', tag]) !== '') stop(`the tag ${tag} already exists`)

// The changelog lines for this release.
const changelog = readFileSync(changelogPath, 'utf8')
const unreleased = /## Unreleased\n([\s\S]*?)(?=\n## )/.exec(changelog)
const notes = unreleased?.[1].trim() ?? ''
if (notes === '') stop('CHANGELOG.md has nothing under Unreleased to release')

say(`releasing ${plugin.version} → ${version} as ${tag}${isDry ? ' (dry run: nothing is changed)' : ''}`)

// The checks, as the Checks workflow runs them.
say('running the checks')
run('claude', ['plugin', 'validate', '.'], { quiet: true })
run('claude', ['plugin', 'test', '.'], { quiet: true })
run('node', ['scripts/check.mjs'])
if (existsSync(join(root, '.claude-plugin', 'types', 'claude-code', 'index.d.ts'))) run('npx', ['--yes', '-p', 'typescript@5', 'tsc', '-p', '.'])
else say('type-check skipped: no API types written here yet (see CONTRIBUTING.md)')

// The new files.
const today = new Date().toISOString().slice(0, 10)
const nextPlugin = readFileSync(pluginPath, 'utf8').replace(/"version":\s*"[^"]*"/, `"version": "${version}"`)
const market = JSON.parse(readFileSync(marketPath, 'utf8'))
const entry = market.plugins.find(p => p.name === plugin.name)
if (!entry) stop(`marketplace.json lists no plugin called ${plugin.name}`)
entry.source = { source: 'github', repo, ref: tag }
entry.version = version
const nextMarket = `${JSON.stringify(market, null, 2)}\n`
const nextChangelog = changelog.replace('## Unreleased\n', `## Unreleased\n\n## ${version} (${today})\n`)

if (isDry) {
  say(`plugin.json: version ${plugin.version} → ${version}`)
  say(`marketplace.json: ${plugin.name} → ${JSON.stringify(entry.source)}, version ${version}`)
  say(`CHANGELOG.md: the Unreleased lines go under "## ${version} (${today})"`)
  say(`then: commit "Release ${version}", tag ${tag}, push the tag, push ${branch}, GitHub release ${tag}`)
  console.log(`\n${notes}\n`)
  summary(`## Dry run: ${plugin.name} ${version}\n\nWould tag \`${tag}\`, point the marketplace entry at it and release:\n\n${notes}`)
  process.exit(0)
}

writeFileSync(pluginPath, nextPlugin)
writeFileSync(marketPath, nextMarket)
writeFileSync(changelogPath, nextChangelog)
run('git', ['add', pluginPath, marketPath, changelogPath])
run('git', ['commit', '--quiet', '-m', `Release ${version}`])
// What was committed must agree before it is tagged: plugin.json's version,
// the marketplace entry's version and the tag the entry points at. Claude Code
// takes plugin.json's version at install, and the entry's ref says what to fetch.
const committed = file => JSON.parse(read('git', ['show', `HEAD:.claude-plugin/${file}`]))
const committedEntry = committed('marketplace.json').plugins.find(p => p.name === plugin.name)
if (committed('plugin.json').version !== version || committedEntry?.version !== version || committedEntry?.source?.ref !== tag) {
  stop(`plugin.json, the marketplace entry and the tag do not agree on ${version}; the release commit is made but not tagged or pushed`)
}
run('git', ['tag', '--annotate', tag, '--message', `${plugin.name} ${version}`])

// The tag first: the entry on main points at it.
run('git', ['push', '--quiet', remote, `refs/tags/${tag}`])
run('git', ['push', '--quiet', remote, branch])
say(`pushed ${tag} and ${branch}`)

// The release goes where the tag was pushed: origin's GitHub repository, if it is one.
const pushedTo = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(read('git', ['remote', 'get-url', remote]))?.[1]
if (!pushedTo) say(`${remote} is not on GitHub: no GitHub release made`)
else {
  try {
    run('gh', ['release', 'create', tag, '--repo', pushedTo, '--verify-tag', '--title', `${plugin.name} ${version}`, '--notes', notes], { quiet: true })
    say(`GitHub release made: https://github.com/${pushedTo}/releases/tag/${tag}`)
  } catch (error) {
    // The tag and main are pushed; only the release page is missing.
    const why = `no GitHub release made (${String(error.message).split('\n')[0]}); make it from the tag ${tag} by hand`
    if (inActions) stop(why)
    say(why)
  }
}
summary(`## Released ${plugin.name} ${version}\n\nTag \`${tag}\`. People who installed it get it with \`claude plugin update ${plugin.name}@${plugin.name}\`.\n\n${notes}`)
say(`done: people who installed ${plugin.name} get ${version} with claude plugin update ${plugin.name}@${plugin.name}`)
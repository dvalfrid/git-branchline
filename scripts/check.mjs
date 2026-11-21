#!/usr/bin/env node
// Checks the rules in CONTRIBUTING.md that `claude plugin validate` and the
// tests do not: the mod only reads the repository, runs git with an argv
// list and no shell, has no npm dependencies, and keeps every gating hook
// behind a .catch. Node only, no packages.
//
//   node scripts/check.mjs            the checks; exits 1 on a failure
//   node scripts/check.mjs --base X   also warns when hooks/ changed since X
//                                     but CHANGELOG.md did not (pull requests)

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const failures = []
const warnings = []
const fail = (file, line, message) => failures.push({ file, line, message })

/** Every .ts and .tsx file under a folder. */
const sources = dir =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })

const files = sources(join(root, 'hooks')).map(path => ({
  path,
  name: relative(root, path).replaceAll('\\', '/'),
  text: readFileSync(path, 'utf8'),
  isTest: /\.test\.tsx?$/.test(path),
}))
const lineOf = (text, index) => text.slice(0, index).split('\n').length

// 1. Git only reads. The subcommands the mod may run, and `branch` only as
//    `branch -d` (which refuses unmerged work).
const READS = new Set(['rev-parse', 'for-each-ref', 'symbolic-ref', 'log', 'rev-list', 'diff'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'fish', 'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'])

/** An argument list split into string literals ({ value }) and anything else ({ code }). */
const literals = list =>
  list
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const quoted = /^(['"])([^'"\\]*)\1$/.exec(part)
      return quoted ? { value: quoted[2] } : { code: part }
    })

let gitCalls = 0
const checkGit = (file, index, args) => {
  gitCalls++
  // Skip `-C <dir>` and other options before the subcommand.
  let i = 0
  while (i < args.length) {
    const arg = args[i]
    if (arg.value === '-C') i += 2
    else if (arg.value?.startsWith('-')) i += 1
    else break
  }
  const sub = args[i]
  const line = lineOf(file.text, index)
  if (!sub || sub.value === undefined) return fail(file.name, line, 'git subcommand is not a string literal, so it cannot be checked')
  if (READS.has(sub.value)) return
  if (sub.value === 'branch' && args[i + 1]?.value === '-d') return
  const shown = sub.value === 'branch' ? `branch ${args[i + 1]?.value ?? args[i + 1]?.code ?? ''}`.trim() : sub.value
  fail(file.name, line, `git ${shown} is not one of the reads the mod may run (CONTRIBUTING.md)`)
}

for (const file of files.filter(f => !f.isTest)) {
  // Array argv: ['git', ...] and any argv whose program is a shell.
  for (const match of file.text.matchAll(/\[\s*['"]([\w.-]+)['"]\s*,([^\]]*)\]/g)) {
    const [, program, rest] = match
    if (SHELLS.has(program)) fail(file.name, lineOf(file.text, match.index), `runs a shell (${program}); give git an argv list instead`)
    // The helper that every git('…') call goes through: its calls are checked below.
    if (program === 'git' && /^\s*'-C'\s*,\s*root\s*,\s*\.\.\.args\s*$/.test(rest)) continue
    if (program === 'git') checkGit(file, match.index, literals(rest))
  }
  // The repo.ts helper: git('subcommand', ...), which adds ['git', '-C', root].
  for (const match of file.text.matchAll(/(?<![\w.])git\((?=\s*['"`\w.])\s*([^)]*)\)/g)) {
    if (/^\s*\.\.\.args/.test(match[1])) continue
    checkGit(file, match.index, literals(match[1].replace(/`[^`]*`/g, 'TEMPLATE')))
  }
  // process.run only through the read functions, which take a run function.
  for (const match of file.text.matchAll(/\$\.process\.run\(([^)]*)\)/g)) {
    if (match[1].trim() !== 'argv') {
      fail(file.name, lineOf(file.text, match.index), '$.process.run is called directly; go through repo.ts so the git calls are checked')
    }
  }
}

// 2. No npm dependencies: imports are claude-code (and its testing kit in
//    tests) or relative; no package.json with dependencies.
for (const file of files) {
  for (const match of file.text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"\n;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)) {
    const spec = match[1] ?? match[2]
    const ok = spec.startsWith('./') || spec.startsWith('../') || spec === 'claude-code' || (file.isTest && spec === 'claude-code/testing')
    if (!ok) fail(file.name, lineOf(file.text, match.index + 1), `imports ${spec}; the mod has no npm dependencies`)
  }
  for (const match of file.text.matchAll(/\brequire\s*\(/g)) fail(file.name, lineOf(file.text, match.index), 'uses require(); the module is an ES module')
}
const pkg = join(root, 'package.json')
if (existsSync(pkg)) {
  const json = JSON.parse(readFileSync(pkg, 'utf8'))
  if (Object.keys({ ...json.dependencies, ...json.peerDependencies, ...json.optionalDependencies }).length > 0) {
    fail('package.json', 1, 'has dependencies; the mod has none')
  }
}

// 3. Lines left over from an editing script (once found inside a comment in
//    table.ts): PowerShell here-strings and file calls have no place here.
const SCRIPT_LINE = /^\s*(?:Edit-File\b|\$[A-Za-z]\w*\s*=)|\[IO\.File\]::|^\s*@['"]\s*$|['"]@\s*$/
for (const file of files) {
  file.text.split('\n').forEach((line, i) => {
    if (SCRIPT_LINE.test(line)) fail(file.name, i + 1, 'looks like a line of a PowerShell script, not TypeScript')
  })
}

// 4. Gating hooks have a .catch, so an error in the mod never stops Claude's
//    commands. `claude plugin validate` reports one without; make it fail.
try {
  const out = execFileSync('claude', ['plugin', 'validate', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
  for (const line of out.split('\n')) {
    if (/gating hook without \.catch/i.test(line)) fail('hooks', 1, line.trim().replace(/^>\s*/, ''))
  }
} catch (error) {
  const out = `${error.stdout ?? ''}${error.stderr ?? ''}`
  if (error.code === 'ENOENT' || /not recognized|not found/i.test(out)) warnings.push('claude is not on PATH: the .catch check was skipped')
  else fail('.', 1, `claude plugin validate failed: ${out.trim().split('\n').slice(-3).join(' ')}`)
}

// 5. A change under hooks/ comes with a line in CHANGELOG.md (a warning: a
//    refactor may have nothing to say).
const baseAt = process.argv.indexOf('--base')
if (baseAt > 0 && process.argv[baseAt + 1]) {
  try {
    const range = `${process.argv[baseAt + 1]}...HEAD`
    const changed = execFileSync('git', ['-C', root, 'diff', '--name-only', range], { encoding: 'utf8' }).split('\n')
    const touchesHooks = changed.some(name => name.startsWith('hooks/') && !/\.test\.tsx?$/.test(name))
    if (touchesHooks && !changed.includes('CHANGELOG.md')) {
      warnings.push('hooks/ changed but CHANGELOG.md did not: add a line under Unreleased if people will notice')
    }
  } catch (error) {
    warnings.push(`could not compare with ${process.argv[baseAt + 1]}: ${String(error.message).split('\n')[0]}`)
  }
}

const inCi = process.env.GITHUB_ACTIONS === 'true'
for (const warning of warnings) console.log(inCi ? `::warning::${warning}` : `warning: ${warning}`)
for (const { file, line, message } of failures) {
  console.log(inCi ? `::error file=${file},line=${line}::${message}` : `error: ${file}:${line}: ${message}`)
}
console.log(`check: ${files.length} files, ${gitCalls} git calls; ${failures.length === 0 ? 'every rule kept' : ` problem(s)`}`)
process.exit(failures.length === 0 ? 0 : 1)
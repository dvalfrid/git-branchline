import { expect, test } from 'claude-code/testing'

import { FS, RS, baseRef, buildBranches, defaultBranch, parseAheadBehind, parseLeftRight, parseLog, parseRefs } from './git'

const row = (...fields: string[]) => fields.join(FS)

test('parseRefs reads each field and the HEAD marker', () => {
  const refs = parseRefs(row('refs/heads/main', 'a1', 'origin/main', '2026-11-18', '*') + '\r\n')
  expect(refs).toEqual([
    { refname: 'refs/heads/main', sha: 'a1', upstream: 'origin/main', date: '2026-11-18', isHead: true },
  ])
})

test('parseLog keeps subjects with pipes and splits refs and parents', () => {
  const out = row('m1', 'a1 b2', '2026-11-18', 'Lars', 'HEAD -> main, tag: v1', 'Merge a | b') + RS + '\n'
  expect(parseLog(out)).toEqual([
    { id: 'm1', parents: ['a1', 'b2'], date: '2026-11-18', author: 'Lars', refs: ['HEAD -> main', 'tag: v1'], subject: 'Merge a | b' },
  ])
})

test('ahead and behind parse from both git forms', () => {
  expect(parseAheadBehind(row('refs/heads/x', '2 7')).get('refs/heads/x')).toEqual({ ahead: 2, behind: 7 })
  expect(parseAheadBehind(row('refs/heads/x', ''))).toEqual(new Map())
  expect(parseLeftRight('7\t2\n')).toEqual({ ahead: 2, behind: 7 })
})

test('the default branch comes from origin/HEAD, else main or master', () => {
  const refs = parseRefs([row('refs/heads/master', 'a', '', '2026-11-01', ''), row('refs/heads/dev', 'b', '', '2026-11-02', '*')].join('\n'))
  expect(defaultBranch(refs, 'origin/trunk')).toBe('trunk')
  expect(defaultBranch(refs, undefined)).toBe('master')
  expect(baseRef(refs, 'master')).toBe('master')
})

test('a branch without counts is open or stale by its date', () => {
  const refs = parseRefs([row('refs/heads/main', 'a', '', '2026-11-18', '*'), row('refs/heads/new', 'b', '', '2026-11-01', ''), row('refs/heads/old', 'c', '', '2026-05-01', '')].join('\n'))
  const branches = buildBranches({ refs, counts: new Map(), defaultName: 'main', base: 'main', today: '2026-11-19' })
  expect(branches.map(b => `${b.name}:${b.status}`)).toEqual(['main:base', 'new:open', 'old:stale'])
})

test('branches are grouped: active, local and remote, remote only, old local', () => {
  const refs = parseRefs(
    [
      row('refs/heads/main', 'a', 'origin/main', '2026-11-18', '*'),
      row('refs/heads/fresh', 'b', '', '2026-11-15', ''),
      row('refs/heads/synced', 'c', 'origin/synced', '2026-09-01', ''),
      row('refs/heads/pushed', 'd', '', '2026-08-01', ''),
      row('refs/heads/gone', 'e', '', '2026-03-01', ''),
      row('refs/remotes/origin/main', 'a', '', '2026-11-18', ''),
      row('refs/remotes/origin/synced', 'c', '', '2026-09-01', ''),
      row('refs/remotes/origin/pushed', 'd', '', '2026-08-01', ''),
      row('refs/remotes/origin/theirs', 'f', '', '2026-11-10', ''),
    ].join('\n'),
  )
  const counts = new Map([['refs/heads/fresh', { ahead: 2, behind: 0 }]])
  const branches = buildBranches({ refs, counts, defaultName: 'main', base: 'origin/main', today: '2026-11-19' })
  expect(branches.map(b => `${b.name}:${b.group}`)).toEqual([
    'main:active',
    'fresh:active',
    'origin/theirs:remote',
    'synced:tracked',
    'pushed:tracked', // no upstream set, but origin/pushed exists
    'gone:old',
  ])
})

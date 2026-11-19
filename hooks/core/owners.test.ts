import { expect, test } from 'claude-code/testing'

import type { Commit } from '../../types'
import { layoutGraph, tipOf } from './layout'
import { assignOwners, branchNames, edgeOwner } from './owners'

const c = (id: string, parents: string, subject: string, refs = ''): Commit => ({
  id,
  parents: parents.split(' ').filter(Boolean),
  date: '2026-11-01',
  author: 'T',
  refs: refs.split(', ').filter(Boolean),
  subject,
})

// The history from the layout test.
const FIXTURE: Commit[] = [
  c('a279873', '8063846', 'B3', 'feat-b, origin/feat-b'),
  c('8063846', '94a51e5 4934788', 'Merge main into feat-b'),
  c('4934788', '912ce36', 'M4', 'HEAD -> main, origin/main'),
  c('c7acc3e', '94a51e5', 'C1', 'feat-c'),
  c('94a51e5', '81d8c29', 'B2'),
  c('912ce36', '61fba08 c3297e0', 'Merge feat-a'),
  c('81d8c29', '61fba08', 'B1'),
  c('61fba08', 'edb90a5', 'M3'),
  c('c3297e0', 'a58606d', 'A2', 'feat-a'),
  c('a58606d', 'edb90a5', 'A1'),
  c('edb90a5', '2042d7a', 'M2'),
  c('2042d7a', '', 'M1'),
]

test('each commit belongs to one branch, the base first', () => {
  const { owners, ownerOf } = assignOwners(FIXTURE, 'origin/main')
  const byOwner = (name: string) => FIXTURE.filter(commit => owners[ownerOf.get(commit.id)!]!.name === name).map(commit => commit.subject)

  expect(owners.map(owner => `${owner.name}:${owner.color}`)).toEqual(['main:0', 'feat-b:1', 'feat-c:2', 'feat-a:3'])
  expect(byOwner('main')).toEqual(['M4', 'Merge feat-a', 'M3', 'M2', 'M1'])
  expect(byOwner('feat-b')).toEqual(['B3', 'Merge main into feat-b', 'B2', 'B1'])
  expect(byOwner('feat-c')).toEqual(['C1'])
  expect(byOwner('feat-a')).toEqual(['A2', 'A1'])
  // Where each starts: the oldest commit of its own.
  expect(owners.map(owner => FIXTURE.find(commit => commit.id === owner.start)!.subject)).toEqual(['M1', 'B1', 'C1', 'A1'])
})

test('a first-parent edge is its branch line; a merge edge belongs to what it brings in', () => {
  const owners = assignOwners(FIXTURE, 'origin/main')
  const layout = layoutGraph(FIXTURE, tipOf(FIXTURE, 'origin/main'))
  const ids = layout.rows.map(row => ({ id: FIXTURE[row.row]!.id }))
  const name = (from: number, isMerge: boolean) =>
    owners.owners[edgeOwner(layout.edges.find(edge => edge.from === from && edge.isMerge === isMerge)!, ids, owners)!]!.name

  expect(name(1, false)).toBe('feat-b') // Merge main into feat-b → B2
  expect(name(1, true)).toBe('main') // … ← M4 (main merged into feat-b)
  expect(name(5, true)).toBe('feat-a') // Merge feat-a ← A2
  expect(name(9, false)).toBe('feat-a') // A1 → M2: feat-a's line until it joins main
})

test('a merged and deleted branch is named from its merge commit', () => {
  const commits = [
    c('m2', 'm1 x2', "Merge branch 'old-x' into main", 'HEAD -> main'),
    c('x2', 'x1', 'X2'),
    c('x1', 'm1', 'X1'),
    c('m1', '', 'M1'),
  ]
  const { owners, ownerOf } = assignOwners(commits, 'main')
  expect(owners.map(owner => `${owner.name}${owner.isMerged ? ' (merged)' : ''}`)).toEqual(['main', 'old-x (merged)'])
  expect(owners[ownerOf.get('x1')!]!.name).toBe('old-x')
})

test('decorations give branch names, not tags or HEAD', () => {
  expect(branchNames(['HEAD -> main', 'origin/main', 'origin/HEAD', 'tag: v1', 'feat'])).toEqual(['main', 'origin/main', 'feat'])
})

test('commits only a tag keeps are named after the tag; what they merge in, after the pull request', () => {
  // The rig-dashboard case: test builds tagged on merges of main and #726, on no branch.
  const commits = [
    c('m3', 'm2', 'M3', 'HEAD -> main, origin/main'),
    c('rc2', 'm2 pr', 'chore(rc): main with #726 for the G14 test (rc.2)', 'tag: v1.54.0-rc.2'),
    c('m2', 'm1', 'M2'),
    c('rc1', 'm1 pr', 'chore(rc): main with #726 for the G14 test', 'tag: v1.54.0-rc.1'),
    c('pr', 'm1', 'fix(control): write the lighting again'),
    c('m1', '', 'M1'),
  ]
  const { owners, ownerOf } = assignOwners(commits, 'main')
  const nameOf = (id: string) => {
    const owner = owners[ownerOf.get(id)!]!
    return `${owner.name}${owner.isTagOnly ? ' (tag only)' : owner.isMerged ? ' (merged)' : ''}`
  }
  expect(['m3', 'rc2', 'rc1', 'pr', 'm1'].map(nameOf)).toEqual([
    'main',
    'v1.54.0-rc.2 (tag only)',
    'v1.54.0-rc.1 (tag only)',
    '#726 (merged)',
    'main',
  ])
})

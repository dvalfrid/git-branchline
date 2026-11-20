import { expect, test } from 'claude-code/testing'

import type { Branch, Snapshot } from '../../types'
import { bandStatus } from './table'

const branch = (name: string, extra: Partial<Branch>): Branch => ({
  name, kind: 'local', sha: 'a1', date: '2026-11-19', status: 'open', isHead: false, hasRemote: false, group: 'active', ...extra,
})
const shot = (branches: Branch[], head = 'main'): Extract<Snapshot, { state: 'ok' }> => ({
  state: 'ok', root: 'D:/demo', base: 'origin/main', head, branches, tags: [], commits: [], readAt: '12:00',
})

test('the band names the checked-out branch and how it stands against the base', () => {
  expect(bandStatus(shot([branch('main', { status: 'base', isHead: true })]))).toBe('main')
  expect(bandStatus(shot([branch('feature/x', { isHead: true, ahead: 2, behind: 1 })]))).toBe('feature/x · 2 ahead, 1 behind origin/main')
  expect(bandStatus(shot([branch('fix', { isHead: true, ahead: 3, behind: 0 })]))).toBe('fix · 3 ahead origin/main')
  expect(bandStatus(shot([branch('same', { isHead: true, ahead: 0, behind: 0 })]))).toBe('same · even with origin/main')
  expect(bandStatus(shot([], 'abc1234'))).toBe('HEAD abc1234')
})
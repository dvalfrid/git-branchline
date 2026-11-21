import { expect, test } from 'claude-code/testing'

// The test kit runs without the DOM or Node's globals.
declare const setTimeout: (callback: (value?: unknown) => void, ms: number) => unknown

import { createWatcher, runsGit } from './watch'

test('reloads only when the signature changes, unless forced', async () => {
  let sig = 'a'
  let reloads = 0
  const watcher = createWatcher(async () => sig, async () => void reloads++)

  await watcher.check()
  expect(reloads).toBe(1) // the first look always reads
  await watcher.check()
  expect(reloads).toBe(1)
  await watcher.check(true)
  expect(reloads).toBe(2)
  sig = 'b'
  await watcher.check()
  expect(reloads).toBe(3)
})

test('a check during a reload runs once more afterwards', async () => {
  let sig = 'a'
  let reloads = 0
  let release: () => void = () => {}
  const watcher = createWatcher(
    async () => sig,
    () =>
      new Promise<void>(resolve => {
        reloads++
        release = resolve
      }),
  )

  const first = watcher.check()
  await Promise.resolve()
  sig = 'b'
  const second = watcher.check()
  const third = watcher.check()
  release()
  await new Promise(resolve => setTimeout(resolve, 0))
  release()
  await Promise.all([first, second, third])
  expect(reloads).toBe(2) // the queued checks collapse into one
})

test('commands that run git are recognised', () => {
  for (const command of ['git commit -m x', 'cd repo && git pull', 'npm test; git status', 'git.exe fetch', '(git log)']) {
    expect(runsGit(command)).toBe(true)
  }
  for (const command of ['ls', 'cat .gitignore', 'echo digit', 'gh pr list', 'git-branchline']) {
    expect(runsGit(command)).toBe(false)
  }
})

test('a failed read does not escape, and the next check reads again', async () => {
  let fail = true
  let reloads = 0
  const watcher = createWatcher(
    async () => 'same',
    async () => {
      reloads++
      if (fail) throw new Error('git timed out')
    },
  )
  await watcher.check()
  fail = false
  await watcher.check()
  expect(reloads).toBe(2)
})
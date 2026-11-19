// Decides when to read the repo again. Pure apart from the two functions it
// is given, so it can be tested without `$`.

export type Watcher = {
  /**
   * Reads the signature and reloads when it changed (or always when forced).
   * Calls made while one runs wait for it and then run once more, so the
   * last change is never missed.
   */
  check: (force?: boolean) => Promise<void>
}

export const createWatcher = (signature: () => Promise<string>, reload: () => Promise<void>): Watcher => {
  let last: string | undefined
  let running: Promise<void> | undefined
  let again: { force: boolean } | undefined

  const run = async (force: boolean): Promise<void> => {
    const now = await signature()
    if (!force && now === last) return
    last = now
    await reload()
  }

  const check = async (force = false): Promise<void> => {
    if (running) {
      again = { force: force || (again?.force ?? false) }
      return running
    }
    running = (async () => {
      try {
        await run(force)
        while (again) {
          const next = again
          again = undefined
          await run(next.force)
        }
      } finally {
        running = undefined
      }
    })()
    return running
  }

  return { check }
}

/** True when a shell command runs git (and so may have changed the repo). */
export const runsGit = (command: string): boolean => /(^|[\s;&|(])git(\.exe)?(\s|$)/.test(command)

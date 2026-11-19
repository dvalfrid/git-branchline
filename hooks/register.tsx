import type { Register } from 'claude-code'

const PANE = 'branchline'
const TITLE = 'Branchline'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'branchline',
      description: "Show the Git history of this session's repo in a pane",
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'branchline' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Branchline pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text bold>Branchline</Text>
        <Text dimColor>The Git graph will appear here.</Text>
      </Box>
    )
  })
}

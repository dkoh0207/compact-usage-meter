import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-07T12:00:00Z')

const HINT = {
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '(shift+tab to cycle) · ← for agents' },
} as const

const USAGE = {
  startedAt: 0,
  context: { tokens: 26_000, window: 200_000, percent: 13 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 10, resetsAt: '2026-10-07T16:15:00Z' },
    { kind: 'seven_day', percentUsed: 91, resetsAt: '2026-10-12T12:00:00Z' },
  ],
}

// Stands in for the engine: its hint line, its usage figures, its clock.
const engine = (on: On) => {
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: USAGE }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`⏵⏵ auto mode on ${e.props.hint}`}</Text>
  })
}

test('leaves the engine hint alone before any reading', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'compact-usage-meter', surface: 'terminal', ...HINT })

  expect(await ui.find({ text: /auto mode on/ })).toBeDefined()
  expect(await ui.find({ text: /context/ })).toBe(undefined)
  await ui.unmount()
})

test('adds the meter under the engine hint once usage is read', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const viewport = { columns: 200, rows: 40 }
  const ui = await $.ui.mount({ plugin: 'compact-usage-meter', surface: 'terminal', viewport, ...HINT })

  expect(await ui.find({ text: /auto mode on/ })).toBeDefined()
  expect((await ui.find({ text: /session-usage/ }))?.text).toBe(
    '⏵⏵ auto mode on (shift+tab to cycle) · ← for agentscontext ▰▱▱▱▱▱▱▱ 13% │ session-usage ▰▱▱▱▱▱▱▱ 10% (4h15m) │ weekly-usage ▰▰▰▰▰▰▰▱ 91% (5d00h)',
  )
  await ui.unmount()
})

test('drops to the shorter forms on a narrow terminal', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const viewport = { columns: 70, rows: 40 }
  const ui = await $.ui.mount({ plugin: 'compact-usage-meter', surface: 'terminal', viewport, ...HINT })

  expect(await ui.find({ text: /▰|▱/ })).toBe(undefined)
  expect(await ui.find({ text: /context/ })).toBeDefined()
  await ui.unmount()
})

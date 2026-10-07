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
  cost: { usd: 1.234 },
}

// Stands in for the engine: its hint line, its usage figures, its model, its clock.
const engine = (on: On, model = { id: 'claude-sonnet-5-5' }) => {
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: USAGE }))
  on('session.model', () => ({ value: model.id }))
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
  expect((await ui.find({ text: /session/ }))?.text).toBe(
    '⏵⏵ auto mode on (shift+tab to cycle) · ← for agentsSonnet 5.5 │ context ▰▱▱▱▱▱▱▱  13% │ session ▰▱▱▱▱▱▱▱  10% (4h15m) │ weekly ▰▰▰▰▰▰▰▱  91% (5d00h)',
  )
  await ui.unmount()
})

test('adds the effort of the latest main-loop request to the model', async ($, on) => {
  engine(on)
  // Nothing beneath the plugin streams a response; the step ends at once.
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const step = { turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 }

  await $.turn.step({ ...step, effort: 'xhigh' }).next()
  await $.turn.step({ ...step, effort: 'low', agentId: 'subagent' }).next()

  const viewport = { columns: 200, rows: 40 }
  const ui = await $.ui.mount({ plugin: 'compact-usage-meter', surface: 'terminal', viewport, ...HINT })

  expect(await ui.find({ text: /Sonnet 5\.5 \(xhigh\) │ context/ })).toBeDefined()
  await ui.unmount()
})

test('drops to the shorter forms on a narrow terminal', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const viewport = { columns: 70, rows: 40 }
  const ui = await $.ui.mount({ plugin: 'compact-usage-meter', surface: 'terminal', viewport, ...HINT })

  expect(await ui.find({ text: /▰|▱/ })).toBe(undefined)
  expect(await ui.find({ text: /Sonnet/ })).toBe(undefined)
  expect(await ui.find({ text: /context/ })).toBeDefined()
  await ui.unmount()
})

test('follows a model switch before the next reading', async ($, on) => {
  const model = { id: 'claude-sonnet-5-5' }
  engine(on, model)
  on('classic.PostModelSwitch', () => ({}))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const viewport = { columns: 200, rows: 40 }
  const ui = await $.ui.mount({ plugin: 'compact-usage-meter', surface: 'terminal', viewport, ...HINT })

  expect(await ui.find({ text: /Sonnet 5\.5/ })).toBeDefined()

  model.id = 'claude-opus-5-5'
  await $.classic.PostModelSwitch({
    from_model: 'claude-sonnet-5-5',
    to_model: 'claude-opus-5-5',
    requested_model: 'opus',
    source: 'command',
    context_tokens: 0,
    prompt_cache_warm: false,
    cache_ttl: '5m',
    estimated_cache_write_usd: 0,
    pricing: 'catalog',
  })

  expect(await ui.find({ text: /Opus 5\.5 │ context/ })).toBeDefined()
  await ui.unmount()
})

test('shows an effort set with /effort before the next request', async ($, on) => {
  engine(on)
  on('command.run', { command: 'effort' }, () => ({ text: 'Set effort level' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  await $.command.run({ command: 'effort', args: 'max' })
  await $.command.run({ command: 'effort', args: '' })

  const viewport = { columns: 200, rows: 40 }
  const ui = await $.ui.mount({ plugin: 'compact-usage-meter', surface: 'terminal', viewport, ...HINT })

  expect(await ui.find({ text: /Sonnet 5\.5 \(max\)/ })).toBeDefined()
  await ui.unmount()
})

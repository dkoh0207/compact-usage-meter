import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import { fitParts, room, SEPARATOR } from './format'
import type { Level, Part } from './format'
import type { Reading } from '../types'

const reading = atom({ plugin: 'compact-usage-meter', key: 'reading' } as const, null)

const THRESHOLDS = [95, 80]

// Blank rows between the engine's hint line and the meter.
const GAP = 1

const NAMES: Record<string, string> = {
  five_hour: 'Session usage',
  seven_day: 'Weekly usage',
}

// Each meter's own hue, from the theme so it suits light and dark.
const HUES: Record<string, Color> = {
  context: 'suggestion',
  'session-usage': 'planMode',
  'weekly-usage': 'merged',
}

// The percentage leaves the meter's hue only to warn.
const WARNINGS: Record<Level, Color | undefined> = {
  low: undefined,
  mid: 'warning',
  high: 'error',
}

type Figures = Omit<Reading, 'nowMs'>

let tick: Timer | undefined
const warned = new Set<string>()

function toFigures(usage: { context: { percent?: number }; rateLimits: SessionRateLimit[] }): Figures {
  return { contextPercent: usage.context.percent, rateLimits: usage.rateLimits }
}

async function record($: EngineInterface, figures?: Figures) {
  const latest = figures ?? toFigures(await $.session.usage())
  const nowMs = await $.clock.now()
  await update($, reading, () => ({ ...latest, nowMs }))
}

// One toast per window per threshold; re-armed once usage drops below it.
function warn($: EngineInterface, limits: SessionRateLimit[]) {
  for (const { kind, percentUsed } of limits) {
    const name = NAMES[kind]

    if (name === undefined) {
      continue
    }

    for (const threshold of THRESHOLDS) {
      if (percentUsed < threshold) {
        warned.delete(`${kind}@${threshold}`)
      }
    }

    const crossed = THRESHOLDS.find(t => percentUsed >= t)

    if (crossed !== undefined && !warned.has(`${kind}@${crossed}`)) {
      THRESHOLDS.filter(t => t <= crossed).forEach(t => warned.add(`${kind}@${t}`))
      $.ui.toast(`${name} at ${percentUsed}%`)
    }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // v0.1 pinned a status line; take it down.
    $.ui.status(undefined)
    tick?.cancel()
    tick = $.clock.every(60_000, () => void record($))
    await record($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await record($, toFigures(e))
    warn($, e.rateLimits)

    return next(e)
  })

  // A row of its own, under the engine's hint line ("⏵⏵ auto mode on …").
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const engine = await next(e)
    const current = await read($, reading)
    const parts = current === null ? undefined : fitParts(current, room(e.viewport?.columns ?? 80))

    if (parts === undefined) {
      return engine
    }

    const { Box, Text } = $.ui.resolve(e)
    const drawPart = (part: Part, index: number) => {
      const hue = HUES[part.label]

      return (
        <Text key={`part-${index}`} wrap="truncate">
          {index > 0 ? <Text dimColor>{SEPARATOR}</Text> : null}
          <Text color={hue}>{part.label} </Text>
          {part.bar === undefined ? null : <Text color={hue}>{part.bar} </Text>}
          <Text color={WARNINGS[part.level] ?? hue} bold={part.level !== 'low'}>{part.pct}</Text>
          {part.reset === undefined ? null : <Text dimColor> {part.reset}</Text>}
        </Text>
      )
    }

    // The terminal draws the engine's line ahead of anything else in the tree,
    // whatever its place, so the meter goes under it, GAP blank rows between.
    return (
      <Box flexDirection="column">
        {engine}
        <Box flexDirection="row" marginTop={GAP}>{parts.map(drawPart)}</Box>
      </Box>
    )
  })
}

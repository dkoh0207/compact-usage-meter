import { atom, read, update } from 'claude-code'
import type {
  Color,
  EngineInterface,
  Register,
  SessionCost,
  SessionRateLimit,
  Timer,
} from 'claude-code'

import { BAR_GAP, fitParts, room, SEPARATOR } from './format'
import type { Level, Part } from './format'
import type { Reading } from '../types'

const reading = atom({ plugin: 'compact-usage-meter', key: 'reading' } as const, null)

const THRESHOLDS = [95, 80]

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

// Blank rows between the engine's hint line and the meter.
const GAP = 1

const NAMES: Record<string, string> = {
  five_hour: 'Session usage',
  seven_day: 'Weekly usage',
}

// Each meter's own hue, from the theme so it suits light and dark.
const HUES: Record<string, Color> = {
  context: 'suggestion',
  session: 'planMode',
  weekly: 'merged',
}

// The percentage leaves the meter's hue only to warn.
const WARNINGS: Record<Level, Color | undefined> = {
  low: undefined,
  mid: 'warning',
  high: 'error',
}

// What a usage reading carries; the model is read at draw time, the effort from turn.step.
type Figures = Omit<Reading, 'nowMs' | 'model' | 'effort'>

let tick: Timer | undefined
const warned = new Set<string>()

function toFigures(usage: {
  context: { percent?: number }
  rateLimits: SessionRateLimit[]
  cost?: SessionCost
}): Figures {
  return {
    contextPercent: usage.context.percent,
    rateLimits: usage.rateLimits,
    cost: usage.cost?.usd,
  }
}

async function record($: EngineInterface, figures?: Figures) {
  const latest = figures ?? toFigures(await $.session.usage())
  const nowMs = await $.clock.now()
  await update($, reading, previous => ({ ...latest, effort: previous?.effort, nowMs }))
}

// The effort of the latest main-loop request; kept across readings until the next one.
async function noteEffort($: EngineInterface, effort: string | number | undefined) {
  const label = effort === undefined ? undefined : String(effort)
  await update($, reading, previous =>
    previous === null ? previous : { ...previous, effort: label },
  )
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

  // Effort rides on each model request. Subagents have their own; the stream passes untouched.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await noteEffort($, e.effort)
    }

    return yield* next(e)
  })

  // A switch from anywhere (/model, its picker, /config, a fallback) redraws now, not at the
  // next reading; the drawing reads the model itself.
  on('classic.PostModelSwitch', async ($, e, next) => {
    await record($)

    return next(e)
  })

  // `/effort <level>` shows at once. Its picker passes no level, so that one waits for the
  // next request.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    const level = e.args.trim().toLowerCase()

    if (EFFORTS.has(level)) {
      await noteEffort($, level)
    }

    return result
  })

  // A row of its own, under the engine's hint line ("⏵⏵ auto mode on …").
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const engine = await next(e)
    const current = await read($, reading)
    // Read per draw, so a /model switch shows at the next redraw, not the next reading.
    const model = current === null ? undefined : await $.session.model()
    const columns = e.viewport?.columns ?? 80
    const parts = current === null ? undefined : fitParts({ ...current, model }, room(columns))

    if (parts === undefined) {
      return engine
    }

    const { Box, Text } = $.ui.resolve(e)
    const drawPart = (part: Part, index: number) => {
      const hue = HUES[part.label]
      const separator = index > 0 ? <Text dimColor>{SEPARATOR}</Text> : null

      // The info part is plain text: no hue, bar or percentage.
      if (part.pct === undefined) {
        return (
          <Text key={`part-${index}`} wrap="truncate">
            {separator}
            <Text dimColor>{part.label}</Text>
          </Text>
        )
      }

      return (
        <Text key={`part-${index}`} wrap="truncate">
          {separator}
          <Text color={hue}>{part.label} </Text>
          {part.bar === undefined ? null : <Text color={hue}>{part.bar}{BAR_GAP} </Text>}
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

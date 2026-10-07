import type { Reading } from '../types'

// The hint line's left gutter, and one cell kept free at the right edge.
const GUTTER = 2
const EDGE = 1
// 'ascii' draws bars as #/- for terminals that render ▰▱ double-width.
export const GLYPHS: Glyphs = 'blocks'
// Cells per ▰/▱; set 2 where an East-Asian locale draws ambiguous glyphs wide.
export const AMBIGUOUS_WIDTH = 1

export const SEPARATOR = ' │ '

export type Glyphs = 'blocks' | 'ascii'
export type Level = 'low' | 'mid' | 'high'

export type Part = {
  label: string
  bar?: string
  pct: string
  reset?: string
  level: Level
}

export type FitOptions = {
  glyphs?: Glyphs
  ambiguousWidth?: number
}

type Tier = { barCells: number; hasResets: boolean; hasLimits: boolean }

// Richest first; the first that fits the room is drawn.
const TIERS: Tier[] = [
  { barCells: 8, hasResets: true, hasLimits: true },
  { barCells: 4, hasResets: true, hasLimits: true },
  { barCells: 0, hasResets: true, hasLimits: true },
  { barCells: 0, hasResets: false, hasLimits: true },
  { barCells: 0, hasResets: false, hasLimits: false },
]

const LIMITS = [
  { kind: 'five_hour', label: 'session-usage' },
  { kind: 'seven_day', label: 'weekly-usage' },
] as const

const BAR = {
  blocks: { full: '▰', empty: '▱' },
  ascii: { full: '#', empty: '-' },
} as const

const AMBIGUOUS = new Set(['▰', '▱'])

export const cellWidth = (text: string, ambiguousWidth = AMBIGUOUS_WIDTH) => {
  let cells = 0

  for (const char of text) {
    cells += AMBIGUOUS.has(char) ? ambiguousWidth : 1
  }

  return cells
}

const clamp = (n: number, low: number, high: number) =>
  Math.min(high, Math.max(low, n))

export const level = (pct: number | undefined): Level =>
  pct === undefined || pct < 50 ? 'low' : pct <= 80 ? 'mid' : 'high'

export const bar = (pct: number | undefined, cells: number, glyphs: Glyphs = GLYPHS) => {
  const filled = pct === undefined ? 0 : Math.round((clamp(pct, 0, 100) / 100) * cells)
  const { full, empty } = BAR[glyphs]

  return full.repeat(filled) + empty.repeat(cells - filled)
}

// Unpadded, so no gap opens between the bar and the number: '--%', '6%', '13%', '100%'.
export const pctText = (pct: number | undefined) =>
  pct === undefined
    ? '--%'
    : `${String(clamp(Math.round(pct), 0, 999))}%`

// '45m', '3h12m', '14h', '2d05h', 'now', '--'.
export const countdown = (resetsAt: string | undefined, nowMs: number) => {
  const at = resetsAt === undefined ? NaN : Date.parse(resetsAt)

  if (Number.isNaN(at)) {
    return '--'
  }

  const minutes = Math.ceil((at - nowMs) / 60_000)

  if (minutes <= 0) {
    return 'now'
  }

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 10) {
    return `${hours}h${String(minutes % 60).padStart(2, '0')}m`
  }

  if (hours < 24) {
    return `${hours}h`
  }

  const days = Math.floor(hours / 24)

  return days < 10
    ? `${days}d${String(hours % 24).padStart(2, '0')}h`
    : `${days}d`
}

const part = (
  label: string,
  pct: number | undefined,
  tier: Tier,
  glyphs: Glyphs,
  reset?: string,
): Part => ({
  label,
  bar: tier.barCells > 0 ? bar(pct, tier.barCells, glyphs) : undefined,
  pct: pctText(pct),
  reset: reset === undefined ? undefined : `(${reset})`,
  level: level(pct),
})

export const segments = (reading: Reading, tier: Tier, glyphs: Glyphs = GLYPHS) => {
  const parts = [part('context', reading.contextPercent, tier, glyphs)]

  if (!tier.hasLimits) {
    return parts
  }

  for (const { kind, label } of LIMITS) {
    const limit = reading.rateLimits.find(r => r.kind === kind)

    if (limit !== undefined) {
      const reset = tier.hasResets ? countdown(limit.resetsAt, reading.nowMs) : undefined
      parts.push(part(label, limit.percentUsed, tier, glyphs, reset))
    }
  }

  return parts
}

// One part as drawn: the register's tree puts exactly these spaces between its Texts.
export const partText = ({ label, bar, pct, reset }: Part) =>
  [label, bar, pct, reset].filter(piece => piece !== undefined).join(' ')

export const plainText = (parts: Part[]) => parts.map(partText).join(SEPARATOR)

// Cells for the meter on its own row, `columns` being the conversation column's width.
export const room = (columns: number) => columns - GUTTER - EDGE

// The richest parts that fit `roomCells`, or undefined when none do.
export const fitParts = (reading: Reading, roomCells: number, options: FitOptions = {}) => {
  const { glyphs = GLYPHS, ambiguousWidth = AMBIGUOUS_WIDTH } = options

  for (const tier of TIERS) {
    const parts = segments(reading, tier, glyphs)

    if (cellWidth(plainText(parts), ambiguousWidth) <= roomCells) {
      return parts
    }
  }

  return undefined
}

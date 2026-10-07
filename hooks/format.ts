import type { Reading } from '../types'

// The hint line's left gutter, and one cell kept free at the right edge.
const GUTTER = 2
const EDGE = 1
// 'ascii' draws bars as #/- for terminals that render ▰▱ double-width.
export const GLYPHS: Glyphs = 'blocks'
// Cells per ▰/▱; set 2 where an East-Asian locale draws ambiguous glyphs wide.
export const AMBIGUOUS_WIDTH = 1

// 'bar' puts │ between the meters, 'dot' puts · there; both take one cell.
export const DIVIDER: Divider = 'bar'
export const DIVIDERS = { bar: '│', dot: '·' } as const

export const SEPARATOR = ` ${DIVIDERS[DIVIDER]} `
const INFO_SEPARATOR = ' · '

export type Divider = keyof typeof DIVIDERS
export type Glyphs = 'blocks' | 'ascii'
export type Level = 'low' | 'mid' | 'high'

// The info part (model, effort, cost) is label-only: no bar, no percentage.
export type Part = {
  label: string
  bar?: string
  pct?: string
  reset?: string
  level: Level
}

export type FitOptions = {
  glyphs?: Glyphs
  ambiguousWidth?: number
}

type Tier = { barCells: number; hasResets: boolean; hasLimits: boolean; hasInfo: boolean }

// Richest first; the first that fits the room is drawn. Only the richest carries
// the info part, so it is the first thing to go when the room narrows.
const TIERS: Tier[] = [
  { barCells: 8, hasResets: true, hasLimits: true, hasInfo: true },
  { barCells: 8, hasResets: true, hasLimits: true, hasInfo: false },
  { barCells: 4, hasResets: true, hasLimits: true, hasInfo: false },
  { barCells: 0, hasResets: true, hasLimits: true, hasInfo: false },
  { barCells: 0, hasResets: false, hasLimits: true, hasInfo: false },
  { barCells: 0, hasResets: false, hasLimits: false, hasInfo: false },
]

const LIMITS = [
  { kind: 'five_hour', label: 'session' },
  { kind: 'seven_day', label: 'weekly' },
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

const title = (family: string, major?: string, minor?: string) => {
  const name = family.charAt(0).toUpperCase() + family.slice(1)

  return major === undefined ? name : `${name} ${major}${minor === undefined ? '' : `.${minor}`}`
}

// 'claude-sonnet-5-5' -> 'Sonnet 5.5', 'claude-haiku-4-5-20251001' -> 'Haiku 4.5',
// 'claude-3-5-sonnet-20241022' -> 'Sonnet 3.5', 'opus[1m]' -> 'Opus'; anything else as given.
export const modelName = (id: string) => {
  const bare = id.replace(/\[[^\]]*\]$/, '')
  const named = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(bare)
  const numbered = /^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)(?:-\d{8})?$/.exec(bare)

  if (named !== null) {
    return title(named[1], named[2], named[3])
  }

  if (numbered !== null) {
    return title(numbered[3], numbered[1], numbered[2])
  }

  return /^[a-z]+$/.test(bare) ? title(bare) : bare
}

// '$0.00', '$1.23', '$142.50'.
export const costText = (usd: number) => `$${usd.toFixed(2)}`

// Only a subscription reports 5-hour and 7-day windows; its cost is a list-price estimate,
// not a bill, so it is left out. Nothing spent yet shows nothing either way.
const isBilled = ({ rateLimits, cost }: Reading) =>
  cost !== undefined && cost > 0 && !rateLimits.some(r => LIMITS.some(l => l.kind === r.kind))

const info = (reading: Reading): Part | undefined => {
  const { model, effort, cost = 0 } = reading

  return model === undefined
    ? undefined
    : {
        label: [
          `${modelName(model)}${effort === undefined ? '' : ` (${effort})`}`,
          isBilled(reading) ? costText(cost) : undefined,
        ]
          .filter(piece => piece !== undefined)
          .join(INFO_SEPARATOR),
        level: 'low',
      }
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
  const lead = tier.hasInfo ? info(reading) : undefined
  const parts: Part[] = lead === undefined ? [] : [lead]

  parts.push(part('context', reading.contextPercent, tier, glyphs))

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

// One space beyond the usual, after a bar, so the number does not crowd the glyphs.
export const BAR_GAP = ' '

// One part as drawn: the register's tree puts exactly these spaces between its Texts.
export const partText = ({ label, bar, pct, reset }: Part) =>
  [label, bar === undefined ? undefined : `${bar}${BAR_GAP}`, pct, reset]
    .filter(piece => piece !== undefined)
    .join(' ')

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

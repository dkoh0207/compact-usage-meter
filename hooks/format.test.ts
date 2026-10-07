import { expect, test } from 'claude-code/testing'

import { cellWidth, countdown, fitParts, level, pctText, plainText, room } from './format'
import type { Reading } from '../types'

const NOW = Date.parse('2026-10-07T12:00:00Z')
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()

const reading = (context?: number, session = 10, weekly = 6): Reading => ({
  contextPercent: context,
  nowMs: NOW,
  rateLimits: [
    { kind: 'five_hour', percentUsed: session, resetsAt: at(255) },
    { kind: 'seven_day', percentUsed: weekly, resetsAt: at(120 * 60) },
  ],
})

const fit = (cells: number, shown = reading(13)) => {
  const parts = fitParts(shown, cells)

  return parts === undefined ? undefined : plainText(parts)
}

test('draws every meter with full bars when there is room', () => {
  expect(fit(200)).toBe(
    'context ▰▱▱▱▱▱▱▱ 13% │ session-usage ▰▱▱▱▱▱▱▱ 10% (4h15m) │ weekly-usage ▱▱▱▱▱▱▱▱ 6% (5d00h)',
  )
})

test('steps down through the forms as the room shrinks', () => {
  const full = 'context ▰▱▱▱▱▱▱▱ 13% │ session-usage ▰▱▱▱▱▱▱▱ 10% (4h15m) │ weekly-usage ▱▱▱▱▱▱▱▱ 6% (5d00h)'
  const short = 'context ▰▱▱▱ 13% │ session-usage ▱▱▱▱ 10% (4h15m) │ weekly-usage ▱▱▱▱ 6% (5d00h)'
  const bare = 'context 13% │ session-usage 10% (4h15m) │ weekly-usage 6% (5d00h)'
  const noResets = 'context 13% │ session-usage 10% │ weekly-usage 6%'

  expect([fit(92), fit(91), fit(80), fit(79), fit(65), fit(64), fit(49), fit(48), fit(11), fit(10)]).toEqual([
    full, short, short, bare, bare, noResets, noResets, 'context 13%', 'context 13%', undefined,
  ])
})

test('never exceeds the room at any size', () => {
  for (const ambiguousWidth of [1, 2]) {
    for (let cells = 0; cells <= 200; cells += 1) {
      const parts = fitParts(reading(13), cells, { ambiguousWidth })

      if (parts !== undefined) {
        expect(cellWidth(plainText(parts), ambiguousWidth)).toBeLessThanOrEqual(cells)
      }
    }
  }
})

test('fits the room at every value and countdown', () => {
  for (const value of [0, 7, 62, 100]) {
    for (const minutes of [-5, 45, 192, 14 * 60, 53 * 60]) {
      const shown: Reading = {
        contextPercent: value,
        nowMs: NOW,
        rateLimits: [
          { kind: 'five_hour', percentUsed: value, resetsAt: at(minutes) },
          { kind: 'seven_day', percentUsed: value, resetsAt: at(minutes) },
        ],
      }

      for (const cells of [11, 49, 65, 80, 92]) {
        expect(cellWidth(fit(cells, shown) ?? '')).toBeLessThanOrEqual(cells)
      }
    }
  }
})

test('colors by level at the boundaries', () => {
  expect([level(undefined), level(49), level(50), level(80), level(81)]).toEqual([
    'low', 'low', 'mid', 'mid', 'high',
  ])
})

test('room is the row less its gutter and edge', () => {
  expect([room(179), room(80)]).toEqual([176, 77])
})

test('writes percentages and countdowns without padding', () => {
  expect([pctText(undefined), pctText(6), pctText(13), pctText(100)]).toEqual(['--%', '6%', '13%', '100%'])
  expect([
    countdown(at(-1), NOW),
    countdown(at(45), NOW),
    countdown(at(255), NOW),
    countdown(at(14 * 60), NOW),
    countdown(at(120 * 60), NOW),
    countdown(undefined, NOW),
  ]).toEqual(['now', '45m', '4h15m', '14h', '5d00h', '--'])
})

test('shows context alone before any rate-limit reading', () => {
  expect(fit(200, { nowMs: NOW, rateLimits: [] })).toBe('context ▱▱▱▱▱▱▱▱ --%')
})

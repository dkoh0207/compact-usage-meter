import { expect, test } from 'claude-code/testing'

import {
  cellWidth,
  costText,
  countdown,
  DIVIDERS,
  fitParts,
  level,
  modelName,
  pctText,
  plainText,
  room,
} from './format'
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

const FULL = 'context ▰▱▱▱▱▱▱▱  13% │ session ▰▱▱▱▱▱▱▱  10% (4h15m) │ weekly ▱▱▱▱▱▱▱▱  6% (5d00h)'
const SHORT = 'context ▰▱▱▱  13% │ session ▱▱▱▱  10% (4h15m) │ weekly ▱▱▱▱  6% (5d00h)'
const BARE = 'context 13% │ session 10% (4h15m) │ weekly 6% (5d00h)'
const NO_RESETS = 'context 13% │ session 10% │ weekly 6%'

const INFO = 'Sonnet 5.5 (xhigh)'
const informed = (): Reading => ({
  ...reading(13),
  model: 'claude-sonnet-5-5',
  effort: 'xhigh',
  cost: 1.234,
})

test('draws every meter with full bars when there is room', () => {
  expect(fit(200)).toBe(FULL)
})

test('steps down through the forms as the room shrinks', () => {
  expect([fit(83), fit(82), fit(71), fit(70), fit(53), fit(52), fit(37), fit(36), fit(11), fit(10)]).toEqual([
    FULL, SHORT, SHORT, BARE, BARE, NO_RESETS, NO_RESETS, 'context 13%', 'context 13%', undefined,
  ])
})

test('leads with model and effort when there is room', () => {
  expect(fit(200, informed())).toBe(`${INFO} │ ${FULL}`)
})

test('drops the model line before any meter shrinks', () => {
  const shown = informed()

  expect([fit(104, shown), fit(103, shown), fit(83, shown), fit(82, shown)]).toEqual([
    `${INFO} │ ${FULL}`, FULL, FULL, SHORT,
  ])
})

test('shows cost only where it is billed: off a subscription, once spent', () => {
  const api: Reading = { contextPercent: 13, nowMs: NOW, rateLimits: [], model: 'claude-sonnet-5-5' }

  expect([
    fit(200, { ...api, cost: 1.234 }),
    fit(200, { ...api, cost: 0 }),
    fit(200, informed()),
  ]).toEqual([
    'Sonnet 5.5 · $1.23 │ context ▰▱▱▱▱▱▱▱  13%',
    'Sonnet 5.5 │ context ▰▱▱▱▱▱▱▱  13%',
    `${INFO} │ ${FULL}`,
  ])
})

test('shows what is known of the model line', () => {
  const known = reading(13)

  expect([
    fit(200, { ...known, model: 'opus' }),
    fit(200, { ...known, model: 'claude-haiku-4-5-20251001', effort: 'low' }),
    fit(200, { ...known, model: 'sonnet', cost: 0 }),
    fit(200, { ...known, effort: 'high', cost: 2 }),
  ]).toEqual([
    `Opus │ ${FULL}`,
    `Haiku 4.5 (low) │ ${FULL}`,
    `Sonnet │ ${FULL}`,
    FULL,
  ])
})

test('never exceeds the room at any size', () => {
  for (const shown of [reading(13), informed()]) {
    for (const ambiguousWidth of [1, 2]) {
      for (let cells = 0; cells <= 200; cells += 1) {
        const parts = fitParts(shown, cells, { ambiguousWidth })

        if (parts !== undefined) {
          expect(cellWidth(plainText(parts), ambiguousWidth)).toBeLessThanOrEqual(cells)
        }
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

      for (const cells of [11, 37, 53, 71, 83]) {
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

test('names models from ids and aliases', () => {
  expect([
    modelName('claude-sonnet-5-5'),
    modelName('claude-haiku-4-5-20251001'),
    modelName('claude-opus-4-20250514'),
    modelName('claude-3-5-sonnet-20241022'),
    modelName('claude-fable-5-1'),
    modelName('opus[1m]'),
    modelName('sonnet'),
    modelName('my-gateway/model'),
  ]).toEqual([
    'Sonnet 5.5', 'Haiku 4.5', 'Opus 4', 'Sonnet 3.5', 'Fable 5.1', 'Opus', 'Sonnet', 'my-gateway/model',
  ])
})

test('both dividers take the same room, so the tiers hold', () => {
  expect(cellWidth(DIVIDERS.bar)).toBe(cellWidth(DIVIDERS.dot))
})

test('writes cost in dollars and cents', () => {
  expect([costText(0), costText(1.234), costText(142.5)]).toEqual(['$0.00', '$1.23', '$142.50'])
})

test('shows context alone before any rate-limit reading', () => {
  expect(fit(200, { nowMs: NOW, rateLimits: [] })).toBe('context ▱▱▱▱▱▱▱▱  --%')
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filtersForPeriod } from '../src/filters.ts'
import { regions } from '../src/types/app.ts'

test('initial filters query the same inclusive 30 days shown in the panel', () => {
  const filters = filtersForPeriod(undefined, undefined, new Date(2026, 10, 14, 23, 30))
  assert.deepEqual(filters, { regions, startDate: '2026-10-16', endDate: '2026-11-14' })
})

test('preset periods preserve selected regions and span month/year boundaries', () => {
  const today = new Date(2026, 0, 3)
  assert.deepEqual(filtersForPeriod('7', ['África'], today), {
    regions: ['África'], startDate: '2025-12-28', endDate: '2026-01-03',
  })
  assert.equal(filtersForPeriod('90', [], today).startDate, '2025-10-06')
  assert.deepEqual(filtersForPeriod('30', [], today).regions, [])
  assert.equal(today.getDate(), 3)
})

test('periods follow local calendar dates, including leap years', () => {
  assert.equal(filtersForPeriod('7', regions, new Date(2024, 2, 1)).startDate, '2024-02-24')
  const selection = ['Europa']
  filtersForPeriod('7', selection).regions.push('Asia')
  assert.deepEqual(selection, ['Europa'])
})

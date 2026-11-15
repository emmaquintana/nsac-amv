import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTimeSeries } from '../src/components/timeSeriesData.ts'

const filters = { regions: ['Sudamérica', 'África'], startDate: '2026-01-01', endDate: '2026-01-05' }
const summary = {
  counts: [
    { day: '2026-01-02', continent: 'Sudamérica', count: 6000 },
    { day: '2026-01-02', continent: 'África', count: 2000 },
    { day: '2026-01-04', continent: 'África', count: 17 },
  ],
  total: 8017, unassigned: 0, first_day: '2026-01-02', last_day: '2026-01-04',
  observed_days: 2, available_days: ['2026-01-02', '2026-01-04'],
}

test('separates regions and keeps full daily totals beyond observation page sizes', () => {
  const result = buildTimeSeries(summary, filters)
  assert.equal(result.represented, 8017)
  assert.equal(result.maximum, 6000)
  assert.deepEqual(result.series, [
    { region: 'Sudamérica', counts: [null, 6000, null, 0, null] },
    { region: 'África', counts: [null, 2000, null, 17, null] },
  ])
})

test('keeps missing coverage distinct from a region with zero detections', () => {
  const result = buildTimeSeries(summary, filters)
  assert.equal(result.missingDays, 3)
  assert.equal(result.series[0].counts[2], null)
  assert.equal(result.series[0].counts[3], 0)
})

test('applies inclusive dates and selected regions', () => {
  const result = buildTimeSeries(summary, { ...filters, regions: ['África'], startDate: '2026-01-04', endDate: '2026-01-04' })
  assert.deepEqual(result.days, ['2026-01-04'])
  assert.deepEqual(result.series, [{ region: 'África', counts: [17] }])
  assert.equal(result.represented, 17)
})

test('uses available date range when no period is supplied', () => {
  const result = buildTimeSeries(summary, { ...filters, startDate: '', endDate: '' })
  assert.deepEqual(result.days, ['2026-01-02', '2026-01-03', '2026-01-04'])
})

test('does not invent zero counts while the complete summary is loading', () => {
  const result = buildTimeSeries(null, filters)
  assert.equal(result.represented, 0)
  assert.ok(result.series.every(({ counts }) => counts.every((count) => count === null)))
  assert.equal(buildTimeSeries(summary, { ...filters, regions: [] }).series.length, 0)
})

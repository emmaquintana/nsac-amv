import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mapQuery, normalizeViewport } from '../src/components/mapViewport.ts'
import { regions } from '../src/types/app.ts'

const viewport = { west: -180, east: 180, south: -85, north: 85, zoom: 2 }
const filters = { regions: [...regions], startDate: '2026-01-01', endDate: '2026-01-31' }

test('queries the viewport and full period without manual pagination', () => {
  const params = new URLSearchParams(mapQuery(filters, viewport))
  assert.equal(params.get('west'), '-180')
  assert.equal(params.get('east'), '180')
  assert.equal(params.get('zoom'), '2')
  assert.equal(params.get('start_date'), filters.startDate)
  assert.equal(params.get('end_date'), filters.endDate)
  assert.deepEqual(params.getAll('continent'), [])
  assert.equal(params.has('limit'), false)
  assert.equal(params.has('offset'), false)
})

test('passes all selected regions and updates spatial detail on zoom', () => {
  const params = new URLSearchParams(mapQuery({ ...filters, regions: ['Sudamérica', 'África'] },
    { ...viewport, west: -65, east: -60, zoom: 9 }))
  assert.deepEqual(params.getAll('continent'), ['Sudamérica', 'África'])
  assert.equal(params.get('west'), '-65')
  assert.equal(params.get('east'), '-60')
  assert.equal(params.get('zoom'), '9')
})

test('wraps world copies and preserves windows crossing the antimeridian', () => {
  assert.deepEqual(normalizeViewport({ ...viewport, west: 170, east: 190 }),
    { ...viewport, west: 170, east: -170 })
  assert.deepEqual(normalizeViewport({ ...viewport, west: -550, east: -530 }),
    { ...viewport, west: 170, east: -170 })
  assert.deepEqual(normalizeViewport({ ...viewport, west: 300, east: 320 }),
    { ...viewport, west: -60, east: -40 })
})

test('covers the full world on wide screens and clamps polar bounds', () => {
  assert.deepEqual(normalizeViewport({ west: -270, east: 270, south: -100, north: 100, zoom: 2 }),
    { west: -180, east: 180, south: -90, north: 90, zoom: 2 })
})

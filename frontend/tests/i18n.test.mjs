import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveLanguage, translate, translateRegion } from '../src/i18n.ts'
import { regions } from '../src/types/app.ts'

test('uses the first supported system language and falls back to English', () => {
  assert.equal(resolveLanguage(null, ['es-AR', 'en-US']), 'es')
  assert.equal(resolveLanguage(null, ['en-GB', 'es-ES']), 'en')
  assert.equal(resolveLanguage(null, ['fr-FR', 'ES_mx']), 'es')
  assert.equal(resolveLanguage(null, ['de-DE']), 'en')
  assert.equal(resolveLanguage(null, []), 'en')
})

test('an explicit preference overrides the system; invalid storage is ignored', () => {
  assert.equal(resolveLanguage('en', ['es-AR']), 'en')
  assert.equal(resolveLanguage('es', ['en-US']), 'es')
  assert.equal(resolveLanguage('fr', ['es-AR']), 'es')
})

test('localizes counts and preserves date and HTTP values supplied as strings', () => {
  assert.equal(translate('en', 'periodTotal', { count: 12345 }), '12,345 observations in the period')
  assert.equal(translate('es', 'periodTotal', { count: 12345 }), '12.345 observaciones en el período')
  assert.equal(translate('en', 'httpError', { status: '503' }), 'Could not load data (HTTP 503).')
  assert.equal(translate('es', 'httpError', { status: '503' }), 'No se pudieron cargar los datos (HTTP 503).')
})

test('translates region labels without changing the backend identifiers', () => {
  assert.deepEqual(regions.map((region) => translateRegion('en', region)), [
    'South America', 'Africa', 'Asia', 'Europe', 'North America', 'Oceania',
  ])
  assert.deepEqual(regions.map((region) => translateRegion('es', region)), regions)
  assert.equal(translateRegion('en', 'Antarctica'), 'Antarctica')
})

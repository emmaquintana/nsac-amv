import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createTranslator, systemLanguage } from './i18n.mjs'

test('detects regional system locales and falls back to English', () => {
  for (const [locale, expected] of [['es-AR', 'es'], ['es_ES.UTF-8', 'es'], ['en-GB', 'en'], ['fr-FR', 'en']]) {
    assert.equal(systemLanguage({ env: {}, locale: () => locale }), expected)
  }
})

test('respects environment locale precedence and POSIX C', () => {
  for (const [env, expected] of [
    [{ LANG: 'es_AR.UTF-8' }, 'es'],
    [{ LANGUAGE: 'fr:es:en', LANG: 'en_US.UTF-8' }, 'es'],
    [{ LC_MESSAGES: 'en_GB', LANG: 'es_AR' }, 'en'],
    [{ LC_ALL: 'C', LANG: 'es_AR' }, 'en'],
    [{ NSAC_LANGUAGE: 'es', LC_ALL: 'en_US.UTF-8' }, 'es'],
  ]) assert.equal(systemLanguage({ env, locale: () => 'en-US' }), expected)
})

test('every shared message has matching placeholders in both languages', () => {
  const read = (language) => JSON.parse(readFileSync(new URL(`../backend/app/locales/${language}.json`, import.meta.url), 'utf8'))
  const en = read('en')
  const es = read('es')
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort())
  const placeholders = (message) => [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  for (const key of Object.keys(en)) {
    assert.ok(en[key] && es[key], key)
    assert.deepEqual(placeholders(en[key]), placeholders(es[key]), key)
  }
})

test('translates messages while preserving paths and technical identifiers', () => {
  assert.equal(createTranslator('en')('clean.preview_file', { path: 'data/área.csv' }), 'Would delete: data/área.csv')
  assert.equal(createTranslator('es')('clean.preview_file', { path: 'data/área.csv' }), 'Se borraría: data/área.csv')
})

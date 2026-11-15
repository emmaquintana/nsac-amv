import { readFileSync } from 'node:fs'

const messages = Object.fromEntries(['en', 'es'].map((language) => [language,
  JSON.parse(readFileSync(new URL(`../backend/app/locales/${language}.json`, import.meta.url), 'utf8')),
]))

export function systemLanguage({ env = process.env, locale = () => Intl.DateTimeFormat().resolvedOptions().locale } = {}) {
  const configured = env.NSAC_LANGUAGE || env.LC_ALL || env.LC_MESSAGES || env.LANGUAGE || env.LANG
  const candidates = configured ? configured.split(':') : [locale()]
  for (const candidate of candidates) {
    const language = candidate.toLowerCase().split(/[-_.@]/)[0]
    if (language === 'en' || language === 'es') return language
  }
  return 'en'
}

export function createTranslator(language = systemLanguage()) {
  return (key, values = {}) => {
    const message = messages[language]?.[key] ?? messages.en[key]
    if (!message) throw new Error(`Unknown translation: ${key}`)
    return message.replace(/\{(\w+)\}/g, (_, name) => {
      if (!(name in values)) throw new Error(`Missing translation value: ${name}`)
      return String(values[name])
    })
  }
}

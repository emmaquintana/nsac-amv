import { createContext, useContext } from 'react'
import { locales, translate, translateRegion } from '../i18n'
import type { Language, MessageValues, Progress, TranslationKey } from '../i18n'

export function createLanguageValue(language: Language) {
  const locale = locales[language]
  const t = (key: TranslationKey, values?: MessageValues) => translate(language, key, values)
  return {
    language, locale, t,
    regionName: (region: string) => translateRegion(language, region),
    formatNumber: (value: number) => value.toLocaleString(locale),
    formatDate: (day: string, includeYear = true) => new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
      timeZone: 'UTC', day: '2-digit', month: '2-digit', ...(includeYear ? { year: '2-digit' as const } : {}),
    }),
    formatProgress: (status: Progress) => t('progress', {
      action: t(status.action), completed: status.completed, total: status.total,
      progress: status.progress, file: status.current_file ? ` · ${status.current_file}` : '',
    }),
  }
}

export const LanguageContext = createContext<(ReturnType<typeof createLanguageValue> & { toggleLanguage: () => void }) | null>(null)

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used within LanguageProvider.')
  return context
}

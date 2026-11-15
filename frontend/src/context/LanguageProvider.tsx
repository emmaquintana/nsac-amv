import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LANGUAGE_STORAGE_KEY, resolveLanguage, translate } from '../i18n'
import type { Language } from '../i18n'
import { createLanguageValue, LanguageContext } from './LanguageContext'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    let saved: string | null = null
    try { saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) } catch { /* Storage can be disabled. */ }
    return resolveLanguage(saved, navigator.languages?.length ? navigator.languages : [navigator.language])
  })

  useEffect(() => {
    document.documentElement.lang = language
    document.title = translate(language, 'appTitle')
  }, [language])

  const value = useMemo(() => ({
    ...createLanguageValue(language),
    toggleLanguage: () => {
      const next = language === 'en' ? 'es' : 'en'
      setLanguage(next)
      try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next) } catch { /* Keep the toggle usable without storage. */ }
    },
  }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}


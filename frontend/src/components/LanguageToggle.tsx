import { useLanguage } from '../context/LanguageContext'
import './LanguageToggle.css'

export function LanguageToggle() {
  const { language, toggleLanguage, t } = useLanguage()
  return (
    <button className="language-toggle" type="button" onClick={toggleLanguage}
      aria-label={t('switchLanguage')} title={t('switchLanguage')}>
      <span lang="en" className={language === 'en' ? 'language-toggle__active' : ''}>EN</span>
      <span aria-hidden="true">/</span>
      <span lang="es" className={language === 'es' ? 'language-toggle__active' : ''}>ES</span>
    </button>
  )
}

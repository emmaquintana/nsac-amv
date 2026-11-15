import { useTheme } from '../context/ThemeProvider'
import { useLanguage } from '../context/LanguageContext'
import './ThemeToggle.css'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useLanguage()
  const label = t(theme === 'light' ? 'switchDark' : 'switchLight')

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {theme === 'light' ? '☾' : '☼'}
      </span>
      <span className="theme-toggle__label">{t(theme === 'light' ? 'darkMode' : 'lightMode')}</span>
    </button>
  )
}

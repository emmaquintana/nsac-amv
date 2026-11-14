import { useTheme } from '../context/ThemeProvider'
import './ThemeToggle.css'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'light' ? 'oscuro' : 'claro'

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={`Cambiar a modo ${nextTheme}`}
      title={`Cambiar a modo ${nextTheme}`}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {theme === 'light' ? '☾' : '☼'}
      </span>
      <span className="theme-toggle__label">Modo {theme === 'light' ? 'oscuro' : 'claro'}</span>
    </button>
  )
}

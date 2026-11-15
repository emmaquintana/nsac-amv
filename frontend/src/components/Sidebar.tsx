import type { View } from '../types/app'
import { useLanguage } from '../context/LanguageContext'
import './Sidebar.css'

type SidebarProps = {
  view: View
  onViewChange: (view: View) => void
}

export function Sidebar({ view, onViewChange }: SidebarProps) {
  const { t } = useLanguage()
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <span className="sidebar__brand-kicker">NASA · FIRMS</span>
          <strong>NSAC</strong>
        </div>
      </div>

      <span className="sidebar__section-label">{t('analysis')}</span>

      <nav className="sidebar__nav" aria-label={t('views')}>
        <button
          className={`sidebar__link ${view === 'map' ? 'sidebar__link--active' : ''}`}
          type="button"
          onClick={() => onViewChange('map')}
          aria-current={view === 'map' ? 'page' : undefined}
        >
          <span className="sidebar__link-icon" aria-hidden="true">◉</span>
          <span>{t('map')}</span>
        </button>

        <button
          className={`sidebar__link ${view === 'series' ? 'sidebar__link--active' : ''}`}
          type="button"
          onClick={() => onViewChange('series')}
          aria-current={view === 'series' ? 'page' : undefined}
        >
          <span className="sidebar__link-icon" aria-hidden="true">⌁</span>
          <span>{t('series')}</span>
        </button>
      </nav>

      <div className="sidebar__footer">
        <span className="sidebar__status-dot" />
        <span>{t('harmonization')}</span>
      </div>
    </aside>
  )
}

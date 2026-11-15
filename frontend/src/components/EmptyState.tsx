import './EmptyState.css'
import { useLanguage } from '../context/LanguageContext'

type EmptyStateProps = {
  detail?: string
}

export function EmptyState({ detail }: EmptyStateProps) {
  const { t } = useLanguage()
  return (
    <div className="empty-state" role="status">
      <span className="empty-state__icon" aria-hidden="true">⌕</span>
      <strong>{t('noData')}</strong>
      {detail && <span className="empty-state__detail">{detail}</span>}
    </div>
  )
}

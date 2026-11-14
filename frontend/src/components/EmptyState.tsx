import './EmptyState.css'

type EmptyStateProps = {
  detail?: string
}

export function EmptyState({ detail }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-state__icon" aria-hidden="true">⌕</span>
      <strong>No hay datos para mostrar</strong>
      {detail && <span className="empty-state__detail">{detail}</span>}
    </div>
  )
}

import { useId, useState } from 'react'
import type { AppliedFilters, Period, View } from '../types/app'
import { regions } from '../types/app'
import { DEFAULT_PERIOD, filtersForPeriod, formatDate } from '../filters'
import { useLanguage } from '../context/LanguageContext'
import type { TranslationKey } from '../i18n'
import './FilterPanel.css'

type FilterPanelProps = {
  view: View
  onApply: (filters: AppliedFilters) => void
}

export function FilterPanel({ view, onApply }: FilterPanelProps) {
  const { t, regionName } = useLanguage()
  const id = useId()
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD)
  const [selectedRegions, setSelectedRegions] = useState<string[]>(regions)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<TranslationKey | ''>('')
  const [today, setToday] = useState(() => formatDate(new Date()))

  function toggleRegion(region: string) {
    setSelectedRegions((currentRegions) => currentRegions.includes(region)
      ? currentRegions.filter((currentRegion) => currentRegion !== region)
      : [...currentRegions, region])
  }

  function applyFilters() {
    if (period === 'custom' && endDate > formatDate(new Date())) {
      setError('futureDate')
      return
    }

    if (period === 'custom' && (!startDate || !endDate || startDate > endDate)) {
      setError('invalidDates')
      return
    }

    setError('')
    onApply(period === 'custom' ? {
      regions: selectedRegions,
      startDate,
      endDate,
    } : filtersForPeriod(period, selectedRegions))
  }

  return (
    <section className="filter-panel" aria-labelledby={`${id}-title`}>
      <header className="filter-panel__header">
        <div>
          <span className="filter-panel__eyebrow">{t('configuration')}</span>
          <h2 id={`${id}-title`}>{t('filters')}</h2>
        </div>
        <span className="filter-panel__header-icon" aria-hidden="true">⌘</span>
      </header>

      {view === 'series' ? (
        <fieldset className="filter-panel__regions">
          <legend>{t('regions')}</legend>
          <span className="filter-panel__hint">{t('selectRegions')}</span>
          {regions.map((region) => (
            <label className="filter-panel__checkbox" key={region}>
              <input
                type="checkbox"
                checked={selectedRegions.includes(region)}
                onChange={() => toggleRegion(region)}
              />
              <span>{regionName(region)}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="filter-panel__field">
          <label htmlFor={`${id}-region`}>{t('region')}</label>
          <select
            id={`${id}-region`}
            value={selectedRegions.length === regions.length ? '' : selectedRegions[0] ?? ''}
            onChange={(event) => setSelectedRegions(event.target.value ? [event.target.value] : regions)}
          >
            <option value="">{t('allRegions')}</option>
            {regions.map((region) => <option key={region} value={region}>{regionName(region)}</option>)}
          </select>
        </div>
      )}

      <div className="filter-panel__field">
        <label htmlFor={`${id}-period`}>{t('period')}</label>
        <select
          id={`${id}-period`}
          value={period}
          onChange={(event) => setPeriod(event.target.value as Period)}
        >
          <option value="7">{t('last7')}</option>
          <option value="30">{t('last30')}</option>
          <option value="90">{t('last90')}</option>
          <option value="custom">{t('custom')}</option>
        </select>
      </div>

      {period === 'custom' && (
        <div className="filter-panel__date-range">
          <div className="filter-panel__field">
            <label htmlFor={`${id}-start`}>{t('startDate')}</label>
            <input
              id={`${id}-start`}
              type="date"
              value={startDate}
              max={endDate && endDate < today ? endDate : today}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="filter-panel__field">
            <label htmlFor={`${id}-end`}>{t('endDate')}</label>
            <input
              id={`${id}-end`}
              type="date"
              value={endDate}
              min={startDate || undefined}
              max={today}
              onFocus={() => setToday(formatDate(new Date()))}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>
      )}

      {error && <p className="filter-panel__error" role="alert">{t(error)}</p>}

      <button className="filter-panel__apply" type="button" onClick={applyFilters}>
        {t('applyFilters')} <span aria-hidden="true">→</span>
      </button>

      <div className="filter-panel__source">
        <span aria-hidden="true">◈</span>
        <div>
          <strong>{t('sources')}</strong>
          <span>MODIS · VIIRS</span>
        </div>
      </div>
    </section>
  )
}

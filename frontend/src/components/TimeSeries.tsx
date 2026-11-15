import { EmptyState } from './EmptyState'
import type { AppliedFilters } from '../types/app'
import { regions } from '../types/app'
import { useTimeSeries } from '../hooks/useTimeSeries'
import { buildTimeSeries } from './timeSeriesData'
import { useLanguage } from '../context/LanguageContext'
import './TimeSeries.css'

type TimeSeriesProps = {
  filters: AppliedFilters
}

const PLOT = { left: 64, top: 24, width: 868, height: 250 }
const DASHES = ['', '8 3', '3 3', '10 3 2 3', '6 3 2 3', '2 4']

export function TimeSeries({ filters }: TimeSeriesProps) {
  const { t, regionName, formatNumber: formatCount, formatDate: formatDay } = useLanguage()
  const { summary, error, loading, retry, loadingMessage } = useTimeSeries(filters)

  const { days, series, maximum, represented, missingDays } = buildTimeSeries(summary, filters)
  const tickStep = Math.max(1, Math.ceil(maximum / 4))
  const ceiling = tickStep * 4
  const x = (index: number) => PLOT.left + (days.length === 1 ? PLOT.width / 2 : index / (days.length - 1) * PLOT.width)
  const y = (count: number) => PLOT.top + PLOT.height * (1 - count / ceiling)
  const labelCount = Math.min(6, days.length)
  const labelIndexes = [...new Set(Array.from({ length: labelCount }, (_, index) =>
    Math.round(index * (days.length - 1) / Math.max(1, labelCount - 1))))]

  return (
    <section className="time-series" aria-labelledby="time-series-title">
      <header className="time-series__header">
        <div>
          <span className="time-series__eyebrow">{t('temporalEvolution')}</span>
          <h2 id="time-series-title">{t('hotspotActivity')}</h2>
          <p>{t('seriesDescription')}</p>
          {filters.startDate && filters.endDate && (
            <span className="time-series__date-range">
              {formatDay(filters.startDate)} — {formatDay(filters.endDate)}
            </span>
          )}
        </div>
      </header>

      {error && <p role="alert">{error}</p>}
      {represented === 0 ? loading ? <p role="status">{loadingMessage}</p>
        : !error && <EmptyState detail={t('seriesEmpty')} />
          : <div className="time-series__chart">
            <ul className="time-series__legend" aria-label={t('representedRegions')}>
              {series.map(({ region }) => <li key={region}>
                <svg width="28" height="12" aria-hidden="true">
                  <line x1="0" x2="28" y1="6" y2="6" stroke={`var(--series-${regions.indexOf(region)})`}
                    strokeWidth="3" strokeDasharray={DASHES[regions.indexOf(region)]} />
                </svg>
                {regionName(region)}
              </li>)}
            </ul>
            <div className="time-series__plot">
              <svg className="time-series__svg" viewBox="0 0 960 320" role="img" aria-label={t('chartLabel')}>
                <desc>{t('chartDescription')}</desc>
                <text className="time-series__axis-title" x={PLOT.left} y="12">{t('observations')}</text>
                {Array.from({ length: 5 }, (_, index) => index * tickStep).map((count) => <g key={count}>
                  <line className="time-series__grid" x1={PLOT.left} x2={PLOT.left + PLOT.width} y1={y(count)} y2={y(count)} />
                  <text className="time-series__tick" x={PLOT.left - 10} y={y(count)} textAnchor="end" dominantBaseline="middle">{formatCount(count)}</text>
                </g>)}
                {labelIndexes.map((index) => <text key={days[index]} className="time-series__tick" x={x(index)} y={PLOT.top + PLOT.height + 24}
                  textAnchor={days.length === 1 ? 'middle' : index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle'}>
                  {formatDay(days[index], days.length > 180)}
                </text>)}
                {series.map(({ region, counts }) => <g key={region} className="time-series__line" stroke={`var(--series-${regions.indexOf(region)})`}>
                  <path fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                    strokeDasharray={DASHES[regions.indexOf(region)]}
                    d={counts.map((count, index) => count === null ? '' : `${index === 0 || counts[index - 1] === null ? 'M' : 'L'}${x(index)},${y(count)}`).join(' ')} />
                  {counts.map((count, index) => count !== null && <circle key={days[index]} cx={x(index)} cy={y(count)} r="3.5" fill="var(--surface)" strokeWidth="2"
                    className={days.length <= 60 || ((index === 0 || counts[index - 1] === null) && (index === days.length - 1 || counts[index + 1] === null)) ? 'time-series__point time-series__point--visible' : 'time-series__point'}>
                    <title>{regionName(region)} · {formatDay(days[index])} (UTC): {t('observationCount', { count })}</title>
                  </circle>)}
                </g>)}
              </svg>
            </div>
            <p>{t('seriesTotal', { count: represented })}</p>
            {summary?.first_day && summary.last_day && <p>{t('availableRecords', { first: formatDay(summary.first_day), last: formatDay(summary.last_day), days: summary.observed_days })}</p>}
            {missingDays > 0 && <p>{t(missingDays === 1 ? 'missingDay' : 'missingDays', { days: missingDays })}</p>}
            {!!summary?.unassigned && <p>{t('unassigned', { count: summary.unassigned })}</p>}
          </div>}
      {error && <button type="button" onClick={retry}>{t('retry')}</button>}
    </section>
  )
}

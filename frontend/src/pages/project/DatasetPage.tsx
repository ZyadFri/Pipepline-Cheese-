import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import clsx from 'clsx'
import { reviewQueueApi, insightsApi } from '../../services/api'
import type { DuplicatePair } from '../../services/api'
import type { ReviewObservation } from '../../types'
import {
  RefreshCw, Download, Database, Search, CheckCircle2, Clock, XCircle,
  Info, Copy, ChevronDown,
} from 'lucide-react'
import { confidenceStyle } from '../../utils/confidence'
import EvidenceModal from '../../components/EvidenceModal'

interface RichReviewObservation extends ReviewObservation {
  product_family?: string
  matrix_description?: string
  milk_species?: string
  milk_treatment?: string
  fat_content_class?: string
  sampling_location?: string
  storage_temperature_value?: number
  storage_temperature_unit_original?: string
  storage_relative_humidity?: number
  packaging_type?: string
  atmosphere_type?: string
  gas_composition?: Record<string, unknown>
  light_condition?: string
  storage_duration_value?: number
  storage_duration_unit_original?: string
  storage_duration_days?: number
  study_design?: string
  replicate_design?: string
  artificial_inoculation?: boolean
  initial_ph?: number
  initial_water_activity?: number
  initial_salt_pct?: number
  initial_moisture_pct?: number
  application_method?: string
  treatment_timing?: string
  treatment_type?: string
  microorganism_name?: string
}

type Cell = string | number | null | undefined
interface DynamicColumn {
  id: string
  label: string
  always?: boolean
  value: (o: RichReviewObservation) => Cell
  mono?: boolean
}

const STATUS_CLS: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700',
  needs_review: 'bg-amber-50 text-amber-700',
  rejected: 'bg-red-50 text-red-600',
}
const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved', needs_review: 'Needs review', rejected: 'Rejected', extracted: 'Needs review',
}

const present = (v: unknown) => v !== null && v !== undefined && v !== '' && !(typeof v === 'object' && v !== null && Object.keys(v).length === 0)
const formatGas = (gas?: Record<string, unknown>) => gas
  ? Object.entries(gas).filter(([, v]) => present(v)).map(([k, v]) => `${k} ${v}%`).join(' · ')
  : ''

const COLUMNS: DynamicColumn[] = [
  { id: 'product', label: 'Product', always: true, value: (o) => o.product_name },
  { id: 'product_family', label: 'Product family', value: (o) => o.product_family },
  { id: 'food_category', label: 'Category', value: (o) => o.food_category },
  { id: 'matrix', label: 'Matrix', value: (o) => o.matrix_description },
  { id: 'milk_species', label: 'Milk', value: (o) => o.milk_species },
  { id: 'milk_treatment', label: 'Milk treatment', value: (o) => o.milk_treatment },
  { id: 'fat', label: 'Fat class', value: (o) => o.fat_content_class },
  { id: 'sampling', label: 'Sampling', value: (o) => o.sampling_location },
  { id: 'treatment', label: 'Treatment', always: true, value: (o) => o.treatment_label },
  { id: 'ingredient', label: 'Ingredient', value: (o) => o.ingredient_name },
  { id: 'concentration', label: 'Concentration', value: (o) => o.concentration_value != null ? `${o.concentration_value}${o.concentration_unit ? ` ${o.concentration_unit}` : ''}` : '' },
  { id: 'treatment_type', label: 'Treatment type', value: (o) => o.treatment_type },
  { id: 'application', label: 'Application', value: (o) => o.application_method },
  { id: 'timing', label: 'Treatment timing', value: (o) => o.treatment_timing },
  { id: 'temperature', label: 'Storage temp.', value: (o) => o.storage_temperature_c != null ? `${o.storage_temperature_c} °C` : '' },
  { id: 'duration', label: 'Storage duration', value: (o) => o.storage_duration_days != null ? `${o.storage_duration_days} d` : '' },
  { id: 'humidity', label: 'Humidity', value: (o) => o.storage_relative_humidity != null ? `${o.storage_relative_humidity}% RH` : '' },
  { id: 'packaging', label: 'Packaging', value: (o) => o.packaging_type },
  { id: 'atmosphere', label: 'Atmosphere', value: (o) => o.atmosphere_type },
  { id: 'gas', label: 'Gas composition', value: (o) => formatGas(o.gas_composition) },
  { id: 'light', label: 'Light', value: (o) => o.light_condition },
  { id: 'study_design', label: 'Study design', value: (o) => o.study_design },
  { id: 'replicates', label: 'Replicate design', value: (o) => o.replicate_design },
  { id: 'inoculation', label: 'Inoculation', value: (o) => o.artificial_inoculation == null ? '' : (o.artificial_inoculation ? 'Artificial' : 'Not artificial') },
  { id: 'initial_ph', label: 'Initial pH', value: (o) => o.initial_ph },
  { id: 'initial_aw', label: 'Initial aw', value: (o) => o.initial_water_activity },
  { id: 'initial_salt', label: 'Initial salt', value: (o) => o.initial_salt_pct != null ? `${o.initial_salt_pct}%` : '' },
  { id: 'initial_moisture', label: 'Initial moisture', value: (o) => o.initial_moisture_pct != null ? `${o.initial_moisture_pct}%` : '' },
  { id: 'microorganism', label: 'Microorganism', value: (o) => o.microorganism_name },
  { id: 'indicator', label: 'Indicator', always: true, value: (o) => o.measurement_subtype ?? o.measurement_type },
  { id: 'time', label: 'Time', always: true, value: (o) => o.time_days != null ? `${o.time_days} d` : '' },
  { id: 'value', label: 'Value', always: true, value: (o) => o.numeric_value_normalized, mono: true },
  { id: 'unit', label: 'Unit', value: (o) => o.unit_normalized },
  { id: 'mean', label: 'Mean', value: (o) => o.mean_value, mono: true },
  { id: 'sd', label: 'SD', value: (o) => o.standard_deviation, mono: true },
  { id: 'se', label: 'SE', value: (o) => o.standard_error, mono: true },
  { id: 'min', label: 'Min', value: (o) => o.minimum_value, mono: true },
  { id: 'max', label: 'Max', value: (o) => o.maximum_value, mono: true },
  { id: 'n', label: 'n', value: (o) => o.replicate_count },
  { id: 'detection_limit', label: 'Detection limit', value: (o) => o.detection_limit != null ? `${o.detection_limit}${o.detection_limit_unit ? ` ${o.detection_limit_unit}` : ''}` : '' },
  { id: 'significance', label: 'Significance', value: (o) => o.significance_letter },
]

export default function DatasetPage() {
  const { projectId, paperId } = useParams<{ projectId: string; paperId?: string }>()
  const pid = Number(projectId)
  const paperIdNum = paperId ? Number(paperId) : undefined

  const [observations, setObservations] = useState<RichReviewObservation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [evidenceFor, setEvidenceFor] = useState<RichReviewObservation | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([])
  const [showDuplicates, setShowDuplicates] = useState(false)

  const counts = useMemo(() => {
    const c = { approved: 0, needs_review: 0, rejected: 0 }
    for (const o of observations) {
      if (o.review_status === 'approved') c.approved++
      else if (o.review_status === 'rejected') c.rejected++
      else c.needs_review++
    }
    return c
  }, [observations])

  const visibleColumns = useMemo(() => COLUMNS.filter((col) =>
    col.always || observations.some((o) => present(col.value(o))),
  ), [observations])

  const filtered = useMemo(() => {
    if (!search.trim()) return observations
    const q = search.trim().toLowerCase()
    return observations.filter((o) => visibleColumns.some((col) => String(col.value(o) ?? '').toLowerCase().includes(q)))
  }, [observations, search, visibleColumns])

  const load = () => {
    if (!projectId) return
    setLoading(true)
    reviewQueueApi.list(pid, {
      paper_id: paperIdNum,
      review_status: statusFilter || undefined,
      limit: 1000,
    })
      .then((rows) => setObservations(rows as RichReviewObservation[]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [pid, paperIdNum, statusFilter])

  useEffect(() => {
    if (!projectId) return
    insightsApi.duplicateExperiments(pid, { paper_id: paperIdNum })
      .then((res) => setDuplicates(res.pairs))
      .catch(() => setDuplicates([]))
  }, [pid, paperIdNum])

  const handleCsvDownload = () => {
    const csvCols = [{ id: 'id', label: 'ID', value: (o: RichReviewObservation) => o.id }, ...visibleColumns]
    const rows = observations.map((o) => csvCols.map((col) =>
      `"${String(col.value(o) ?? '').replace(/"/g, '""')}"`,
    ).join(','))
    const blob = new Blob([csvCols.map((c) => c.label).join(',') + '\n' + rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dataset_project_${projectId}${paperIdNum ? `_paper_${paperIdNum}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="type-h1" style={{ color: 'var(--foreground)' }}>Scientific Database</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${observations.length} observation${observations.length === 1 ? '' : 's'}`}
            {paperIdNum ? ' · fields adapt to this paper' : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search extracted data…"
              className="border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm w-56 focus:outline-none focus:border-[#7A1B2E]/40" />
          </div>
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option><option value="approved">Approved</option>
            <option value="needs_review">Needs review</option><option value="rejected">Rejected</option>
          </select>
          <button onClick={load} className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 px-2 py-1.5 border border-slate-200 rounded-lg"><RefreshCw size={14} /></button>
          <button onClick={handleCsvDownload} disabled={!observations.length} className="btn-secondary text-sm py-1.5 disabled:opacity-40"><Download size={14} /> Export CSV</button>
        </div>
      </div>

      {!loading && observations.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Total Rows', value: observations.length, Icon: Database, color: 'var(--primary)' },
            { label: 'Approved', value: counts.approved, Icon: CheckCircle2, color: '#0f9d58' },
            { label: 'Needs Review', value: counts.needs_review, Icon: Clock, color: '#c78a1e' },
            { label: 'Rejected', value: counts.rejected, Icon: XCircle, color: '#c0392b' },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="surface p-3.5 flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}14` }}><Icon size={15} style={{ color }} /></div>
              <div><p className="text-lg font-bold text-slate-900 leading-tight">{value}</p><p className="text-[10px] text-slate-400">{label}</p></div>
            </div>
          ))}
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60">
          <button onClick={() => setShowDuplicates((v) => !v)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left">
            <Copy size={14} className="shrink-0 text-amber-600" />
            <span className="text-xs font-semibold text-amber-800">{duplicates.length} possible duplicate experiment{duplicates.length === 1 ? '' : 's'} detected</span>
            <ChevronDown size={14} className={clsx('ml-auto shrink-0 text-amber-500 transition-transform', showDuplicates && 'rotate-180')} />
          </button>
          {showDuplicates && <div className="space-y-1.5 px-4 pb-3">{duplicates.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] text-slate-600">
              <span className="font-medium text-slate-800">{p.experiment_a.product_name ?? p.experiment_a.label ?? `Experiment #${p.experiment_a.id}`}</span>
              <span className="text-slate-400">({p.experiment_a.paper_name ?? `paper ${p.experiment_a.paper_id}`})</span><span className="text-slate-400">↔</span>
              <span className="font-medium text-slate-800">{p.experiment_b.product_name ?? p.experiment_b.label ?? `Experiment #${p.experiment_b.id}`}</span>
              <span className="text-slate-400">({p.experiment_b.paper_name ?? `paper ${p.experiment_b.paper_id}`})</span>
              <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{p.similarity}% similar</span>
            </div>
          ))}</div>}
        </div>
      )}

      {loading ? <p className="text-slate-400 text-sm">Loading observations…</p> : observations.length === 0 ? (
        <div className="text-center py-20"><Database size={36} className="text-slate-200 mx-auto mb-3" /><p className="text-slate-500 text-sm font-medium">No observations yet</p><p className="text-xs text-slate-400 mt-1">{statusFilter ? 'No observations match this filter.' : 'Extract a paper to see structured measurements here.'}</p></div>
      ) : (
        <div className="overflow-x-auto surface p-0">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-slate-100 bg-slate-50/50"><tr>
              {visibleColumns.map((col) => <th key={col.id} className="px-3 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{col.label}</th>)}
              <th className="px-3 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Origin</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Confidence</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Status</th>
              <th />
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.slice(0, 500).map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  {visibleColumns.map((col) => {
                    const value = col.value(o)
                    return <td key={col.id} className={clsx('px-3 py-2 whitespace-nowrap text-slate-600', col.id === 'product' && 'font-medium text-slate-800', col.mono && 'font-mono text-slate-800')}>
                      {present(value) ? value : ''}
                      {col.id === 'treatment' && o.is_control && <span className="ml-1.5 text-[10px] text-slate-400">control</span>}
                    </td>
                  })}
                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500">{o.value_origin === 'graph_estimated' ? 'Estimated from chart' : 'Reported directly'}</span></td>
                  <td className="px-3 py-2">{(() => { const style = confidenceStyle(o.quality_score); return style ? <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border', style.bg, style.text, style.border)} title={style.label}>{Math.round((o.quality_score ?? 0) * 100)}%</span> : null })()}</td>
                  <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_CLS[o.review_status] ?? 'bg-slate-100 text-slate-600'}`}>{STATUS_LABEL[o.review_status] ?? o.review_status}</span></td>
                  <td className="px-3 py-2">{o.evidence.length > 0 && <button onClick={() => setEvidenceFor(o)} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-medium text-slate-400 hover:bg-slate-100 hover:text-[#8B1538]" title="Why was this extracted?"><Info size={12} /> Evidence</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && <p className="text-xs text-slate-400 text-center py-2">Showing first 500 of {filtered.length}. Use Export CSV for the full dataset.</p>}
        </div>
      )}

      {evidenceFor && <EvidenceModal projectId={pid} title={`${evidenceFor.product_name ?? 'Observation'} · ${evidenceFor.measurement_subtype ?? evidenceFor.measurement_type}`} evidence={evidenceFor.evidence} onClose={() => setEvidenceFor(null)} />}
    </div>
  )
}

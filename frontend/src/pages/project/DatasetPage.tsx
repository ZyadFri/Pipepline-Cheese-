import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { reviewQueueApi } from '../../services/api'
import type { ReviewObservation } from '../../types'
import { RefreshCw, Download, Database, Search, CheckCircle2, Clock, XCircle } from 'lucide-react'

const STATUS_CLS: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700',
  needs_review: 'bg-amber-50 text-amber-700',
  rejected: 'bg-red-50 text-red-600',
}
const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved',
  needs_review: 'Needs review',
  rejected: 'Rejected',
  extracted: 'Needs review', // legacy value from data promoted before this status existed
}

export default function DatasetPage() {
  const { projectId, paperId } = useParams<{ projectId: string; paperId?: string }>()
  const pid = Number(projectId)
  const paperIdNum = paperId ? Number(paperId) : undefined

  const [observations, setObservations] = useState<ReviewObservation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => {
    const c = { approved: 0, needs_review: 0, rejected: 0 }
    for (const o of observations) {
      if (o.review_status === 'approved') c.approved++
      else if (o.review_status === 'rejected') c.rejected++
      else c.needs_review++
    }
    return c
  }, [observations])

  const filtered = useMemo(() => {
    if (!search.trim()) return observations
    const q = search.trim().toLowerCase()
    return observations.filter((o) =>
      (o.product_name ?? '').toLowerCase().includes(q) ||
      (o.treatment_label ?? '').toLowerCase().includes(q) ||
      (o.measurement_subtype ?? o.measurement_type ?? '').toLowerCase().includes(q),
    )
  }, [observations, search])

  const load = () => {
    if (!projectId) return
    setLoading(true)
    reviewQueueApi
      .list(pid, {
        paper_id: paperIdNum,
        review_status: statusFilter || undefined,
        limit: 1000,
      })
      .then(setObservations)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [pid, paperIdNum, statusFilter])

  const handleCsvDownload = () => {
    const header = ['id', 'product', 'treatment', 'indicator', 'time_days', 'value', 'unit', 'origin', 'status']
    const rows = observations.map((o) =>
      [o.id, o.product_name ?? '', o.treatment_label ?? '', o.measurement_subtype ?? o.measurement_type,
       o.time_days, o.numeric_value_normalized, o.unit_normalized, o.value_origin, o.review_status]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    )
    const blob = new Blob([header.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dataset_project_${projectId}${paperIdNum ? `_paper_${paperIdNum}` : ''}.csv`
    a.click()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="type-h1" style={{ color: 'var(--foreground)' }}>
            Scientific Database
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${observations.length} observation${observations.length === 1 ? '' : 's'}`}
            {paperIdNum ? ' · this paper only' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, treatment, indicator…"
              className="border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm w-56 focus:outline-none focus:border-[#7A1B2E]/40"
            />
          </div>
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="approved">Approved</option>
            <option value="needs_review">Needs review</option>
            <option value="rejected">Rejected</option>
          </select>
          <button onClick={load} className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 px-2 py-1.5 border border-slate-200 rounded-lg">
            <RefreshCw size={14} />
          </button>
          <button onClick={handleCsvDownload} disabled={!observations.length} className="btn-secondary text-sm py-1.5 disabled:opacity-40">
            <Download size={14} /> Export CSV
          </button>
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}14` }}>
                <Icon size={15} style={{ color }} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
                <p className="text-[10px] text-slate-400">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm">Loading observations…</p>
      ) : observations.length === 0 ? (
        <div className="text-center py-20">
          <Database size={36} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">No observations yet</p>
          <p className="text-xs text-slate-400 mt-1">
            {statusFilter
              ? 'No observations match this filter.'
              : 'Extract a paper to see structured measurements here — they appear automatically once extraction finishes.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto surface p-0">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-slate-100">
              <tr>
                {['Product', 'Treatment', 'Indicator', 'Time (days)', 'Value', 'Unit', 'Origin', 'Status'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.slice(0, 500).map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-medium text-slate-800">{o.product_name ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {o.treatment_label ?? '—'}
                    {o.is_control && <span className="ml-1.5 text-[10px] text-slate-400">(control)</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{o.measurement_subtype ?? o.measurement_type}</td>
                  <td className="px-3 py-2 text-slate-500">{o.time_days != null ? o.time_days : '—'}</td>
                  <td className="px-3 py-2 font-mono text-slate-800">{o.numeric_value_normalized != null ? o.numeric_value_normalized : '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{o.unit_normalized ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500">
                      {o.value_origin === 'graph_estimated' ? 'Estimated from chart' : 'Reported directly'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_CLS[o.review_status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[o.review_status] ?? o.review_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <p className="text-xs text-slate-400 text-center py-2">Showing first 500 of {filtered.length}. Use Export CSV for the full dataset.</p>
          )}
        </div>
      )}
    </div>
  )
}

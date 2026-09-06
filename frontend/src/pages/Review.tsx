import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Check, X, Edit3, Save, ChevronDown, ChevronUp,
  CheckCircle2, ImageIcon, FlaskConical,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { reviewQueueApi, observationsApi, projectsApi } from '../services/api'
import type { Project, ReviewObservation } from '../types'
import AuthImage from '../components/AuthImage'

type StatusFilter = 'all' | 'needs_review' | 'approved' | 'rejected'

const HIGH_CONFIDENCE = 0.6 // matches the Pass-2 verification threshold on the backend

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

const STATUS_BADGE: Record<string, string> = {
  needs_review: 'badge-pending',
  approved: 'badge-approved',
  rejected: 'badge-rejected',
}
const STATUS_LABEL: Record<string, string> = {
  needs_review: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
}

function ConfidenceBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) {
    return <span className="text-[11px] text-slate-300">—</span>
  }
  const pct = Math.round(value * 100)
  const cls =
    value >= HIGH_CONFIDENCE ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : 'text-amber-700 bg-amber-50 border-amber-200'
  return (
    <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border', cls)}>
      {pct}%
    </span>
  )
}

function OriginBadge({ origin }: { origin: string }) {
  const isEstimated = origin === 'graph_estimated'
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border',
        isEstimated ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-500 bg-slate-50 border-slate-200',
      )}
      title={isEstimated ? 'Read from a chart, not an exact reported number' : 'Reported directly in the paper'}
    >
      {isEstimated ? <FlaskConical size={9} /> : null}
      {isEstimated ? 'Estimated from chart' : 'Reported directly'}
    </span>
  )
}

// ─── One measurement row ────────────────────────────────────────────────────

function MeasurementRow({
  obs, onUpdate, projectId,
}: {
  obs: ReviewObservation
  onUpdate: (id: number, patch: Partial<ReviewObservation>) => void
  projectId: number
}) {
  const [editing, setEditing] = useState(false)
  const [draftValue, setDraftValue] = useState(String(obs.numeric_value_normalized ?? ''))
  const [draftUnit, setDraftUnit] = useState(obs.unit_normalized ?? '')
  const [expanded, setExpanded] = useState(false)

  const handleSave = async () => {
    try {
      const updated = await observationsApi.update(obs.id, {
        numeric_value_normalized: draftValue === '' ? null : Number(draftValue),
        unit_normalized: draftUnit || null,
      })
      onUpdate(obs.id, updated)
      setEditing(false)
      toast.success('Value updated')
    } catch { toast.error('Failed to update') }
  }

  const setStatus = async (status: 'approved' | 'rejected') => {
    try {
      const updated = status === 'approved'
        ? await observationsApi.approve(obs.id)
        : await observationsApi.update(obs.id, { review_status: 'rejected' })
      onUpdate(obs.id, updated)
    } catch { toast.error('Failed') }
  }

  const hasEvidence = obs.evidence.length > 0

  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="py-2 px-3 text-xs text-slate-600 whitespace-nowrap">
          {obs.time_days != null ? `Day ${obs.time_days}` : '—'}
        </td>
        <td className="py-2 px-3 text-xs text-slate-800 font-medium">
          {obs.measurement_subtype || obs.measurement_type}
        </td>
        <td className="py-2 px-3 text-xs text-slate-800">
          {editing ? (
            <input
              className="input py-1 px-2 text-xs w-24"
              type="number"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
            />
          ) : (
            obs.numeric_value_normalized ?? <span className="text-slate-300">missing</span>
          )}
        </td>
        <td className="py-2 px-3 text-xs text-slate-500">
          {editing ? (
            <input
              className="input py-1 px-2 text-xs w-20"
              value={draftUnit}
              onChange={(e) => setDraftUnit(e.target.value)}
            />
          ) : (
            obs.unit_normalized || '—'
          )}
        </td>
        <td className="py-2 px-3"><ConfidenceBadge value={obs.quality_score} /></td>
        <td className="py-2 px-3"><OriginBadge origin={obs.value_origin} /></td>
        <td className="py-2 px-3">
          <span className={STATUS_BADGE[obs.review_status] || 'badge-pending'}>
            {STATUS_LABEL[obs.review_status] || obs.review_status}
          </span>
        </td>
        <td className="py-2 px-3">
          <div className="flex items-center gap-1 justify-end">
            {editing ? (
              <>
                <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Save">
                  <Save size={13} />
                </button>
                <button
                  onClick={() => { setEditing(false); setDraftValue(String(obs.numeric_value_normalized ?? '')); setDraftUnit(obs.unit_normalized ?? '') }}
                  className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" title="Cancel"
                >
                  <X size={13} />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setStatus('approved')} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg" title="Approve">
                  <Check size={13} />
                </button>
                <button onClick={() => setStatus('rejected')} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Reject">
                  <X size={13} />
                </button>
                <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-[#fdf3f5]" style={{ color: 'var(--primary)' }} title="Edit">
                  <Edit3 size={12} />
                </button>
                {hasEvidence && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"
                    title={expanded ? 'Hide evidence' : 'Show evidence'}
                  >
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
      {expanded && hasEvidence && (
        <tr className="bg-slate-50/60">
          <td colSpan={8} className="px-4 py-3">
            <div className="space-y-2">
              {obs.evidence.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 text-xs">
                  {ev.has_image ? (
                    <div
                      className="w-16 h-16 shrink-0 rounded-md border border-slate-200 overflow-hidden bg-white block"
                      title="Evidence crop"
                    >
                      <AuthImage
                        src={reviewQueueApi.provenanceThumbnailUrl(projectId, ev.id)}
                        alt="Evidence crop"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 shrink-0 rounded-md border border-slate-200 overflow-hidden bg-white flex items-center justify-center">
                      <ImageIcon size={16} className="text-slate-300" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-slate-600 line-clamp-2">
                      {ev.source_snippet || 'No excerpt available.'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {ev.page_number ? `Page ${ev.page_number}` : ''}
                      {ev.confidence != null ? ` · ${Math.round(ev.confidence * 100)}% confidence` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── One experiment group ───────────────────────────────────────────────────

function ExperimentGroup({
  groupKey, rows, onUpdate, projectId,
}: {
  groupKey: string
  rows: ReviewObservation[]
  onUpdate: (id: number, patch: Partial<ReviewObservation>) => void
  projectId: number
}) {
  const first = rows[0]
  return (
    <div className="surface p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {first.product_name || 'Unknown product'}
            {first.paper_name && <span className="text-slate-400 font-normal"> · {first.paper_name}</span>}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {first.treatment_label || 'Unlabeled treatment'}
            {first.is_control && (
              <span className="ml-1.5 text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">control</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400 ml-auto">
          {first.ingredient_name && (
            <span>{first.ingredient_name}{first.concentration_value != null ? ` · ${first.concentration_value}${first.concentration_unit || ''}` : ''}</span>
          )}
          {first.storage_temperature_c != null && <span>{first.storage_temperature_c}°C storage</span>}
          <span className="font-mono text-slate-300">{groupKey}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              <th className="py-2 px-3">Time</th>
              <th className="py-2 px-3">Indicator</th>
              <th className="py-2 px-3">Value</th>
              <th className="py-2 px-3">Unit</th>
              <th className="py-2 px-3">Confidence</th>
              <th className="py-2 px-3">Source</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((obs) => <MeasurementRow key={obs.id} obs={obs} onUpdate={onUpdate} projectId={projectId} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Review() {
  const { projectId, paperId } = useParams<{ projectId: string; paperId?: string }>()
  const pid = Number(projectId)
  const paperIdNum = paperId ? Number(paperId) : undefined

  const [project, setProject] = useState<Project | null>(null)
  const [observations, setObservations] = useState<ReviewObservation[]>([])
  const [filter, setFilter] = useState<StatusFilter>('needs_review')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    projectsApi.get(pid).then(setProject).catch(() => toast.error('Failed to load project'))
  }, [pid])

  const load = async () => {
    setLoading(true)
    try {
      const data = await reviewQueueApi.list(pid, {
        paper_id: paperIdNum,
        review_status: filter === 'all' ? undefined : filter,
        limit: 1000,
      })
      setObservations(data)
    } catch { toast.error('Failed to load review data') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [pid, paperIdNum, filter])

  const handleUpdate = (id: number, patch: Partial<ReviewObservation>) =>
    setObservations((prev) => prev.map((o) => o.id === id ? { ...o, ...patch } : o))

  const groups = useMemo(() => {
    const byExp = new Map<string, ReviewObservation[]>()
    for (const o of observations) {
      const key = o.experiment_id != null ? String(o.experiment_id) : `unassigned-${o.treatment_arm_id}`
      if (!byExp.has(key)) byExp.set(key, [])
      byExp.get(key)!.push(o)
    }
    return Array.from(byExp.entries())
  }, [observations])

  const counts = useMemo(() => {
    const c = { needs_review: 0, approved: 0, rejected: 0 }
    for (const o of observations) {
      if (o.review_status === 'approved') c.approved++
      else if (o.review_status === 'rejected') c.rejected++
      else c.needs_review++
    }
    return c
  }, [observations])

  const highConfidencePending = observations.filter(
    (o) => o.review_status === 'needs_review' && (o.quality_score ?? 0) >= HIGH_CONFIDENCE,
  )

  const bulkApproveHighConfidence = async () => {
    if (!highConfidencePending.length) return
    try {
      const updated = await observationsApi.bulkApprove(highConfidencePending.map((o) => o.id))
      const byId = new Map(updated.map((o) => [o.id, o]))
      setObservations((prev) => prev.map((o) => byId.has(o.id) ? { ...o, ...byId.get(o.id) } : o))
      toast.success(`${updated.length} high-confidence value(s) approved`)
    } catch { toast.error('Bulk approve failed') }
  }

  const backTo = paperIdNum ? `/projects/${pid}/papers/${paperIdNum}/overview` : `/projects/${pid}`

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-3 justify-between flex-wrap">
        <div className="flex items-center gap-3">
          <Link to={backTo} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="type-h1" style={{ color: 'var(--foreground)' }}>Review</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {project?.name}{paperIdNum ? ' · this paper only' : ' · all papers'}
            </p>
          </div>
        </div>
        {highConfidencePending.length > 0 && (
          <button onClick={bulkApproveHighConfidence} className="btn-primary">
            <CheckCircle2 size={14} /> Approve all high-confidence ({highConfidencePending.length})
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              'text-sm px-4 py-1.5 rounded-lg font-medium transition-all',
              filter === key ? 'bg-[#7A1B2E] text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
            )}
          >
            {label}
            {key !== 'all' && counts[key] > 0 && (
              <span className={clsx('ml-1.5 text-[10px]', filter === key ? 'text-white/80' : 'text-slate-400')}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#7A1B2E] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20">
          <CheckCircle2 size={36} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {filter === 'all' ? 'No extracted measurements yet.' : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} measurements.`}
          </p>
          {filter === 'all' && (
            <p className="text-xs text-slate-400 mt-1">Upload and extract a paper to see results here.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([key, rows]) => (
            <ExperimentGroup key={key} groupKey={key} rows={rows} onUpdate={handleUpdate} projectId={pid} />
          ))}
        </div>
      )}
    </div>
  )
}

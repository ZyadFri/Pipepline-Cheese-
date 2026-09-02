import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Upload, Settings, Eye, BarChart2, Download, FileText,
  CheckCircle2, XCircle, Clock, ChevronRight, AlertCircle,
  Loader2, RefreshCw, BarChart3, Table2, ShieldCheck,
  FlaskConical, ArrowUpRight, Layers, MoreHorizontal, Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { projectsApi, papersApi, exportApi } from '../services/api'
import type { Project } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type StageStatus = 'not_started' | 'running' | 'completed' | 'failed' | 'unavailable' | 'no_charts' | 'ready' | 'pending' | 'partial'

interface PaperStages {
  docling: StageStatus
  assets: StageStatus
  charts: StageStatus
  validation: StageStatus
  llm: StageStatus
  review: StageStatus
  promotion: StageStatus
}

interface PaperPipeline {
  id: number
  original_name: string
  filename: string
  page_count: number
  uploaded_at: string | null
  badge: string
  progress_pct: number
  stages: PaperStages
  counts: { assets: number; charts: number; rows: number; approved_rows: number }
  ws_result: Record<string, unknown>
  ws_job_id: number | null
  llm_job_id: number | null
}

// ─── Badge config ─────────────────────────────────────────────────────────────

const BADGE_META: Record<string, { label: string; cls: string }> = {
  uploaded:         { label: 'Uploaded',          cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  processing:       { label: 'Processing',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  validation_ready: { label: 'Validation Ready',  cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  extracting:       { label: 'AI Extracting',     cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  awaiting_review:  { label: 'Awaiting Review',   cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  ready_to_promote: { label: 'Ready for DB',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  completed:        { label: 'Completed',          cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed:           { label: 'Failed',             cls: 'bg-red-50 text-red-600 border-red-200' },
}

// ─── Stage icon ───────────────────────────────────────────────────────────────

function StageIcon({ status, size = 14 }: { status: StageStatus; size?: number }) {
  if (status === 'completed' || status === 'no_charts' || status === 'unavailable') {
    return <CheckCircle2 size={size} className="text-emerald-500" />
  }
  if (status === 'running') return <Loader2 size={size} className="text-blue-500 animate-spin" />
  if (status === 'failed')  return <XCircle size={size} className="text-red-400" />
  if (status === 'ready' || status === 'pending') return <Clock size={size} className="text-violet-400" />
  if (status === 'partial') return <CheckCircle2 size={size} className="text-amber-400" />
  return <span className="inline-block w-3 h-3 rounded-full border border-slate-300 bg-white" style={{ width: size, height: size }} />
}

// ─── Pipeline stage bar ───────────────────────────────────────────────────────

const STAGES = [
  { key: 'docling',    label: 'Docling',     Icon: Layers },
  { key: 'assets',     label: 'Assets',      Icon: Table2 },
  { key: 'charts',     label: 'Charts',      Icon: BarChart3 },
  { key: 'validation', label: 'Validation',  Icon: ShieldCheck },
  { key: 'llm',        label: 'LLM Extract', Icon: FlaskConical },
  { key: 'review',     label: 'Review',      Icon: Eye },
  { key: 'promotion',  label: 'Promote',     Icon: ArrowUpRight },
] as const

function StagePill({ stageKey, label, Icon, status }: {
  stageKey: string; label: string; Icon: React.ElementType; status: StageStatus
}) {
  const isDone = ['completed', 'no_charts', 'unavailable'].includes(status)
  const isActive = ['running', 'ready', 'pending', 'partial'].includes(status)

  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div className={clsx(
        'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
        isDone   ? 'bg-emerald-50 border-emerald-300' :
        isActive ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100' :
        status === 'failed' ? 'bg-red-50 border-red-300' :
                   'bg-white border-slate-200',
      )}>
        <StageIcon status={status} size={14} />
      </div>
      <span className={clsx(
        'text-[9px] font-medium leading-tight text-center whitespace-nowrap',
        isDone   ? 'text-emerald-600' :
        isActive ? 'text-blue-600' :
        status === 'failed' ? 'text-red-500' :
                   'text-slate-300',
      )}>
        {label}
      </span>
      <span className={clsx(
        'text-[8px] leading-none',
        isDone   ? 'text-emerald-400' :
        isActive ? 'text-blue-400' :
                   'text-slate-200',
      )}>
        {isDone ? 'Done' : isActive ? (status === 'ready' ? 'Ready' : status === 'pending' ? 'Pending' : status === 'partial' ? 'Partial' : 'Running') : '—'}
      </span>
    </div>
  )
}

function PipelineBar({ stages }: { stages: PaperStages }) {
  return (
    <div className="flex items-start gap-1.5">
      {STAGES.map(({ key, label, Icon }, i) => {
        const status = stages[key as keyof PaperStages]
        const isDone = ['completed', 'no_charts', 'unavailable'].includes(status)
        return (
          <div key={key} className="flex items-center gap-1">
            <StagePill stageKey={key} label={label} Icon={Icon} status={status} />
            {i < STAGES.length - 1 && (
              <div className={clsx('w-3 h-px mt-[-10px]', isDone ? 'bg-emerald-300' : 'bg-slate-200')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Current stage label ──────────────────────────────────────────────────────

function CurrentStageLabel({ paper }: { paper: PaperPipeline }) {
  const s = paper.stages

  if (s.docling === 'running') return (
    <div>
      <p className="text-xs font-semibold text-blue-700">Docling</p>
      <p className="text-[10px] text-blue-500">In progress</p>
    </div>
  )
  if (s.docling === 'failed') return (
    <div>
      <p className="text-xs font-semibold text-red-600">Docling Failed</p>
      <p className="text-[10px] text-red-400">Check jobs log</p>
    </div>
  )
  if (s.docling === 'not_started') return (
    <div>
      <p className="text-xs font-semibold text-slate-500">Not started</p>
      <p className="text-[10px] text-slate-400">Next: Open pipeline</p>
    </div>
  )
  if (s.validation === 'ready') return (
    <div>
      <p className="text-xs font-semibold text-violet-700">Validation</p>
      <p className="text-[10px] text-violet-500">Ready</p>
      <p className="text-[10px] text-slate-400 mt-0.5">Next: LLM Extraction</p>
    </div>
  )
  if (s.llm === 'running') return (
    <div>
      <p className="text-xs font-semibold text-amber-700">AI Extracting</p>
      <p className="text-[10px] text-amber-500">In progress</p>
    </div>
  )
  if (s.llm === 'failed') return (
    <div>
      <p className="text-xs font-semibold text-red-600">LLM Failed</p>
      <p className="text-[10px] text-red-400">Retry from validation</p>
    </div>
  )
  if (s.review === 'pending' || s.review === 'partial') return (
    <div>
      <p className="text-xs font-semibold text-orange-700">Awaiting Review</p>
      <p className="text-[10px] text-orange-500">
        {paper.counts.approved_rows}/{paper.counts.rows} approved
      </p>
    </div>
  )
  if (s.review === 'completed' && s.promotion === 'not_started') return (
    <div>
      <p className="text-xs font-semibold text-emerald-700">Ready for DB</p>
      <p className="text-[10px] text-emerald-500">Next: Promote rows</p>
    </div>
  )
  if (s.promotion === 'completed') return (
    <div>
      <p className="text-xs font-semibold text-emerald-700">Completed</p>
      <p className="text-[10px] text-emerald-500">In scientific DB</p>
    </div>
  )
  // docling done but no assets yet
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600">Docling</p>
      <p className="text-[10px] text-slate-400">Done · {paper.counts.assets} assets</p>
      <p className="text-[10px] text-slate-400 mt-0.5">Next: Assets</p>
    </div>
  )
}

// ─── Primary action button ────────────────────────────────────────────────────

function PrimaryAction({ paper, pid }: { paper: PaperPipeline; pid: number }) {
  const navigate = useNavigate()
  const s = paper.stages

  let label = 'Open Pipeline'
  let to: string | null = `/projects/${pid}/papers/${paper.id}/overview`
  let variant: 'primary' | 'secondary' | 'ghost' = 'primary'

  if (s.docling === 'not_started') {
    label = 'Start Processing'; to = `/projects/${pid}/papers/${paper.id}/overview`; variant = 'primary'
  } else if (s.docling === 'running') {
    label = 'View Progress'; to = `/projects/${pid}/papers/${paper.id}/overview`; variant = 'secondary'
  } else if (s.docling === 'failed') {
    label = 'Retry Docling'; to = `/projects/${pid}/papers/${paper.id}/overview`; variant = 'primary'
  } else if (s.validation === 'ready' || s.llm === 'not_started') {
    label = 'Review Assets'; to = `/projects/${pid}/papers/${paper.id}/docling`; variant = 'primary'
  } else if (s.llm === 'running') {
    label = 'View Extraction'; to = `/projects/${pid}/papers/${paper.id}/overview`; variant = 'secondary'
  } else if (s.review === 'pending' || s.review === 'partial') {
    label = 'Review Rows'; to = `/projects/${pid}/review`; variant = 'primary'
  } else if (s.review === 'completed' && s.promotion === 'not_started') {
    label = 'Promote to DB'; to = null; variant = 'primary'
  } else if (s.promotion === 'completed') {
    label = 'Open Results'; to = `/projects/${pid}/dataset`; variant = 'secondary'
  } else {
    label = 'Open Workspace'; variant = 'secondary'
  }

  const cls = clsx(
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap',
    variant === 'primary'   ? 'bg-[#7A1B2E] text-white hover:bg-[#661523]' :
    variant === 'secondary' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' :
                              'text-slate-500 hover:bg-slate-100',
  )

  if (to) {
    return <Link to={to} className={cls}>{label} <ChevronRight size={10} /></Link>
  }

  return (
    <button className={cls} onClick={() => toast('Promotion coming soon')}>
      {label} <ChevronRight size={10} />
    </button>
  )
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ total, segments }: {
  total: number
  segments: { label: string; count: number; color: string }[]
}) {
  const r = 40; const cx = 50; const cy = 50; const stroke = 10
  const circumference = 2 * Math.PI * r
  let offset = 0
  const nonZero = segments.filter((s) => s.count > 0)

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          ) : nonZero.map((seg) => {
            const dash = (seg.count / total) * circumference
            const el = (
              <circle
                key={seg.label}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={-offset}
              />
            )
            offset += dash
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-slate-800">{total}</span>
          <span className="text-[9px] text-slate-400 font-medium">Total Papers</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 w-full">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-slate-600">{s.label}</span>
            </div>
            <span className="text-slate-400 font-medium">
              {s.count} ({total ? Math.round((s.count / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [project, setProject]   = useState<Project | null>(null)
  const [papers, setPapers]     = useState<PaperPipeline[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort]         = useState<'newest' | 'oldest' | 'name'>('newest')
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [proj, ps] = await Promise.all([
        projectsApi.get(pid),
        papersApi.pipelineStatus(pid),
      ])
      setProject(proj)
      setPapers(ps)
    } catch {
      toast.error('Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [pid])

  useEffect(() => {
    load()
    const interval = setInterval(() => {
      // Only poll while any paper is actively running
      setPapers((prev) => {
        const hasActive = prev.some((p) =>
          p.stages.docling === 'running' || p.stages.llm === 'running'
        )
        if (hasActive) load()
        return prev
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [load])

  const handleDelete = async (paperId: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    try {
      await papersApi.delete(pid, paperId)
      setPapers((prev) => prev.filter((p) => p.id !== paperId))
      toast.success('Paper deleted')
    } catch {
      toast.error('Failed to delete paper')
    }
  }

  // ── Derived counters ──────────────────────────────────────────────────────
  const total       = papers.length
  const processing  = papers.filter((p) => ['processing', 'extracting'].includes(p.badge)).length
  const docklingDone= papers.filter((p) => p.stages.docling === 'completed').length
  const llmDone     = papers.filter((p) => p.stages.llm === 'completed').length
  const approvedRows= papers.reduce((s, p) => s + p.counts.approved_rows, 0)
  const awaitingReview = papers.filter((p) => ['awaiting_review'].includes(p.badge)).length
  const failed      = papers.filter((p) => p.badge === 'failed').length

  // ── Filter + sort ─────────────────────────────────────────────────────────
  let displayed = papers.filter((p) => {
    if (search && !p.original_name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter === 'all') return true
    return p.badge === statusFilter
  })
  if (sort === 'oldest')  displayed = [...displayed].sort((a, b) => (a.uploaded_at ?? '').localeCompare(b.uploaded_at ?? ''))
  else if (sort === 'newest') displayed = [...displayed].sort((a, b) => (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? ''))
  else displayed = [...displayed].sort((a, b) => a.original_name.localeCompare(b.original_name))

  // Pipeline overview segments
  const segments = [
    { label: 'Docling Completed', count: docklingDone, color: '#22c55e' },
    { label: 'Charts Completed',  count: papers.filter((p) => p.stages.charts === 'completed').length, color: '#a855f7' },
    { label: 'Awaiting Review',   count: awaitingReview, color: '#f59e0b' },
    { label: 'Awaiting Review',   count: awaitingReview, color: '#f59e0b' },
    { label: 'Failed',            count: failed, color: '#ef4444' },
    { label: 'Not Started',       count: papers.filter((p) => p.badge === 'uploaded').length, color: '#cbd5e1' },
  ].filter((s, i, arr) => arr.findIndex((x) => x.label === s.label) === i)

  // Recent activity (last 5 papers sorted by uploaded_at)
  const recent = [...papers].sort((a, b) => (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? '')).slice(0, 5)

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={22} className="animate-spin text-slate-300" />
    </div>
  )

  if (!project) return (
    <div className="text-center py-24">
      <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
      <p className="text-slate-600">Project not found</p>
    </div>
  )

  return (
    <div className="flex gap-6 p-6 min-h-full" style={{ background: 'var(--canvas)' }}>

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Breadcrumb + header */}
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
            <Link to="/" className="hover:text-slate-600">Projects</Link>
            <ChevronRight size={12} />
            <span className="text-slate-700 font-medium">{project.name}</span>
          </nav>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="type-h1" style={{ color: 'var(--foreground)' }}>{project.name}</h1>
                <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">Project</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Created on {project.created_at ? new Date(project.created_at).toLocaleDateString() : '—'}
                {' · '}Last updated {project.updated_at ? new Date(project.updated_at).toLocaleDateString() : '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/projects/${pid}/upload`} className="btn-primary text-xs py-1.5">
                <Upload size={13} /> Upload PDFs
              </Link>
              <Link to={`/projects/${pid}/schema`} className="btn-secondary text-xs py-1.5">
                <Settings size={13} /> Schema
              </Link>
              <Link to={`/projects/${pid}/review`} className="btn-secondary text-xs py-1.5">
                <Eye size={13} /> Review
              </Link>
              <Link to={`/projects/${pid}/analytics`} className="btn-secondary text-xs py-1.5">
                <BarChart2 size={13} /> Analytics
              </Link>
              <button onClick={async () => { try { await exportApi.excel(pid); toast.success('Exported') } catch { toast.error('Export failed') } }} className="btn-secondary text-xs py-1.5">
                <Download size={13} /> Export
              </button>
              <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="Refresh">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'Total Papers', value: total,
              sub: total === 0 ? 'No papers yet' : 'All uploaded',
              color: 'bg-blue-50', icon: FileText, iconCls: 'text-blue-500', bar: null,
            },
            {
              label: 'Docling Completed', value: docklingDone,
              sub: total ? `${Math.round((docklingDone / total) * 100)}%` : '0%',
              color: 'bg-emerald-50', icon: CheckCircle2, iconCls: 'text-emerald-500',
              bar: total ? docklingDone / total : 0, barColor: 'bg-emerald-500',
              detail: 'Ready for next steps',
            },
            {
              label: 'LLM Extraction', value: llmDone,
              sub: total ? `${Math.round((llmDone / total) * 100)}%` : '0%',
              color: 'bg-violet-50', icon: FlaskConical, iconCls: 'text-violet-500',
              bar: total ? llmDone / total : 0, barColor: 'bg-violet-500',
              detail: llmDone === 0 ? 'Not started' : 'Completed',
            },
            {
              label: 'Approved Rows', value: approvedRows,
              sub: approvedRows === 0 ? '0%' : 'Reviewed',
              color: 'bg-amber-50', icon: CheckCircle2, iconCls: approvedRows > 0 ? 'text-amber-500' : 'text-slate-300',
              bar: null,
              detail: approvedRows === 0 ? 'Ready to promote' : `${approvedRows} rows approved`,
              warn: approvedRows === 0,
            },
          ].map((card) => (
            <div key={card.label} className="surface p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center', card.color)}>
                  <card.icon size={16} className={card.iconCls} />
                </div>
                {card.warn && <AlertCircle size={13} className="text-amber-400 mt-0.5" />}
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-0.5">{card.value}</div>
              <div className="text-xs text-slate-500">{card.label}</div>
              {card.bar != null && (
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all', (card as any).barColor)}
                    style={{ width: `${Math.round(card.bar * 100)}%` }}
                  />
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-1.5">{card.detail ?? card.sub}</p>
            </div>
          ))}
        </div>

        {/* Papers table */}
        <div className="surface overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Papers ({total})</h2>
            <div className="flex-1" />
            {/* Search */}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search papers…"
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-44 focus:outline-none focus:border-[#7A1B2E]/40 focus:ring-1 focus:ring-[#7A1B2E]/20"
            />
            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#7A1B2E]/40 bg-white"
            >
              <option value="all">All Status</option>
              <option value="uploaded">Uploaded</option>
              <option value="processing">Processing</option>
              <option value="validation_ready">Validation Ready</option>
              <option value="extracting">AI Extracting</option>
              <option value="awaiting_review">Awaiting Review</option>
              <option value="ready_to_promote">Ready for DB</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#7A1B2E]/40 bg-white"
            >
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Sort: Oldest</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[2fr_56px_1fr_1fr_100px_140px] gap-3 px-5 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <span>Paper</span>
            <span>Pages</span>
            <span>Pipeline Progress</span>
            <span>Current Stage</span>
            <span>Last Updated</span>
            <span>Action</span>
          </div>

          {/* Rows */}
          {displayed.length === 0 ? (
            <div className="text-center py-16">
              <FileText size={28} className="text-slate-200 mx-auto mb-3" strokeWidth={1} />
              <p className="text-sm text-slate-400 mb-4">
                {papers.length === 0 ? 'No papers yet' : 'No papers match the filter'}
              </p>
              {papers.length === 0 && (
                <Link to={`/projects/${pid}/upload`} className="btn-primary text-xs">
                  <Upload size={13} /> Upload PDFs
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {displayed.map((paper) => {
                const badge = BADGE_META[paper.badge] ?? BADGE_META.uploaded
                return (
                  <div
                    key={paper.id}
                    className="grid grid-cols-[2fr_56px_1fr_1fr_100px_140px] gap-3 items-center px-5 py-4 hover:bg-slate-50/60 transition-colors group"
                  >
                    {/* Paper name + badge */}
                    <div className="min-w-0">
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                          <FileText size={13} className="text-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2">
                            {paper.original_name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={clsx(
                              'inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold border',
                              badge.cls,
                            )}>
                              {paper.stages.docling === 'running' && <Loader2 size={8} className="animate-spin mr-0.5" />}
                              {badge.label}
                            </span>
                            {paper.counts.assets > 0 && (
                              <span className="text-[9px] text-slate-400">
                                {paper.counts.assets} assets · {paper.counts.charts} charts
                              </span>
                            )}
                          </div>
                          {/* Progress bar */}
                          <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden w-full max-w-[180px]">
                            <div
                              className={clsx(
                                'h-full rounded-full transition-all',
                                paper.badge === 'failed' ? 'bg-red-400' :
                                paper.badge === 'completed' ? 'bg-emerald-500' :
                                paper.badge === 'processing' ? 'bg-blue-400' : 'bg-violet-400',
                              )}
                              style={{ width: `${paper.progress_pct}%` }}
                            />
                          </div>
                          <p className="text-[9px] text-slate-300 mt-0.5">
                            Uploaded {paper.uploaded_at ? new Date(paper.uploaded_at).toLocaleDateString() : '—'} {paper.page_count > 0 ? `· ${paper.page_count} pages` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Pages */}
                    <div className="text-xs text-slate-500 font-medium">{paper.page_count || '—'}</div>

                    {/* Pipeline stages */}
                    <div className="overflow-hidden">
                      <PipelineBar stages={paper.stages} />
                    </div>

                    {/* Current stage */}
                    <CurrentStageLabel paper={paper} />

                    {/* Last updated */}
                    <div className="text-[10px] text-slate-400">
                      {paper.uploaded_at
                        ? new Date(paper.uploaded_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </div>

                    {/* Action */}
                    <div className="flex items-center gap-1">
                      <PrimaryAction paper={paper} pid={pid} />
                      {/* Delete menu */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === paper.id ? null : paper.id)}
                          className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                        {openMenuId === paper.id && (
                          <div className="absolute right-0 top-full mt-1 surface shadow-lg py-1 z-20 w-36">
                            <Link
                              to={`/projects/${pid}/papers/${paper.id}/overview`}
                              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <Layers size={11} /> Open Pipeline
                            </Link>
                            {paper.counts.assets > 0 && (
                              <Link
                                to={`/projects/${pid}/papers/${paper.id}/docling`}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <Layers size={11} /> Docling Results
                              </Link>
                            )}
                            {paper.counts.charts > 0 && (
                              <Link
                                to={`/projects/${pid}/papers/${paper.id}/charts`}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <BarChart3 size={11} /> View Charts
                              </Link>
                            )}
                            <button
                              onClick={() => { setOpenMenuId(null); handleDelete(paper.id, paper.original_name) }}
                              className="flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 w-full text-left"
                            >
                              <Trash2 size={11} /> Delete Paper
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/50">
            <p className="text-[10px] text-slate-400">
              Showing {displayed.length} of {total} paper{total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* ── Right sidebar ────────────────────────────────────────────────── */}
      <div className="w-64 shrink-0 space-y-4">

        {/* Pipeline overview donut */}
        <div className="surface p-4">
          <h3 className="text-xs font-bold text-slate-700 mb-4">Pipeline Overview</h3>
          <DonutChart total={total} segments={segments} />
        </div>

        {/* Quick actions */}
        <div className="surface p-4">
          <h3 className="text-xs font-bold text-slate-700 mb-3">Quick Actions</h3>
          <div className="space-y-1">
            {[
              { label: 'Upload PDFs',          to: `/projects/${pid}/upload`,     Icon: Upload },
              { label: 'View Extraction Jobs', to: `/projects/${pid}/jobs`,       Icon: Clock },
              { label: 'Open Validation Queue',to: `/projects/${pid}/validation`, Icon: ShieldCheck },
              { label: 'Extraction Review',    to: `/projects/${pid}/review`,     Icon: Eye },
              { label: 'Scientific Database',  to: `/projects/${pid}/dataset`,    Icon: BarChart2 },
            ].map(({ label, to, Icon }) => (
              <Link
                key={label}
                to={to}
                className="flex items-center justify-between px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Icon size={12} className="text-slate-400" />
                  {label}
                </div>
                <ChevronRight size={10} className="text-slate-300 group-hover:text-slate-500" />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="surface p-4">
          <h3 className="text-xs font-bold text-slate-700 mb-3">Recent Activity</h3>
          {recent.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-4">No papers yet</p>
          ) : (
            <div className="space-y-3">
              {recent.map((p) => {
                const badge = BADGE_META[p.badge] ?? BADGE_META.uploaded
                return (
                  <div key={p.id} className="flex items-start gap-2">
                    <div className={clsx(
                      'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                      p.badge === 'completed' ? 'bg-emerald-50' :
                      p.badge === 'failed'    ? 'bg-red-50' :
                      p.badge === 'processing'? 'bg-blue-50' : 'bg-slate-100',
                    )}>
                      <StageIcon status={p.badge === 'completed' ? 'completed' : p.badge === 'failed' ? 'failed' : p.badge === 'processing' ? 'running' : 'not_started'} size={11} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-slate-700 truncate leading-snug">
                        {p.original_name}
                      </p>
                      <p className="text-[10px] text-slate-400">{badge.label}</p>
                    </div>
                    <span className="text-[9px] text-slate-300 shrink-0 mt-0.5">
                      {p.uploaded_at
                        ? (() => {
                            const diff = Date.now() - new Date(p.uploaded_at).getTime()
                            const min = Math.floor(diff / 60000)
                            if (min < 60) return `${min} min ago`
                            const hr = Math.floor(min / 60)
                            if (hr < 24) return `${hr} hr ago`
                            return `${Math.floor(hr / 24)} d ago`
                          })()
                        : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Close open menus on outside click */}
      {openMenuId !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}
    </div>
  )
}

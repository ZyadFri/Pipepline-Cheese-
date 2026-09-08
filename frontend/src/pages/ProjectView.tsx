import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Download,
  Eye,
  FileText,
  Grid2X2,
  Library,
  List,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Table2,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { papersApi, projectsApi } from '../services/api'
import AuthImage from '../components/AuthImage'
import type { Project } from '../types'

const CHEESE_HERO = 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=1600&q=84'
const PAGE_SIZE = 10

type StageStatus =
  | 'not_started'
  | 'running'
  | 'completed'
  | 'failed'
  | 'unavailable'
  | 'no_charts'
  | 'ready'
  | 'pending'
  | 'partial'

interface PaperStages {
  docling: StageStatus
  assets: StageStatus
  charts: StageStatus
  validation: StageStatus
  llm: StageStatus
  review: StageStatus
  promotion: StageStatus
}

interface PaperMetadata {
  title?: string | null
  authors?: string[]
  publication_year?: number | null
  journal?: string | null
  abstract?: string | null
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
  counts: {
    assets: number
    tables: number
    charts: number
    rows: number
    approved_rows: number
  }
  metadata?: PaperMetadata
  ws_result: Record<string, unknown>
  ws_job_id: number | null
  llm_job_id: number | null
}

type DashboardFilter = 'all' | 'completed' | 'processing' | 'review' | 'failed' | 'not_started'
type SortKey = 'newest' | 'oldest' | 'name'
type ViewMode = 'list' | 'compact'

type MetricTone = 'rose' | 'green' | 'amber' | 'violet' | 'neutral'

const BADGE_META: Record<string, { label: string; cls: string; dot: string }> = {
  uploaded: {
    label: 'Not started',
    cls: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
  processing: {
    label: 'Processing',
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  validation_ready: {
    label: 'Evidence ready',
    cls: 'bg-violet-50 text-violet-700 border-violet-200',
    dot: 'bg-violet-500',
  },
  extracting: {
    label: 'Extracting data',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  awaiting_review: {
    label: 'Needs review',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  ready_to_promote: {
    label: 'Ready for database',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  completed: {
    label: 'Completed',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  failed: {
    label: 'Failed',
    cls: 'bg-red-50 text-red-600 border-red-200',
    dot: 'bg-red-500',
  },
}

function stripPdf(name: string) {
  return name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function relativeTime(value: string | null | undefined) {
  if (!value) return '—'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return '—'
  const diff = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days} d ago`
  return formatDate(value)
}

function authorsLine(metadata?: PaperMetadata) {
  const authors = metadata?.authors ?? []
  if (!authors.length) return null
  const visible = authors.slice(0, 3).join(', ')
  return authors.length > 3 ? `${visible} +${authors.length - 3}` : visible
}

function userFilterForBadge(badge: string): DashboardFilter {
  if (badge === 'completed') return 'completed'
  if (['processing', 'extracting'].includes(badge)) return 'processing'
  if (['validation_ready', 'awaiting_review', 'ready_to_promote'].includes(badge)) return 'review'
  if (badge === 'failed') return 'failed'
  return 'not_started'
}

function stageCopy(paper: PaperPipeline) {
  const s = paper.stages
  if (s.docling === 'running') return { title: 'Reading paper', detail: 'Evidence is appearing progressively' }
  if (s.docling === 'failed') return { title: 'Paper analysis failed', detail: 'Open the paper to retry' }
  if (s.docling === 'not_started') return { title: 'Ready to analyze', detail: 'Open the paper to begin' }
  if (s.llm === 'running') return { title: 'Extracting structured data', detail: `${paper.counts.tables} table${paper.counts.tables === 1 ? '' : 's'} already available` }
  if (s.review === 'pending' || s.review === 'partial') {
    const left = Math.max(0, paper.counts.rows - paper.counts.approved_rows)
    return { title: 'Review required', detail: `${left} row${left === 1 ? '' : 's'} still need review` }
  }
  if (s.review === 'completed' && s.promotion === 'not_started') return { title: 'Ready for database', detail: 'Reviewed results can be added' }
  if (s.promotion === 'completed') return { title: 'Completed', detail: 'Structured results are in the database' }
  if (s.validation === 'ready') return { title: 'Evidence ready', detail: 'Tables, figures and text are ready' }
  return { title: 'Paper analyzed', detail: `${paper.counts.assets} evidence items found` }
}

function StageStatusIcon({ paper, size = 13 }: { paper: PaperPipeline; size?: number }) {
  if (paper.badge === 'completed') return <CheckCircle2 size={size} className="text-emerald-500" />
  if (paper.badge === 'failed') return <AlertCircle size={size} className="text-red-500" />
  if (['processing', 'extracting'].includes(paper.badge)) return <Loader2 size={size} className="animate-spin text-blue-500" />
  return <Clock3 size={size} className="text-amber-500" />
}

function PaperCover({ pid, paper }: { pid: number; paper: PaperPipeline }) {
  const [loaded, setLoaded] = useState(false)
  const src = `${api.defaults.baseURL}/projects/${pid}/papers/${paper.id}/pages/1/image`

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[16px] border border-[#eadde1] bg-[linear-gradient(145deg,#fff,#f7edef)] shadow-[0_20px_35px_-30px_rgba(73,22,39,.75)]">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#bba9af]">
        <FileText size={30} strokeWidth={1.25} />
        <span className="text-[10px] font-medium">First page</span>
      </div>
      <AuthImage
        src={src}
        alt={`First page of ${paper.original_name}`}
        className={clsx(
          'absolute inset-0 h-full w-full bg-white object-cover object-top transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        onLoad={() => setLoaded(true)}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white/90 via-white/55 to-transparent" />
      <div className="absolute bottom-2 left-2 rounded-full border border-white/80 bg-white/95 px-2 py-1 text-[9px] font-semibold text-slate-500 shadow-sm backdrop-blur">
        Page 1{paper.page_count ? ` of ${paper.page_count}` : ''}
      </div>
    </div>
  )
}

function PrimaryAction({ paper, pid }: { paper: PaperPipeline; pid: number }) {
  const navigate = useNavigate()
  const s = paper.stages

  let label = 'Open paper'
  let to: string | null = `/projects/${pid}/papers/${paper.id}/overview`
  let primary = true

  if (s.docling === 'not_started') label = 'Start analysis'
  else if (s.docling === 'running') {
    label = 'View live progress'
    primary = false
  } else if (s.docling === 'failed') label = 'Retry analysis'
  else if (s.llm === 'running') {
    label = 'View extraction'
    primary = false
  } else if (s.review === 'pending' || s.review === 'partial') {
    label = 'Review results'
    to = `/projects/${pid}/validation?paperId=${paper.id}`
  } else if (s.review === 'completed' && s.promotion === 'not_started') {
    label = 'Add to database'
    to = null
  } else if (s.promotion === 'completed') {
    label = 'Open results'
    to = `/projects/${pid}/dataset`
  } else if (s.validation === 'ready' || s.llm === 'not_started') {
    label = 'Review evidence'
    to = `/projects/${pid}/papers/${paper.id}/docling`
  }

  const className = clsx(
    'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[11px] font-semibold transition-all',
    primary
      ? 'bg-[#8a1730] text-white shadow-[0_14px_28px_-18px_rgba(122,27,46,.85)] hover:-translate-y-px hover:bg-[#721326]'
      : 'border border-[#eadde1] bg-white text-[#76182c] hover:-translate-y-px hover:bg-[#fff8fa]',
  )

  if (to) {
    return (
      <Link to={to} className={className}>
        {label} <ChevronRight size={12} />
      </Link>
    )
  }

  return (
    <button
      className={className}
      onClick={async () => {
        try {
          const result = await projectsApi.promoteCanonical(pid)
          const created =
            (result.ext_pipeline?.observations_created ?? 0) +
            (result.ext_pipeline?.observations_updated ?? 0)
          toast.success(created ? `Added ${created} observation(s) to the database` : 'Database is already up to date')
          navigate(`/projects/${pid}/dataset`)
        } catch {
          toast.error('Could not add results to the database')
        }
      }}
    >
      {label} <ArrowUpRight size={12} />
    </button>
  )
}

function DonutChart({
  total,
  segments,
}: {
  total: number
  segments: { label: string; count: number; color: string }[]
}) {
  const r = 39
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <div>
      <div className="relative mx-auto h-[132px] w-[132px]">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#f3edef" strokeWidth="10" />
          {total > 0 &&
            segments
              .filter((segment) => segment.count > 0)
              .map((segment) => {
                const dash = (segment.count / total) * circumference
                const node = (
                  <circle
                    key={segment.label}
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="10"
                    strokeLinecap="butt"
                    strokeDasharray={`${dash} ${circumference}`}
                    strokeDashoffset={-offset}
                  />
                )
                offset += dash
                return node
              })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[31px] leading-none text-[#241a1e]">{total}</span>
          <span className="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.13em] text-slate-400">Papers</span>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-3 text-[10.5px]">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: segment.color }} />
              {segment.label}
            </span>
            <span className="font-semibold text-slate-400">
              {segment.count} {total ? `(${Math.round((segment.count / total) * 100)}%)` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  progress,
}: {
  label: string
  value: string | number
  detail: string
  icon: React.ElementType
  tone: MetricTone
  progress?: number
}) {
  const toneMap: Record<MetricTone, { card: string; icon: string; accent: string }> = {
    rose: {
      card: 'from-[#fffefe] to-[#fff8fa]',
      icon: 'bg-[#fff0f4] text-[#9b1f3c]',
      accent: 'bg-[#9b1f3c]',
    },
    green: {
      card: 'from-[#fff] to-[#f8fffb]',
      icon: 'bg-[#edf9f3] text-[#14865b]',
      accent: 'bg-[#149868]',
    },
    amber: {
      card: 'from-[#fff] to-[#fffaf2]',
      icon: 'bg-[#fff5df] text-[#b87513]',
      accent: 'bg-[#d79631]',
    },
    violet: {
      card: 'from-[#fff] to-[#faf8ff]',
      icon: 'bg-[#f2efff] text-[#6253b3]',
      accent: 'bg-[#7766c8]',
    },
    neutral: {
      card: 'from-[#fff] to-[#fbfbfc]',
      icon: 'bg-[#f6f3f4] text-[#6b5960]',
      accent: 'bg-[#7c6970]',
    },
  }
  const colors = toneMap[tone]

  return (
    <div className={clsx(
      'group relative min-h-[146px] overflow-hidden rounded-[18px] border border-[#ebe2e5] bg-gradient-to-br p-4 shadow-[0_16px_38px_-34px_rgba(70,20,37,.55)] transition-all hover:-translate-y-0.5 hover:border-[#dbc5cc] hover:shadow-[0_24px_48px_-36px_rgba(70,20,37,.7)]',
      colors.card,
    )}>
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.105em] text-[#8290aa]">{label}</p>
          <p className="mt-3 font-display text-[31px] leading-none text-[#21191c]">{value}</p>
        </div>
        <div className={clsx('flex h-10 w-10 items-center justify-center rounded-[14px]', colors.icon)}>
          <Icon size={17} strokeWidth={1.85} />
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-[#f0eaec]">
          <div className={clsx('h-full rounded-full transition-all', colors.accent)} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
      <p className="mt-2.5 max-w-[180px] text-[10.5px] leading-snug text-[#7f8ca4]">{detail}</p>
    </div>
  )
}

function ProgressMark({ done, active }: { done: boolean; active?: boolean }) {
  if (done) {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
        <CheckCircle2 size={11} strokeWidth={3} />
      </span>
    )
  }
  if (active) {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-50 text-blue-500">
        <Loader2 size={10} className="animate-spin" />
      </span>
    )
  }
  return <span className="h-4 w-4 rounded-full border border-[#ded4d7] bg-white" />
}

function PaperProgress({ paper }: { paper: PaperPipeline }) {
  const doclingDone = paper.stages.docling === 'completed'
  const doclingActive = paper.stages.docling === 'running'
  const chartsDone = ['completed', 'no_charts', 'unavailable'].includes(paper.stages.charts)
  const chartsActive = paper.stages.charts === 'running'
  const rowsDone = paper.counts.rows > 0 || paper.stages.llm === 'completed'
  const rowsActive = paper.stages.llm === 'running'
  const reviewDone = paper.stages.review === 'completed' || paper.stages.promotion === 'completed'
  const reviewActive = ['pending', 'partial'].includes(paper.stages.review)

  const steps = [
    { label: 'PDF processed', done: doclingDone, active: doclingActive },
    { label: `Tables inspected (${paper.counts.tables})`, done: doclingDone, active: doclingActive },
    { label: `Figures analyzed (${paper.counts.charts})`, done: chartsDone, active: chartsActive },
    { label: `Structured rows (${paper.counts.rows})`, done: rowsDone, active: rowsActive },
    {
      label: paper.stages.promotion === 'completed' ? 'Added to database' : paper.counts.rows ? 'Ready for review' : 'Review pending',
      done: reviewDone || paper.stages.promotion === 'completed',
      active: reviewActive,
    },
  ]

  return (
    <div className="rounded-[16px] bg-[linear-gradient(145deg,#fbfcfe,#fff)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-semibold text-slate-700">Extraction progress</p>
        <span className="text-[10px] font-bold text-slate-600">{paper.progress_pct}%</span>
      </div>
      <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-[#e8edf2]">
        <div
          className={clsx(
            'h-full rounded-full transition-all',
            paper.badge === 'failed' ? 'bg-red-400' : paper.badge === 'completed' ? 'bg-emerald-500' : 'bg-[#8b1730]',
          )}
          style={{ width: `${paper.progress_pct}%` }}
        />
      </div>
      <div className="mt-3.5 space-y-2">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2 text-[10px] text-slate-600">
            <ProgressMark done={step.done} active={step.active} />
            <span>{step.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2 border-t border-[#edf0f3] pt-3 text-[9.5px] text-slate-400">
        <CalendarDays size={12} className="mt-0.5 shrink-0" />
        <span>Uploaded {formatDateTime(paper.uploaded_at)}</span>
      </div>
    </div>
  )
}

function PaperCard({
  paper,
  pid,
  compact,
  menuOpen,
  onToggleMenu,
  onDelete,
}: {
  paper: PaperPipeline
  pid: number
  compact: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onDelete: () => void
}) {
  const metadata = paper.metadata
  const title = metadata?.title?.trim() || stripPdf(paper.original_name)
  const authorText = authorsLine(metadata)
  const badge = BADGE_META[paper.badge] ?? BADGE_META.uploaded
  const reviewRemaining = Math.max(0, paper.counts.rows - paper.counts.approved_rows)

  return (
    <article className="group relative overflow-visible rounded-[20px] border border-[#e9e0e3] bg-white p-3.5 shadow-[0_16px_42px_-38px_rgba(64,19,36,.55)] transition-all hover:-translate-y-[1px] hover:border-[#dbc7ce] hover:shadow-[0_25px_55px_-38px_rgba(64,19,36,.72)]">
      <div className={clsx(
        'grid gap-5',
        compact
          ? 'grid-cols-[110px_minmax(0,1fr)_auto]'
          : 'grid-cols-[154px_minmax(0,1fr)_238px]',
      )}>
        <Link to={`/projects/${pid}/papers/${paper.id}/overview`} className={clsx('block', compact ? 'h-[146px]' : 'h-[220px]')}>
          <PaperCover pid={pid} paper={paper} />
        </Link>

        <div className="min-w-0 py-1.5">
          <div className="flex items-center gap-2">
            <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9.5px] font-bold', badge.cls)}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', badge.dot)} />
              {badge.label}
            </span>
            {paper.progress_pct > 0 && paper.progress_pct < 100 && (
              <span className="text-[10px] font-semibold text-slate-400">{paper.progress_pct}%</span>
            )}
          </div>

          <Link to={`/projects/${pid}/papers/${paper.id}/overview`} className="mt-2.5 block">
            <h3 className={clsx(
              'font-display font-semibold leading-[1.1] text-[#251a1e] transition-colors group-hover:text-[#7A1B2E]',
              compact ? 'text-[18px]' : 'text-[22px]',
            )}>
              {title}
            </h3>
          </Link>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[#75839b]">
            {authorText && (
              <span className="inline-flex items-center gap-1.5">
                <UserRound size={12} /> {authorText}
              </span>
            )}
            {metadata?.journal && (
              <span className="inline-flex items-center gap-1.5">
                <BookOpen size={12} /> {metadata.journal}
              </span>
            )}
            {metadata?.publication_year && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={12} /> {metadata.publication_year}
              </span>
            )}
            {!authorText && !metadata?.journal && !metadata?.publication_year && (
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <FileText size={12} /> {paper.original_name}
              </span>
            )}
          </div>

          {!compact && metadata?.abstract && (
            <p className="mt-3.5 line-clamp-3 max-w-3xl text-[11px] leading-[1.55] text-[#67758c]">
              {metadata.abstract}
            </p>
          )}

          <div className={clsx('flex flex-wrap gap-2', compact ? 'mt-3' : 'mt-4')}>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f6f8fa] px-2.5 py-1.5 text-[10px] text-[#67758c]">
              <FileText size={11} /> <strong className="font-semibold text-slate-700">{paper.page_count || '—'}</strong> pages
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#fff7f8] px-2.5 py-1.5 text-[10px] text-[#67758c]">
              <Table2 size={11} className="text-[#9a2940]" /> <strong className="font-semibold text-slate-700">{paper.counts.tables}</strong> tables
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#fff7f8] px-2.5 py-1.5 text-[10px] text-[#67758c]">
              <BarChart3 size={11} className="text-[#9a2940]" /> <strong className="font-semibold text-slate-700">{paper.counts.charts}</strong> charts
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#fff7f8] px-2.5 py-1.5 text-[10px] text-[#67758c]">
              <Database size={11} className="text-[#9a2940]" /> <strong className="font-semibold text-slate-700">{paper.counts.rows}</strong> rows
            </span>
            {reviewRemaining > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-700">
                <ShieldCheck size={11} /> {reviewRemaining} to review
              </span>
            )}
          </div>
        </div>

        <div className={clsx('min-w-0', compact ? 'flex items-center justify-end' : 'flex flex-col justify-between')}>
          {!compact && <PaperProgress paper={paper} />}

          <div className={clsx('flex items-center justify-end gap-1.5', compact ? '' : 'mt-3')}>
            <PrimaryAction paper={paper} pid={pid} />
            <div className="relative">
              <button
                onClick={onToggleMenu}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#eadde1] bg-white text-slate-400 transition-colors hover:bg-[#fff8fa] hover:text-[#7A1B2E]"
                aria-label="Paper actions"
              >
                <MoreHorizontal size={14} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-xl border border-[#eadde1] bg-white py-1.5 shadow-xl">
                  <Link to={`/projects/${pid}/papers/${paper.id}/overview`} className="flex items-center gap-2 px-3 py-2 text-[11px] text-slate-600 hover:bg-slate-50">
                    <Eye size={12} /> Open paper
                  </Link>
                  {paper.counts.tables > 0 && (
                    <Link to={`/projects/${pid}/papers/${paper.id}/docling`} className="flex items-center gap-2 px-3 py-2 text-[11px] text-slate-600 hover:bg-slate-50">
                      <Table2 size={12} /> View evidence
                    </Link>
                  )}
                  {paper.counts.charts > 0 && (
                    <Link to={`/projects/${pid}/papers/${paper.id}/charts`} className="flex items-center gap-2 px-3 py-2 text-[11px] text-slate-600 hover:bg-slate-50">
                      <BarChart3 size={12} /> View charts
                    </Link>
                  )}
                  <button onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-red-500 hover:bg-red-50">
                    <Trash2 size={12} /> Delete paper
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function ActivityBars({ papers }: { papers: PaperPipeline[] }) {
  const data = useMemo(() => {
    const timestamps = papers
      .map((paper) => (paper.uploaded_at ? new Date(paper.uploaded_at).getTime() : NaN))
      .filter((value) => Number.isFinite(value)) as number[]
    const anchor = new Date(Math.max(Date.now(), ...timestamps, Date.now()))
    anchor.setHours(12, 0, 0, 0)

    const buckets = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(anchor)
      date.setDate(anchor.getDate() - (6 - index))
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      return {
        key,
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: 0,
      }
    })

    papers.forEach((paper) => {
      if (!paper.uploaded_at) return
      const date = new Date(paper.uploaded_at)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      const bucket = buckets.find((item) => item.key === key)
      if (bucket) bucket.count += 1
    })
    return buckets
  }, [papers])

  const max = Math.max(1, ...data.map((item) => item.count))

  return (
    <div className="mt-4 border-t border-[#f0e8ea] pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[9.5px] font-semibold text-slate-500">Paper activity · last 7 days</p>
        <p className="text-[9px] text-slate-400">uploads</p>
      </div>
      <div className="flex h-[74px] items-end gap-2">
        {data.map((item) => (
          <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <div className="flex h-11 w-full items-end justify-center rounded-md bg-[#faf7f8] px-1">
              <div
                className="w-full max-w-[18px] rounded-t-[4px] bg-gradient-to-t from-[#149868] to-[#34b982] transition-all"
                style={{ height: item.count ? `${Math.max(16, (item.count / max) * 100)}%` : '3px', opacity: item.count ? 1 : 0.18 }}
              />
            </div>
            <span className="truncate text-[8px] text-slate-400">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResearchBanner() {
  return (
    <section className="relative min-h-[108px] overflow-hidden rounded-[22px] border border-[#eadde1] bg-[#fff9fa] shadow-[0_16px_40px_-34px_rgba(70,20,37,.5)]">
      <div
        className="absolute inset-y-0 right-0 w-[58%] bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(90deg,rgba(255,249,250,1) 0%,rgba(255,249,250,.38) 48%,rgba(255,249,250,.04) 100%),url(${CHEESE_HERO})` }}
      />
      <div className="relative flex min-h-[108px] items-center gap-5 px-6 py-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#ead8de] bg-white text-[#8b1730] shadow-sm">
          <Library size={25} />
        </div>
        <div>
          <h3 className="font-display text-[21px] font-semibold leading-tight text-[#7A1B2E]">Turning research into better evidence.</h3>
          <p className="mt-1 text-[10.5px] text-[#7c899d]">Curated papers. Structured data. Traceable scientific results.</p>
        </div>
      </div>
    </section>
  )
}

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [papers, setPapers] = useState<PaperPipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<DashboardFilter>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    try {
      const [projectResult, paperResult] = await Promise.all([
        projectsApi.get(pid),
        papersApi.pipelineStatus(pid),
      ])
      setProject(projectResult)
      setPapers(paperResult)
    } catch {
      toast.error('Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [pid])

  useEffect(() => {
    load()
    const interval = window.setInterval(() => {
      setPapers((current) => {
        if (current.some((paper) => ['processing', 'extracting'].includes(paper.badge))) load()
        return current
      })
    }, 5000)
    return () => window.clearInterval(interval)
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [filter, search, sort])

  const handleDelete = async (paper: PaperPipeline) => {
    if (!window.confirm(`Delete “${paper.metadata?.title || stripPdf(paper.original_name)}”?`)) return
    try {
      await papersApi.delete(pid, paper.id)
      setPapers((current) => current.filter((item) => item.id !== paper.id))
      setOpenMenuId(null)
      toast.success('Paper deleted')
    } catch {
      toast.error('Failed to delete paper')
    }
  }

  const stats = useMemo(() => {
    const total = papers.length
    const structuredRows = papers.reduce((sum, paper) => sum + paper.counts.rows, 0)
    const tables = papers.reduce((sum, paper) => sum + paper.counts.tables, 0)
    const reviewRows = papers.reduce((sum, paper) => sum + Math.max(0, paper.counts.rows - paper.counts.approved_rows), 0)
    const averageProgress = total
      ? Math.round(papers.reduce((sum, paper) => sum + paper.progress_pct, 0) / total)
      : 0
    return { total, structuredRows, tables, reviewRows, averageProgress }
  }, [papers])

  const filterCounts = useMemo(() => {
    const result: Record<DashboardFilter, number> = {
      all: papers.length,
      completed: 0,
      processing: 0,
      review: 0,
      failed: 0,
      not_started: 0,
    }
    papers.forEach((paper) => {
      result[userFilterForBadge(paper.badge)] += 1
    })
    return result
  }, [papers])

  const displayed = useMemo(() => {
    const query = search.trim().toLowerCase()
    let result = papers.filter((paper) => {
      const matchesFilter = filter === 'all' || userFilterForBadge(paper.badge) === filter
      if (!matchesFilter) return false
      if (!query) return true
      const metadata = paper.metadata
      const haystack = [
        paper.original_name,
        metadata?.title,
        metadata?.journal,
        metadata?.publication_year,
        ...(metadata?.authors ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })

    if (sort === 'name') {
      result = [...result].sort((a, b) => (a.metadata?.title || a.original_name).localeCompare(b.metadata?.title || b.original_name))
    } else if (sort === 'oldest') {
      result = [...result].sort((a, b) => (a.uploaded_at ?? '').localeCompare(b.uploaded_at ?? ''))
    } else {
      result = [...result].sort((a, b) => (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? ''))
    }
    return result
  }, [filter, papers, search, sort])

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))
  const visiblePapers = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pipelineSegments = useMemo(
    () => [
      { label: 'Completed', count: filterCounts.completed, color: '#159363' },
      { label: 'In review', count: filterCounts.review, color: '#d99a2f' },
      { label: 'Processing', count: filterCounts.processing, color: '#6478dc' },
      { label: 'Failed', count: filterCounts.failed, color: '#ce4450' },
      { label: 'Not started', count: filterCounts.not_started, color: '#aeb5c0' },
    ],
    [filterCounts],
  )

  const recent = useMemo(
    () => [...papers].sort((a, b) => (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? '')).slice(0, 4),
    [papers],
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#fffdfd]">
        <Loader2 size={24} className="animate-spin text-[#9f7380]" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#fffdfd] text-center">
        <AlertCircle size={30} className="mb-3 text-red-400" />
        <p className="text-sm font-semibold text-slate-700">Project not found</p>
      </div>
    )
  }

  if (papers.length === 0) {
    return (
      <div className="min-h-full bg-[radial-gradient(circle_at_75%_5%,rgba(122,27,46,.08),transparent_28%),#fffdfd] p-6">
        <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#f8ecef] text-[#7A1B2E] shadow-[0_18px_40px_-30px_rgba(122,27,46,.7)]">
            <FileText size={28} strokeWidth={1.4} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9f7380]">{project.name}</p>
          <h1 className="mt-2 font-display text-4xl text-[#281e21]">Build your research library</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
            Upload your first scientific paper. Its first page, tables, figures and structured results will appear here as the analysis progresses.
          </p>
          <Link to={`/projects/${pid}/upload`} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#7A1B2E] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_-20px_rgba(122,27,46,.8)] hover:bg-[#681625]">
            <Upload size={15} /> Upload your first paper
          </Link>
        </div>
      </div>
    )
  }

  const filterTabs: { id: DashboardFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'completed', label: 'Completed' },
    { id: 'processing', label: 'Processing' },
    { id: 'review', label: 'In review' },
    { id: 'failed', label: 'Failed' },
    { id: 'not_started', label: 'Not started' },
  ]

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_72%_-10%,rgba(178,76,100,.07),transparent_30%),linear-gradient(180deg,#fffefe_0%,#fffdfd_45%,#fffafa_100%)] p-4 lg:p-5">
      <div className="mx-auto grid max-w-[1660px] grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_304px]">
        <main className="min-w-0 space-y-4">
          <section className="relative min-h-[164px] overflow-hidden rounded-[22px] border border-[#e9dfe2] bg-white shadow-[0_18px_46px_-40px_rgba(68,18,35,.6)]">
            <div
              className="absolute inset-y-0 right-0 w-[55%] bg-cover bg-center"
              style={{ backgroundImage: `linear-gradient(90deg,#fff 0%,rgba(255,255,255,.82) 20%,rgba(255,255,255,.08) 72%),url(${CHEESE_HERO})` }}
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,1)_0%,rgba(255,255,255,.98)_44%,rgba(255,255,255,.3)_70%,rgba(255,255,255,.06)_100%)]" />
            <div className="pointer-events-none absolute right-[29%] top-6 -rotate-5 font-display text-[19px] italic leading-tight text-[#9f715f]/70">
              From research<br />to better cheese
            </div>

            <div className="relative flex min-h-[164px] flex-col justify-between p-5 lg:p-6">
              <div>
                <nav className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-[#7f8ba0]">
                  <Link to="/" className="hover:text-[#7A1B2E]">Projects</Link>
                  <ChevronRight size={10} />
                  <span className="font-semibold text-slate-600">{project.name}</span>
                </nav>
                <div className="flex items-center gap-2.5">
                  <h1 className="font-display text-[39px] leading-none tracking-tight text-[#21191c]">{project.name}</h1>
                  <span className="rounded-full border border-[#ead7dd] bg-[#fff6f8] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.09em] text-[#8b1730]">Project</span>
                </div>
                {project.description?.trim() && (
                  <p className="mt-2 max-w-[480px] text-[11px] text-[#75839a]">{project.description.trim()}</p>
                )}
                <p className="mt-2 text-[10px] text-[#8090a7]">
                  Created {project.created_at ? formatDate(project.created_at) : '—'} · Updated {project.updated_at ? formatDate(project.updated_at) : '—'}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <Link to={`/projects/${pid}/upload`} className="inline-flex items-center gap-2 rounded-xl bg-[#8b1730] px-5 py-2.5 text-[11px] font-semibold text-white shadow-[0_14px_28px_-17px_rgba(122,27,46,.9)] hover:-translate-y-px hover:bg-[#721326]">
                  <Upload size={13} /> Upload PDFs
                </Link>
                <Link to={`/projects/${pid}/schema`} className="inline-flex items-center gap-2 rounded-xl border border-[#e7dce0] bg-white/95 px-4 py-2.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-[#fff9fa]">
                  <Settings size={13} /> Schema
                </Link>
                <Link to={`/projects/${pid}/validation`} className="inline-flex items-center gap-2 rounded-xl border border-[#e7dce0] bg-white/95 px-4 py-2.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-[#fff9fa]">
                  <Eye size={13} /> Review
                </Link>
                <Link to={`/projects/${pid}/export`} className="inline-flex items-center gap-2 rounded-xl border border-[#e7dce0] bg-white/95 px-4 py-2.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-[#fff9fa]">
                  <Download size={13} /> Export
                </Link>
                <button onClick={load} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e7dce0] bg-white/95 text-slate-400 shadow-sm hover:bg-[#fff8fa] hover:text-[#7A1B2E]" title="Refresh">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <MetricCard label="Papers" value={stats.total} detail="Uploaded research papers" icon={FileText} tone="rose" />
            <MetricCard label="Extraction" value={`${stats.averageProgress}%`} detail="Average pipeline progress" icon={CheckCircle2} tone="rose" progress={stats.averageProgress} />
            <MetricCard label="Structured rows" value={stats.structuredRows.toLocaleString()} detail="Extracted observations across papers" icon={Database} tone="green" />
            <MetricCard label="Tables" value={stats.tables} detail="Native scientific tables detected" icon={Table2} tone="amber" />
            <MetricCard label="Needs review" value={stats.reviewRows.toLocaleString()} detail={stats.reviewRows ? 'Rows waiting for researcher review' : 'No rows currently waiting'} icon={Clock3} tone="violet" />
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[#e9dfe2] bg-white shadow-[0_20px_48px_-42px_rgba(68,18,35,.6)]">
            <div className="border-b border-[#f0e8ea] px-4 py-4 lg:px-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff0f4] text-[#8b1730]">
                    <Library size={18} />
                  </div>
                  <div>
                    <h2 className="font-display text-[25px] leading-none text-[#261d20]">Research papers</h2>
                    <p className="mt-1.5 text-[10.5px] text-[#8290a6]">Explore uploaded papers and inspect extracted evidence, tables, charts and structured results.</p>
                  </div>
                </div>
                <div className="flex-1" />
                <div className="relative min-w-[220px] flex-1 xl:max-w-[340px]">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search title, author, journal…"
                    className="w-full rounded-xl border border-[#e7dce0] bg-[#fffefe] py-2.5 pl-9 pr-3 text-[11px] text-slate-700 outline-none transition focus:border-[#b98593] focus:ring-2 focus:ring-[#7A1B2E]/10"
                  />
                </div>
                <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="rounded-xl border border-[#e7dce0] bg-white px-3 py-2.5 text-[11px] font-medium text-slate-600 outline-none">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Title A–Z</option>
                </select>
                <div className="flex rounded-xl border border-[#e7dce0] bg-[#fffafa] p-1">
                  <button onClick={() => setViewMode('list')} className={clsx('flex h-7 w-7 items-center justify-center rounded-lg', viewMode === 'list' ? 'bg-[#8b1730] text-white shadow-sm' : 'text-slate-400')} title="Detailed list">
                    <List size={13} />
                  </button>
                  <button onClick={() => setViewMode('compact')} className={clsx('flex h-7 w-7 items-center justify-center rounded-lg', viewMode === 'compact' ? 'bg-[#8b1730] text-white shadow-sm' : 'text-slate-400')} title="Compact view">
                    <Grid2X2 size={13} />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex gap-1.5 overflow-x-auto pb-0.5">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id)}
                    className={clsx(
                      'whitespace-nowrap rounded-full px-3.5 py-1.5 text-[10px] font-semibold transition-colors',
                      filter === tab.id
                        ? 'bg-[#8b1730] text-white shadow-[0_6px_14px_-10px_rgba(122,27,46,.8)]'
                        : 'bg-[#f5f6f8] text-[#65738a] hover:bg-[#f1e7ea] hover:text-[#7A1B2E]',
                    )}
                  >
                    {tab.label} <span className={clsx('ml-1', filter === tab.id ? 'text-white/70' : 'text-slate-400')}>{filterCounts[tab.id]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 bg-[#fffefe] p-3 lg:p-4">
              {visiblePapers.length === 0 ? (
                <div className="py-16 text-center">
                  <Search size={24} className="mx-auto mb-3 text-slate-200" />
                  <p className="text-sm font-medium text-slate-500">No papers match this view</p>
                  <button onClick={() => { setSearch(''); setFilter('all') }} className="mt-3 text-[11px] font-semibold text-[#7A1B2E] hover:underline">Clear filters</button>
                </div>
              ) : (
                visiblePapers.map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    pid={pid}
                    compact={viewMode === 'compact'}
                    menuOpen={openMenuId === paper.id}
                    onToggleMenu={() => setOpenMenuId((current) => (current === paper.id ? null : paper.id))}
                    onDelete={() => handleDelete(paper)}
                  />
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e8ea] bg-white px-5 py-3 text-[10px] text-slate-400">
              <span>Showing {visiblePapers.length} of {displayed.length} matching papers</span>
              <div className="flex items-center gap-4">
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-[#eadde1] bg-white text-slate-500 disabled:opacity-35"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#8b1730] px-2 font-semibold text-white">{page}</span>
                    <button
                      disabled={page === totalPages}
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-[#eadde1] bg-white text-slate-500 disabled:opacity-35"
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>
                )}
                <Link to={`/projects/${pid}/papers`} className="font-semibold text-[#7A1B2E] hover:underline">Open full paper library →</Link>
              </div>
            </div>
          </section>

          <ResearchBanner />

          <div className="pb-1 text-center font-display text-[11px] italic text-[#8e7a80]">“Science today. Better evidence tomorrow.”</div>
        </main>

        <aside className="space-y-4">
          <section className="rounded-[22px] border border-[#e9dfe2] bg-white p-4 shadow-[0_18px_40px_-38px_rgba(68,18,35,.6)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-display text-[17px] font-semibold text-[#2c2024]">Pipeline overview</h3>
                <p className="mt-0.5 text-[9.5px] text-[#8290a6]">Live status of paper extraction</p>
              </div>
              <Link to={`/projects/${pid}/jobs`} className="text-[9px] font-semibold text-[#8b1730] hover:underline">View details →</Link>
            </div>
            <DonutChart total={stats.total} segments={pipelineSegments} />
            <ActivityBars papers={papers} />
          </section>

          <section className="rounded-[22px] border border-[#e9dfe2] bg-white p-4 shadow-[0_18px_40px_-38px_rgba(68,18,35,.6)]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[17px] font-semibold text-[#2c2024]">Recent activity</h3>
              <button onClick={load} className="text-[9.5px] font-semibold text-[#8c2038] hover:underline">Refresh</button>
            </div>
            <div className="mt-3 space-y-1">
              {recent.map((paper, index) => {
                const badge = BADGE_META[paper.badge] ?? BADGE_META.uploaded
                return (
                  <Link key={paper.id} to={`/projects/${pid}/papers/${paper.id}/overview`} className="group relative flex gap-3 rounded-xl px-1 py-2.5 hover:bg-[#fffafa]">
                    {index < recent.length - 1 && <span className="absolute left-[11px] top-8 h-[calc(100%-12px)] w-px bg-[#eee4e7]" />}
                    <span className={clsx('relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', paper.badge === 'completed' ? 'bg-emerald-50' : paper.badge === 'failed' ? 'bg-red-50' : 'bg-[#f8eef1]')}>
                      <StageStatusIcon paper={paper} size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[10.5px] font-semibold text-slate-700 group-hover:text-[#7A1B2E]">{paper.metadata?.title || stripPdf(paper.original_name)}</p>
                      <p className="mt-0.5 text-[9.5px] text-slate-400">{badge.label} · uploaded {relativeTime(paper.uploaded_at)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>

          <section className="rounded-[22px] border border-[#e9dfe2] bg-white p-4 shadow-[0_18px_40px_-38px_rgba(68,18,35,.6)]">
            <h3 className="font-display text-[17px] font-semibold text-[#2c2024]">Quick actions</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: 'Upload PDFs', detail: 'Add new papers', to: `/projects/${pid}/upload`, Icon: Upload, cls: 'from-[#fff7fa] to-[#fff0f4] text-[#8b1730]' },
                { label: 'Jobs', detail: 'View background tasks', to: `/projects/${pid}/jobs`, Icon: Clock3, cls: 'from-[#fffaf3] to-[#fff6e9] text-[#9b681d]' },
                { label: 'Review', detail: 'Check extracted data', to: `/projects/${pid}/validation`, Icon: ShieldCheck, cls: 'from-[#f3fff9] to-[#eafaf3] text-[#157a55]' },
                { label: 'Database', detail: 'Browse results', to: `/projects/${pid}/dataset`, Icon: Database, cls: 'from-[#f8f6ff] to-[#f1eeff] text-[#5c4ca8]' },
              ].map(({ label, detail, to, Icon, cls }) => (
                <Link key={label} to={to} className={clsx('flex min-h-[92px] flex-col items-center justify-center rounded-[16px] border border-[#ebe2e5] bg-gradient-to-br px-2 text-center transition-all hover:-translate-y-0.5 hover:shadow-md', cls)}>
                  <Icon size={18} />
                  <span className="mt-2 text-[10.5px] font-semibold text-slate-700">{label}</span>
                  <span className="mt-0.5 text-[9px] font-normal text-slate-400">{detail}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="relative min-h-[112px] overflow-hidden rounded-[22px] border border-[#eadde1] bg-[#fff9fa]">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-65"
              style={{ backgroundImage: `linear-gradient(90deg,rgba(255,249,250,.98),rgba(255,249,250,.72),rgba(255,249,250,.15)),url(${CHEESE_HERO})` }}
            />
            <div className="relative flex min-h-[112px] flex-col justify-center p-4">
              <p className="font-display text-[18px] italic leading-tight text-[#6f2435]">Better research<br />for better food science.</p>
              <div className="mt-2 h-px w-8 bg-[#9b2941]" />
            </div>
          </section>
        </aside>
      </div>

      {openMenuId !== null && <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />}
    </div>
  )
}

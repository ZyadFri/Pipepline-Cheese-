import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Download,
  Eye,
  FileText,
  Grid2X2,
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
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { papersApi, projectsApi } from '../services/api'
import AuthImage from '../components/AuthImage'
import type { Project } from '../types'

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
    cls: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
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
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
  if (s.llm === 'running') return { title: 'Extracting structured data', detail: `${paper.counts.tables} tables already available` }
  if (s.review === 'pending' || s.review === 'partial') {
    const left = Math.max(0, paper.counts.rows - paper.counts.approved_rows)
    return { title: 'Review required', detail: `${left} row${left === 1 ? '' : 's'} still need review` }
  }
  if (s.review === 'completed' && s.promotion === 'not_started') return { title: 'Ready for database', detail: 'Reviewed results can be added' }
  if (s.promotion === 'completed') return { title: 'Completed', detail: 'Structured results are in the database' }
  if (s.validation === 'ready') return { title: 'Evidence ready', detail: 'Tables, figures and text are ready' }
  return { title: 'Paper analyzed', detail: `${paper.counts.assets} evidence items found` }
}

function StageStatusIcon({ paper }: { paper: PaperPipeline }) {
  if (paper.badge === 'completed') return <CheckCircle2 size={13} className="text-emerald-500" />
  if (paper.badge === 'failed') return <AlertCircle size={13} className="text-red-500" />
  if (['processing', 'extracting'].includes(paper.badge)) return <Loader2 size={13} className="animate-spin text-blue-500" />
  return <Clock3 size={13} className="text-amber-500" />
}

function PaperCover({ pid, paper }: { pid: number; paper: PaperPipeline }) {
  const [loaded, setLoaded] = useState(false)
  const src = `${api.defaults.baseURL}/projects/${pid}/papers/${paper.id}/pages/1/image`

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[18px] border border-[#eadde1] bg-[linear-gradient(145deg,#fff,#f7edef)] shadow-[0_18px_36px_-32px_rgba(73,22,39,.6)]">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#bba9af]">
        <FileText size={28} strokeWidth={1.25} />
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white/70 to-transparent" />
      <div className="absolute bottom-2 left-2 rounded-full border border-white/80 bg-white/90 px-2 py-1 text-[9px] font-semibold text-slate-500 shadow-sm backdrop-blur">
        Page 1
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
    primary = false
  } else if (s.validation === 'ready' || s.llm === 'not_started') {
    label = 'Review evidence'
    to = `/projects/${pid}/papers/${paper.id}/docling`
  }

  const className = clsx(
    'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-[11px] font-semibold transition-all',
    primary
      ? 'bg-[#7A1B2E] text-white shadow-[0_10px_24px_-16px_rgba(122,27,46,.8)] hover:bg-[#681625] hover:-translate-y-px'
      : 'border border-[#e6d9dd] bg-white text-[#6f2335] hover:bg-[#fff8fa]',
  )

  if (to) {
    return (
      <Link to={to} className={className}>
        {label} <ChevronRight size={11} />
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
      {label} <ArrowUpRight size={11} />
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
      <div className="relative mx-auto h-32 w-32">
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
          <span className="font-display text-[30px] leading-none text-[#2c2024]">{total}</span>
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.12em] text-slate-400">Papers</span>
        </div>
      </div>
      <div className="mt-4 space-y-2">
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
  accent = false,
  progress,
}: {
  label: string
  value: string | number
  detail: string
  icon: React.ElementType
  accent?: boolean
  progress?: number
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#ece3e6] bg-white p-4 shadow-[0_14px_35px_-32px_rgba(71,21,39,.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_45px_-32px_rgba(71,21,39,.65)]">
      <div className="pointer-events-none absolute -right-5 -top-5 h-20 w-20 rounded-full bg-[#7A1B2E]/[0.035] transition-transform group-hover:scale-125" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400">{label}</p>
          <p className="mt-2 font-display text-[30px] leading-none text-[#271d20]">{value}</p>
        </div>
        <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl', accent ? 'bg-[#7A1B2E] text-white' : 'bg-[#f8eef1] text-[#8c2038]')}>
          <Icon size={17} strokeWidth={1.8} />
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#f1eaec]">
          <div className="h-full rounded-full bg-[#8c2038] transition-all" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
      <p className="mt-2 text-[10.5px] leading-snug text-slate-400">{detail}</p>
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
  const stage = stageCopy(paper)
  const badge = BADGE_META[paper.badge] ?? BADGE_META.uploaded
  const reviewRemaining = Math.max(0, paper.counts.rows - paper.counts.approved_rows)

  return (
    <article className="group relative overflow-visible rounded-[22px] border border-[#ebe1e4] bg-white p-3 shadow-[0_18px_44px_-38px_rgba(64,19,36,.55)] transition-all hover:-translate-y-[1px] hover:border-[#dfcbd1] hover:shadow-[0_24px_50px_-36px_rgba(64,19,36,.7)]">
      <div className={clsx('grid gap-4', compact ? 'grid-cols-[96px_minmax(0,1fr)_auto]' : 'grid-cols-[132px_minmax(0,1fr)_200px]')}>
        <Link to={`/projects/${pid}/papers/${paper.id}/overview`} className={clsx('block', compact ? 'h-[126px]' : 'h-[176px]')}>
          <PaperCover pid={pid} paper={paper} />
        </Link>

        <div className="min-w-0 py-1 pr-1">
          <div className="flex items-center gap-2">
            <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9.5px] font-bold', badge.cls)}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', badge.dot)} />
              {badge.label}
            </span>
            {paper.progress_pct > 0 && paper.progress_pct < 100 && (
              <span className="text-[10px] font-semibold text-slate-400">{paper.progress_pct}%</span>
            )}
          </div>

          <Link to={`/projects/${pid}/papers/${paper.id}/overview`} className="mt-2 block">
            <h3 className={clsx('font-display font-semibold leading-[1.15] text-[#281e21] transition-colors group-hover:text-[#7A1B2E]', compact ? 'text-[17px]' : 'text-[20px]')}>
              {title}
            </h3>
          </Link>

          {(authorText || metadata?.publication_year || metadata?.journal) && (
            <p className="mt-1.5 line-clamp-1 text-[10.5px] text-slate-400">
              {[authorText, metadata?.publication_year, metadata?.journal].filter(Boolean).join(' · ')}
            </p>
          )}

          {!compact && metadata?.abstract && (
            <p className="mt-3 line-clamp-2 max-w-3xl text-[11px] leading-relaxed text-slate-500">
              {metadata.abstract}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5">
              <FileText size={11} className="text-slate-400" /> {paper.page_count || '—'} pages
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5">
              <Table2 size={11} className="text-[#9a2940]" /> {paper.counts.tables} tables
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5">
              <BarChart3 size={11} className="text-[#9a2940]" /> {paper.counts.charts} charts
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5">
              <Database size={11} className="text-[#9a2940]" /> {paper.counts.rows} rows
            </span>
            {reviewRemaining > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-amber-700">
                <ShieldCheck size={11} /> {reviewRemaining} to review
              </span>
            )}
          </div>
        </div>

        <div className={clsx('flex min-w-0', compact ? 'items-center justify-end' : 'flex-col justify-between border-l border-[#f0e8ea] py-1 pl-4')}>
          {!compact && (
            <div>
              <div className="flex items-start gap-2">
                <StageStatusIcon paper={paper} />
                <div>
                  <p className="text-[11px] font-semibold text-slate-700">{stage.title}</p>
                  <p className="mt-0.5 text-[9.5px] leading-snug text-slate-400">{stage.detail}</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#f2ebed]">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    paper.badge === 'failed' ? 'bg-red-400' : paper.badge === 'completed' ? 'bg-emerald-500' : 'bg-[#8c2038]',
                  )}
                  style={{ width: `${paper.progress_pct}%` }}
                />
              </div>
              <p className="mt-2 text-[9.5px] text-slate-400">
                Uploaded {formatDate(paper.uploaded_at)}
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-1.5">
            <PrimaryAction paper={paper} pid={pid} />
            <div className="relative">
              <button
                onClick={onToggleMenu}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-slate-400 transition-colors hover:border-[#eadde1] hover:bg-[#fff8fa] hover:text-[#7A1B2E]"
                aria-label="Paper actions"
              >
                <MoreHorizontal size={14} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-xl border border-[#eadde1] bg-white py-1.5 shadow-xl">
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

  const pipelineSegments = useMemo(
    () => [
      { label: 'Completed', count: filterCounts.completed, color: '#16875d' },
      { label: 'In review', count: filterCounts.review, color: '#d79b34' },
      { label: 'Processing', count: filterCounts.processing, color: '#6b7fd7' },
      { label: 'Failed', count: filterCounts.failed, color: '#c94a4a' },
      { label: 'Not started', count: filterCounts.not_started, color: '#d9cdd1' },
    ],
    [filterCounts],
  )

  const recent = useMemo(
    () => [...papers].sort((a, b) => (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? '')).slice(0, 5),
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
    <div className="min-h-full bg-[radial-gradient(circle_at_72%_-10%,rgba(178,76,100,.08),transparent_30%),linear-gradient(180deg,#fffefe_0%,#fffdfd_46%,#fffafa_100%)] p-5 lg:p-6">
      <div className="mx-auto grid max-w-[1540px] grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_280px]">
        <main className="min-w-0 space-y-5">
          <section className="relative overflow-hidden rounded-[24px] border border-[#ebdfe3] bg-white px-5 py-5 shadow-[0_18px_50px_-44px_rgba(68,18,35,.6)] lg:px-6">
            <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border border-[#7A1B2E]/10" />
            <div className="pointer-events-none absolute right-8 top-0 h-36 w-56 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(#7A1B2E 1px, transparent 1px)', backgroundSize: '12px 12px' }} />

            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <nav className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                  <Link to="/" className="hover:text-[#7A1B2E]">Projects</Link>
                  <ChevronRight size={10} />
                  <span className="text-slate-600">{project.name}</span>
                </nav>
                <div className="flex items-center gap-2.5">
                  <h1 className="font-display text-[38px] leading-none tracking-tight text-[#261d20]">{project.name}</h1>
                  <span className="rounded-full border border-[#e7d6db] bg-[#fff8fa] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#8b3449]">Project</span>
                </div>
                <p className="mt-2 max-w-2xl text-[12px] text-slate-500">
                  {project.description?.trim() || 'Cheese research papers, structured evidence and reviewable scientific data in one workspace.'}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">
                  Created {project.created_at ? formatDate(project.created_at) : '—'} · Updated {project.updated_at ? formatDate(project.updated_at) : '—'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/projects/${pid}/upload`} className="inline-flex items-center gap-2 rounded-xl bg-[#7A1B2E] px-4 py-2.5 text-[11px] font-semibold text-white shadow-[0_12px_26px_-18px_rgba(122,27,46,.8)] hover:bg-[#681625]">
                  <Upload size={13} /> Upload PDFs
                </Link>
                <Link to={`/projects/${pid}/schema`} className="inline-flex items-center gap-2 rounded-xl border border-[#e7dce0] bg-white px-3.5 py-2.5 text-[11px] font-semibold text-slate-700 hover:bg-[#fff9fa]">
                  <Settings size={13} /> Schema
                </Link>
                <Link to={`/projects/${pid}/validation`} className="inline-flex items-center gap-2 rounded-xl border border-[#e7dce0] bg-white px-3.5 py-2.5 text-[11px] font-semibold text-slate-700 hover:bg-[#fff9fa]">
                  <Eye size={13} /> Review
                </Link>
                <Link to={`/projects/${pid}/export`} className="inline-flex items-center gap-2 rounded-xl border border-[#e7dce0] bg-white px-3.5 py-2.5 text-[11px] font-semibold text-slate-700 hover:bg-[#fff9fa]">
                  <Download size={13} /> Export
                </Link>
                <button onClick={load} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-[#fff8fa] hover:text-[#7A1B2E]" title="Refresh">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <MetricCard label="Papers" value={stats.total} detail="Uploaded research papers" icon={FileText} />
            <MetricCard label="Extraction" value={`${stats.averageProgress}%`} detail="Average pipeline progress" icon={CheckCircle2} progress={stats.averageProgress} />
            <MetricCard label="Structured rows" value={stats.structuredRows.toLocaleString()} detail="Extracted observations across papers" icon={Database} accent />
            <MetricCard label="Tables" value={stats.tables} detail="Native scientific tables detected" icon={Table2} />
            <MetricCard label="Needs review" value={stats.reviewRows.toLocaleString()} detail={stats.reviewRows ? 'Rows waiting for researcher review' : 'No rows currently waiting'} icon={ShieldCheck} />
          </section>

          <section className="overflow-hidden rounded-[24px] border border-[#e9dfe2] bg-white shadow-[0_20px_48px_-42px_rgba(68,18,35,.6)]">
            <div className="border-b border-[#f0e8ea] px-4 py-4 lg:px-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div>
                  <h2 className="font-display text-[24px] leading-none text-[#2b2024]">Research papers</h2>
                  <p className="mt-1 text-[10.5px] text-slate-400">Open a paper to inspect live evidence, tables, charts and extracted results.</p>
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
                <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="rounded-xl border border-[#e7dce0] bg-white px-3 py-2.5 text-[11px] text-slate-600 outline-none">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Title A–Z</option>
                </select>
                <div className="flex rounded-xl border border-[#e7dce0] bg-[#fffafa] p-1">
                  <button onClick={() => setViewMode('list')} className={clsx('flex h-7 w-7 items-center justify-center rounded-lg', viewMode === 'list' ? 'bg-white text-[#7A1B2E] shadow-sm' : 'text-slate-400')} title="Comfortable view">
                    <List size={13} />
                  </button>
                  <button onClick={() => setViewMode('compact')} className={clsx('flex h-7 w-7 items-center justify-center rounded-lg', viewMode === 'compact' ? 'bg-white text-[#7A1B2E] shadow-sm' : 'text-slate-400')} title="Compact view">
                    <Grid2X2 size={13} />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex gap-1 overflow-x-auto pb-0.5">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id)}
                    className={clsx(
                      'whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-semibold transition-colors',
                      filter === tab.id ? 'bg-[#7A1B2E] text-white' : 'bg-[#f8f4f5] text-slate-500 hover:bg-[#f2e8eb] hover:text-[#7A1B2E]',
                    )}
                  >
                    {tab.label} <span className={clsx('ml-1', filter === tab.id ? 'text-white/70' : 'text-slate-400')}>{filterCounts[tab.id]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 bg-[#fffdfd] p-3 lg:p-4">
              {displayed.length === 0 ? (
                <div className="py-16 text-center">
                  <Search size={24} className="mx-auto mb-3 text-slate-200" />
                  <p className="text-sm font-medium text-slate-500">No papers match this view</p>
                  <button onClick={() => { setSearch(''); setFilter('all') }} className="mt-3 text-[11px] font-semibold text-[#7A1B2E] hover:underline">Clear filters</button>
                </div>
              ) : (
                displayed.map((paper) => (
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

            <div className="flex items-center justify-between border-t border-[#f0e8ea] bg-white px-5 py-3 text-[10px] text-slate-400">
              <span>Showing {displayed.length} of {stats.total} papers</span>
              <Link to={`/projects/${pid}/papers`} className="font-semibold text-[#7A1B2E] hover:underline">Open full paper library</Link>
            </div>
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-[22px] border border-[#e9dfe2] bg-white p-4 shadow-[0_18px_40px_-38px_rgba(68,18,35,.6)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">Pipeline overview</h3>
              {filterCounts.processing > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live</span>}
            </div>
            <DonutChart total={stats.total} segments={pipelineSegments} />
          </section>

          <section className="rounded-[22px] border border-[#e9dfe2] bg-white p-4 shadow-[0_18px_40px_-38px_rgba(68,18,35,.6)]">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">Recent activity</h3>
              <button onClick={load} className="text-[9.5px] font-semibold text-[#8c2038] hover:underline">Refresh</button>
            </div>
            <div className="mt-4 space-y-1">
              {recent.map((paper, index) => {
                const badge = BADGE_META[paper.badge] ?? BADGE_META.uploaded
                return (
                  <Link key={paper.id} to={`/projects/${pid}/papers/${paper.id}/overview`} className="group relative flex gap-3 rounded-xl px-1 py-2 hover:bg-[#fffafa]">
                    {index < recent.length - 1 && <span className="absolute left-[10px] top-8 h-[calc(100%-14px)] w-px bg-[#eee4e7]" />}
                    <span className={clsx('relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', paper.badge === 'completed' ? 'bg-emerald-50' : paper.badge === 'failed' ? 'bg-red-50' : 'bg-[#f8eef1]')}>
                      <StageStatusIcon paper={paper} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[10.5px] font-semibold text-slate-700 group-hover:text-[#7A1B2E]">{paper.metadata?.title || stripPdf(paper.original_name)}</p>
                      <p className="mt-0.5 text-[9.5px] text-slate-400">{badge.label} · {relativeTime(paper.uploaded_at)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>

          <section className="rounded-[22px] border border-[#e9dfe2] bg-white p-4 shadow-[0_18px_40px_-38px_rgba(68,18,35,.6)]">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">Quick actions</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: 'Upload', to: `/projects/${pid}/upload`, Icon: Upload },
                { label: 'Jobs', to: `/projects/${pid}/jobs`, Icon: Clock3 },
                { label: 'Review', to: `/projects/${pid}/validation`, Icon: ShieldCheck },
                { label: 'Database', to: `/projects/${pid}/dataset`, Icon: Database },
              ].map(({ label, to, Icon }) => (
                <Link key={label} to={to} className="flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-xl border border-[#eee4e7] bg-[#fffdfd] text-[10px] font-semibold text-slate-600 transition-all hover:-translate-y-0.5 hover:border-[#d9bcc5] hover:bg-[#fff8fa] hover:text-[#7A1B2E]">
                  <Icon size={16} className="text-[#9a2940]" /> {label}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {openMenuId !== null && <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />}
    </div>
  )
}
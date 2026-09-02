import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { papersApi } from '../../services/api'
import clsx from 'clsx'
import {
  FileText, RefreshCw, Loader2, Upload, ArrowRight,
  BarChart2, Table2, CheckCircle2, Clock, AlertCircle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaperStatus {
  id: number
  original_name: string
  filename: string
  page_count: number
  uploaded_at: string | null
  badge: string
  progress_pct: number
  stages: {
    docling: string
    assets: string
    charts: string
    validation: string
    llm: string
    review: string
    promotion: string
  }
  counts: { assets: number; charts: number; rows: number; approved_rows: number }
  ws_result: Record<string, unknown>
  ws_job_id: number | null
  llm_job_id: number | null
}

// ─── Badge display ────────────────────────────────────────────────────────────

const BADGE_META: Record<string, { label: string; cls: string }> = {
  uploaded:         { label: 'Uploaded',         cls: 'bg-slate-100 text-slate-500' },
  processing:       { label: 'Processing…',      cls: 'bg-blue-50 text-blue-600' },
  validation_ready: { label: 'Ready to Validate', cls: 'bg-amber-50 text-amber-700' },
  extracting:       { label: 'Extracting…',      cls: 'bg-violet-50 text-violet-600' },
  awaiting_review:  { label: 'Awaiting Review',  cls: 'bg-orange-50 text-orange-600' },
  ready_to_promote: { label: 'Ready to Promote', cls: 'bg-emerald-50 text-emerald-700' },
  completed:        { label: 'Completed',        cls: 'bg-emerald-100 text-emerald-700' },
  failed:           { label: 'Failed',           cls: 'bg-red-50 text-red-600' },
}

// ─── Action logic ─────────────────────────────────────────────────────────────

function primaryAction(paper: PaperStatus, pid: number) {
  const base = `/projects/${pid}/papers/${paper.id}`
  if (paper.badge === 'uploaded') {
    return { label: 'Start Pipeline', to: `${base}/overview`, variant: 'primary' }
  }
  if (paper.badge === 'processing') {
    return { label: 'View Progress', to: `${base}/overview`, variant: 'secondary' }
  }
  if (paper.badge === 'validation_ready') {
    return { label: 'Review Assets', to: `${base}/docling`, variant: 'primary' }
  }
  if (paper.badge === 'extracting') {
    return { label: 'Monitor LLM', to: `${base}/overview`, variant: 'secondary' }
  }
  if (paper.badge === 'awaiting_review') {
    return { label: 'Review Evidence', to: `${base}/review`, variant: 'primary' }
  }
  if (paper.badge === 'ready_to_promote') {
    return { label: 'Promote to DB', to: `${base}/database`, variant: 'primary' }
  }
  if (paper.badge === 'completed') {
    return { label: 'View Results', to: `${base}/database`, variant: 'secondary' }
  }
  return { label: 'Open', to: `${base}/overview`, variant: 'secondary' }
}

// ─── Stage pill ───────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  docling: 'Docling', assets: 'Assets', charts: 'Charts',
  validation: 'Validate', llm: 'LLM', review: 'Review', promotion: 'Promote',
}

const STAGE_CLS: Record<string, string> = {
  completed:     'bg-emerald-100 text-emerald-700',
  running:       'bg-blue-100 text-blue-600',
  failed:        'bg-red-100 text-red-600',
  not_started:   'bg-slate-100 text-slate-300',
  unavailable:   'bg-slate-100 text-slate-300',
  no_charts:     'bg-slate-100 text-slate-300',
  ready:         'bg-amber-100 text-amber-600',
  partial:       'bg-amber-100 text-amber-600',
  pending:       'bg-orange-100 text-orange-600',
}

function StagePills({ stages }: { stages: PaperStatus['stages'] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {Object.entries(STAGE_LABELS).map(([key, label]) => {
        const st = stages[key as keyof typeof stages] ?? 'not_started'
        const cls = STAGE_CLS[st] ?? STAGE_CLS.not_started
        const isDone = st === 'completed'
        const isRunning = st === 'running'
        return (
          <span
            key={key}
            className={clsx('inline-flex items-center gap-0.5 text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full', cls)}
          >
            {isRunning && <Loader2 size={7} className="animate-spin" />}
            {isDone && <CheckCircle2 size={7} />}
            {label}
          </span>
        )
      })}
    </div>
  )
}

// ─── Paper card ───────────────────────────────────────────────────────────────

function PaperCard({ paper, pid }: { paper: PaperStatus; pid: number }) {
  const badge = BADGE_META[paper.badge] ?? BADGE_META.uploaded
  const action = primaryAction(paper, pid)
  const base = `/projects/${pid}/papers/${paper.id}`

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all p-4">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <FileText size={18} className="text-slate-400" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate" title={paper.original_name}>
                {paper.original_name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-400 font-mono">#{paper.id}</span>
                {paper.ws_job_id && (
                  <span className="text-[10px] text-slate-400 font-mono">run #{paper.ws_job_id}</span>
                )}
                {paper.page_count > 0 && (
                  <span className="text-[10px] text-slate-400">{paper.page_count} pages</span>
                )}
                {paper.uploaded_at && (
                  <span className="text-[10px] text-slate-300">
                    {new Date(paper.uploaded_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            {/* Badge + progress */}
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', badge.cls)}>
                {badge.label}
              </span>
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#C8102E] rounded-full transition-all"
                    style={{ width: `${paper.progress_pct}%` }}
                  />
                </div>
                <span className="text-[9px] text-slate-400">{paper.progress_pct}%</span>
              </div>
            </div>
          </div>

          {/* Stage pills */}
          <div className="mt-2.5">
            <StagePills stages={paper.stages} />
          </div>

          {/* Stats row + actions */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-3">
              {paper.counts.assets > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Table2 size={10} /> {paper.counts.assets} assets
                </span>
              )}
              {paper.counts.charts > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <BarChart2 size={10} /> {paper.counts.charts} charts
                </span>
              )}
              {paper.counts.rows > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <CheckCircle2 size={10} /> {paper.counts.approved_rows}/{paper.counts.rows} rows
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {paper.stages.docling === 'completed' && (
                <Link
                  to={`${base}/docling`}
                  className="text-[10px] text-slate-400 hover:text-slate-600 font-medium px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
                >
                  Docling Results
                </Link>
              )}
              {paper.counts.charts > 0 && (
                <Link
                  to={`${base}/charts`}
                  className="text-[10px] text-slate-400 hover:text-slate-600 font-medium px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
                >
                  Charts
                </Link>
              )}
              <Link
                to={action.to}
                className={clsx(
                  'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors',
                  action.variant === 'primary'
                    ? 'bg-[#C8102E] text-white hover:bg-[#a60d26]'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {action.label}
                <ArrowRight size={11} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PapersPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)
  const [papers, setPapers] = useState<PaperStatus[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    papersApi
      .pipelineStatus(pid)
      .then(setPapers)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [pid])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Papers</h1>
          <p className="text-xs text-slate-400 mt-0.5">Select a paper to open its extraction workflow</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <Link
            to={`/projects/${pid}/upload`}
            className="flex items-center gap-1.5 text-xs font-semibold bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a60d26] transition-colors"
          >
            <Upload size={12} /> Upload PDF
          </Link>
        </div>
      </div>

      {loading && papers.length === 0 ? (
        <div className="flex items-center gap-2 text-slate-400 py-10">
          <Loader2 size={14} className="animate-spin" /> Loading papers…
        </div>
      ) : papers.length === 0 ? (
        <div className="text-center py-20">
          <FileText size={48} strokeWidth={1} className="mx-auto mb-4 text-slate-300" />
          <p className="text-base font-semibold text-slate-500">No papers yet</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">Upload PDFs to start extracting data</p>
          <Link
            to={`/projects/${pid}/upload`}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-[#C8102E] text-white px-4 py-2 rounded-lg hover:bg-[#a60d26] transition-colors"
          >
            <Upload size={14} /> Upload Papers
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {papers.map((p) => (
            <PaperCard key={p.id} paper={p} pid={pid} />
          ))}
        </div>
      )}
    </div>
  )
}

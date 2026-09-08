import { Outlet, NavLink, useParams, Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import api, { workspaceApi, papersApi } from '../../services/api'
import type { WorkspaceStatus } from '../../types/workspace'
import {
  ArrowLeft, BarChart2, ShieldCheck, ClipboardList,
  Database, Loader2, LayoutDashboard, Images, Gauge, Zap,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

interface PaperInfo {
  id: number
  original_name: string
  filename: string
  page_count: number
}

interface Tab {
  path: string
  label: string
  Icon: React.ElementType
  enabled: (ws: WorkspaceStatus | null) => boolean
  suffix?: (paperIdNum: number) => string
}

type AnalysisMode = 'standard' | 'fast'

const isEvidenceReady = (ws: WorkspaceStatus | null) =>
  ws?.status === 'completed' || ws?.status === 'partial_success'

const TABS: Tab[] = [
  {
    path: 'overview',
    label: 'Overview',
    Icon: LayoutDashboard,
    enabled: () => true,
  },
  {
    path: 'docling',
    label: 'Evidence',
    Icon: Images,
    enabled: (ws) => isEvidenceReady(ws),
  },
  {
    path: 'charts',
    label: 'Charts',
    Icon: BarChart2,
    enabled: (ws) => isEvidenceReady(ws) && (ws?.result?.charts ?? 0) > 0,
  },
  {
    path: 'validation',
    label: 'Extract data',
    Icon: ShieldCheck,
    enabled: (ws) => isEvidenceReady(ws),
    suffix: (pid) => `?paperId=${pid}`,
  },
  {
    path: 'review',
    label: 'Review',
    Icon: ClipboardList,
    enabled: () => true,
  },
  {
    path: 'database',
    label: 'Database',
    Icon: Database,
    enabled: () => true,
  },
]

function elapsedLabel(ws: WorkspaceStatus | null) {
  if (!ws?.started_at || !ws?.completed_at) return ''
  const ms = new Date(ws.completed_at).getTime() - new Date(ws.started_at).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

function analysisModeOf(ws: WorkspaceStatus | null): AnalysisMode {
  return (ws?.result as any)?.analysis_mode === 'fast' ? 'fast' : 'standard'
}

function WorkspaceBadge({ ws }: { ws: WorkspaceStatus | null }) {
  if (!ws || ws.status === 'not_started') return null

  const mode = analysisModeOf(ws)
  const modeLabel = mode === 'fast' ? 'Fast' : 'Standard'
  const elapsed = elapsedLabel(ws)

  const [text, cls] =
    ws.status === 'completed' || ws.status === 'partial_success'
      ? [`${modeLabel} · ${elapsed || 'Ready'}${ws.status === 'partial_success' ? ' · warnings' : ''}`, 'bg-emerald-50 text-emerald-700 border-emerald-100']
      : ws.status === 'running'
      ? [`${modeLabel} · Analyzing ${ws.progress}%`, 'bg-[#fff5f7] text-[#8B1730] border-[#efd6dc]']
      : ws.status === 'queued'
      ? [`${modeLabel} · Preparing`, 'bg-sky-50 text-sky-600 border-sky-100']
      : ws.status === 'failed'
      ? [`${modeLabel} · Failed`, 'bg-red-50 text-red-600 border-red-100']
      : [ws.status, 'bg-slate-100 text-slate-500 border-slate-200']

  return (
    <span className={clsx('flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold', cls)}>
      {(ws.status === 'running' || ws.status === 'queued') && <Loader2 size={9} className="animate-spin" />}
      {mode === 'fast' && ws.status !== 'running' && ws.status !== 'queued' && <Zap size={9} />}
      {text}
    </span>
  )
}

export default function PaperShell() {
  const { projectId, paperId } = useParams<{ projectId: string; paperId: string }>()
  const pid = Number(projectId)
  const paperIdNum = Number(paperId)

  const [paper, setPaper] = useState<PaperInfo | null>(null)
  const [ws, setWs] = useState<WorkspaceStatus | null>(null)
  const [wsLoaded, setWsLoaded] = useState(false)
  const [launching, setLaunching] = useState<AnalysisMode | null>(null)

  useEffect(() => {
    Promise.allSettled([
      papersApi.list(pid).then((list: PaperInfo[]) => {
        const found = list.find((p) => p.id === paperIdNum)
        if (found) setPaper(found)
      }),
      workspaceApi.status(pid, paperIdNum).then((s: WorkspaceStatus) => setWs(s)),
    ]).finally(() => setWsLoaded(true))
  }, [pid, paperIdNum])

  // Keep the status badge fresh while analysis is running. The overview page
  // has its own faster live stream; this lightweight poll is only for the
  // persistent shell/navigation above it.
  useEffect(() => {
    if (ws?.status !== 'running' && ws?.status !== 'queued') return
    const id = window.setInterval(() => {
      workspaceApi.status(pid, paperIdNum).then((s: WorkspaceStatus) => setWs(s)).catch(() => null)
    }, 3500)
    return () => window.clearInterval(id)
  }, [ws?.status, pid, paperIdNum])

  useEffect(() => {
    if (!Number.isNaN(pid) && !Number.isNaN(paperIdNum)) {
      try {
        localStorage.setItem(`lastPaperId:${pid}`, String(paperIdNum))
      } catch {
        // ignore storage errors
      }
    }
  }, [pid, paperIdNum])

  const base = `/projects/${projectId}/papers/${paperId}`
  const running = ws?.status === 'running' || ws?.status === 'queued'
  const currentMode = analysisModeOf(ws)
  const canCompare = wsLoaded && !running

  const comparisonNote = useMemo(() => {
    const elapsed = elapsedLabel(ws)
    if (!elapsed || !isEvidenceReady(ws)) return null
    return `${currentMode === 'fast' ? 'Fast' : 'Standard'} finished in ${elapsed}`
  }, [ws, currentMode])

  const startMode = async (mode: AnalysisMode) => {
    if (running || launching) return
    if (isEvidenceReady(ws)) {
      const ok = window.confirm(
        `Run ${mode === 'fast' ? 'Fast' : 'Standard'} extraction? This will refresh the paper evidence so you can compare the two modes.`,
      )
      if (!ok) return
    }

    setLaunching(mode)
    try {
      if (mode === 'fast') {
        await api.post(`/projects/${pid}/papers/${paperIdNum}/workspace-fast`)
      } else {
        await workspaceApi.start(pid, paperIdNum)
      }
      toast.success(`${mode === 'fast' ? 'Fast' : 'Standard'} extraction started`)
      // Reload the overview so its live timeline attaches to the newly-created job.
      window.location.assign(`${base}/overview`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || `Could not start ${mode} extraction`)
      setLaunching(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#fffdfd]">
      <div className="shrink-0 border-b border-[#efe6e8] bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to={`/projects/${projectId}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#eee4e7] text-[#7d8a9d] transition hover:border-[#d9bdc5] hover:bg-[#fff8fa] hover:text-[#7A1B2E]"
            title="Back to project dashboard"
          >
            <ArrowLeft size={14} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-[#202a3c]" title={paper?.original_name}>
              {paper?.original_name ?? `Paper ${paperIdNum}`}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-[9.5px] text-[#93a0b1]">
              <span>{paper?.page_count ? `${paper.page_count} pages · ` : ''}Research paper workspace</span>
              {comparisonNote && <span className="hidden text-[#9e6675] md:inline">· {comparisonNote}</span>}
            </div>
          </div>

          {canCompare && (
            <div className="hidden items-center gap-1.5 lg:flex" title="Run either mode on this same paper to compare speed and results">
              <button
                onClick={() => startMode('standard')}
                disabled={!!launching}
                className={clsx(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[9.5px] font-semibold transition-all disabled:opacity-50',
                  currentMode === 'standard' && isEvidenceReady(ws)
                    ? 'border-[#d9bdc5] bg-[#fff5f7] text-[#8B1730]'
                    : 'border-[#e8e1e3] bg-white text-[#657389] hover:border-[#d9bdc5] hover:text-[#8B1730]',
                )}
              >
                {launching === 'standard' ? <Loader2 size={10} className="animate-spin" /> : <Gauge size={11} />}
                Standard extraction
              </button>
              <button
                onClick={() => startMode('fast')}
                disabled={!!launching}
                className={clsx(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[9.5px] font-semibold transition-all disabled:opacity-50',
                  currentMode === 'fast' && isEvidenceReady(ws)
                    ? 'border-[#8B1730] bg-[#8B1730] text-white shadow-[0_8px_18px_-14px_rgba(139,23,48,.9)]'
                    : 'border-[#d9bdc5] bg-[#fff7f9] text-[#8B1730] hover:bg-[#fff0f4]',
                )}
              >
                {launching === 'fast' ? <Loader2 size={10} className="animate-spin" /> : <Zap size={11} />}
                Fast extraction
              </button>
            </div>
          )}

          {wsLoaded && <WorkspaceBadge ws={ws} />}
        </div>
      </div>

      <div className="scrollbar-none flex shrink-0 items-end gap-1 overflow-x-auto border-b border-[#efe6e8] bg-white px-4">
        {TABS.map(({ path, label, Icon, enabled, suffix }) => {
          const active = enabled(ws)
          const to = `${base}/${path}${suffix ? suffix(paperIdNum) : ''}`
          return (
            <NavLink
              key={path}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex select-none items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[11.5px] font-medium transition-colors',
                  !active
                    ? 'pointer-events-none border-transparent text-slate-300'
                    : isActive
                    ? 'border-[#8B1730] font-semibold text-[#8B1730]'
                    : 'border-transparent text-[#657389] hover:border-[#ead8dd] hover:text-[#273247]',
                )
              }
            >
              <Icon size={11} className="shrink-0" />
              {label}
            </NavLink>
          )
        })}

        {/* Keep the comparison controls accessible on narrower screens. */}
        {canCompare && (
          <div className="ml-auto flex items-center gap-1.5 pb-1.5 lg:hidden">
            <button
              onClick={() => startMode('standard')}
              disabled={!!launching}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e1e3] bg-white px-2 text-[9px] font-semibold text-[#657389] disabled:opacity-50"
            >
              <Gauge size={10} /> Standard
            </button>
            <button
              onClick={() => startMode('fast')}
              disabled={!!launching}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#d9bdc5] bg-[#fff7f9] px-2 text-[9px] font-semibold text-[#8B1730] disabled:opacity-50"
            >
              <Zap size={10} /> Fast
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
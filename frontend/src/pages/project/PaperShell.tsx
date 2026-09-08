import { Outlet, NavLink, useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { workspaceApi, papersApi } from '../../services/api'
import type { WorkspaceStatus } from '../../types/workspace'
import {
  ArrowLeft, BarChart2, ShieldCheck, ClipboardList,
  Database, Loader2, LayoutDashboard, Images,
} from 'lucide-react'
import clsx from 'clsx'

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

function WorkspaceBadge({ ws }: { ws: WorkspaceStatus | null }) {
  if (!ws || ws.status === 'not_started') return null

  const [text, cls] =
    ws.status === 'completed' || ws.status === 'partial_success'
      ? [ws.status === 'partial_success' ? 'Ready · review warnings' : 'Analysis ready', 'bg-emerald-50 text-emerald-700 border-emerald-100']
      : ws.status === 'running'
      ? [`Analyzing ${ws.progress}%`, 'bg-[#fff5f7] text-[#8B1730] border-[#efd6dc]']
      : ws.status === 'queued'
      ? ['Preparing analysis', 'bg-sky-50 text-sky-600 border-sky-100']
      : ws.status === 'failed'
      ? ['Analysis failed', 'bg-red-50 text-red-600 border-red-100']
      : [ws.status, 'bg-slate-100 text-slate-500 border-slate-200']

  return (
    <span className={clsx('flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold', cls)}>
      {(ws.status === 'running' || ws.status === 'queued') && <Loader2 size={9} className="animate-spin" />}
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
            <p className="mt-0.5 text-[9.5px] text-[#93a0b1]">
              {paper?.page_count ? `${paper.page_count} pages · ` : ''}Research paper workspace
            </p>
          </div>
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
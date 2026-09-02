import { Outlet, NavLink, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { workspaceApi, papersApi } from '../../services/api'
import type { WorkspaceStatus } from '../../types/workspace'
import {
  FileText, Cpu, BarChart2, ShieldCheck, ClipboardList,
  Database, Loader2, LayoutDashboard,
} from 'lucide-react'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaperInfo {
  id: number
  original_name: string
  filename: string
  page_count: number
}

// ─── Tab config ───────────────────────────────────────────────────────────────

interface Tab {
  path: string
  label: string
  Icon: React.ElementType
  enabled: (ws: WorkspaceStatus | null) => boolean
  suffix?: (paperIdNum: number) => string
}

const TABS: Tab[] = [
  {
    path: 'overview',
    label: 'Overview',
    Icon: LayoutDashboard,
    enabled: () => true,
  },
  {
    path: 'docling',
    label: 'Docling Results',
    Icon: Cpu,
    enabled: (ws) => ws?.status === 'completed' || ws?.status === 'failed',
  },
  {
    path: 'charts',
    label: 'Charts',
    Icon: BarChart2,
    enabled: (ws) => ws?.status === 'completed' && (ws.result?.charts ?? 0) > 0,
  },
  {
    path: 'validation',
    label: 'Validation',
    Icon: ShieldCheck,
    enabled: (ws) => ws?.status === 'completed',
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
    label: 'Database Rows',
    Icon: Database,
    enabled: () => true,
  },
]

// ─── Context header badge ─────────────────────────────────────────────────────

function WorkspaceBadge({ ws }: { ws: WorkspaceStatus | null }) {
  if (!ws || ws.status === 'not_started') return null
  const [text, cls] =
    ws.status === 'completed'  ? ['Docling Complete', 'bg-emerald-50 text-emerald-700'] :
    ws.status === 'running'    ? [`Running ${ws.progress}%`, 'bg-blue-50 text-blue-600'] :
    ws.status === 'queued'     ? ['Queued', 'bg-sky-50 text-sky-600'] :
    ws.status === 'failed'     ? ['Docling Failed', 'bg-red-50 text-red-600'] :
                                 [ws.status, 'bg-slate-100 text-slate-500']
  return (
    <span className={clsx('flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0', cls)}>
      {ws.status === 'running' && <Loader2 size={8} className="animate-spin" />}
      {text}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaperShell() {
  const { projectId, paperId } = useParams<{ projectId: string; paperId: string }>()
  const pid        = Number(projectId)
  const paperIdNum = Number(paperId)

  const [paper, setPaper]   = useState<PaperInfo | null>(null)
  const [ws, setWs]         = useState<WorkspaceStatus | null>(null)
  const [wsLoaded, setWsLoaded] = useState(false)

  useEffect(() => {
    // Parallel fetch: paper info + workspace status
    Promise.allSettled([
      papersApi.list(pid).then((list: PaperInfo[]) => {
        const found = list.find((p) => p.id === paperIdNum)
        if (found) setPaper(found)
      }),
      workspaceApi.status(pid, paperIdNum).then((s: WorkspaceStatus) => {
        setWs(s)
      }),
    ]).finally(() => setWsLoaded(true))
  }, [pid, paperIdNum])

  // Extract document hash from stored filename (12-char uid prefix before first underscore)
  const docHash = paper?.filename ? paper.filename.split('_')[0] : null

  const base = `/projects/${projectId}/papers/${paperId}`

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--canvas)' }}>

      {/* ── Context header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 min-w-0">
        <FileText size={13} className="text-slate-400 shrink-0" />
        <span className="font-semibold text-slate-800 text-xs truncate flex-1" title={paper?.original_name}>
          {paper?.original_name ?? `Paper ${paperIdNum}`}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <code className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-mono">
            #{paperIdNum}
          </code>
          {ws?.job_id && (
            <code className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-mono">
              run #{ws.job_id}
            </code>
          )}
          {docHash && (
            <code className="bg-slate-50 text-slate-400 px-1.5 py-0.5 rounded text-[10px] font-mono" title="Document hash">
              {docHash}
            </code>
          )}
          {paper?.page_count ? (
            <span className="text-[10px] text-slate-300">{paper.page_count}pp</span>
          ) : null}
          {wsLoaded && <WorkspaceBadge ws={ws} />}
        </div>
      </div>

      {/* ── Tab navigation ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-200 flex items-end gap-0 px-4 overflow-x-auto scrollbar-none">
        {TABS.map(({ path, label, Icon, enabled, suffix }) => {
          const active = enabled(ws)
          const to = `${base}/${path}${suffix ? suffix(paperIdNum) : ''}`
          return (
            <NavLink
              key={path}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-1.5 px-3.5 py-2.5 text-[12px] font-medium border-b-2 whitespace-nowrap transition-colors select-none',
                  !active
                    ? 'pointer-events-none border-transparent text-slate-300'
                    : isActive
                    ? 'border-[#7A1B2E] text-[#7A1B2E] font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200 cursor-pointer',
                )
              }
            >
              <Icon size={11} className="shrink-0" />
              {label}
            </NavLink>
          )
        })}
      </div>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <Outlet />
      </div>
    </div>
  )
}

import {
  CheckCircle2, AlertTriangle, Loader2, FileText, Image,
  Table2, BarChart2, XCircle, Layers3,
} from 'lucide-react'
import clsx from 'clsx'
import type { StreamEvent } from '../types/workspace'

interface Props {
  events: StreamEvent[]
  live: boolean
}

function iconFor(evt: StreamEvent) {
  switch (evt.type) {
    case 'job_started':        return <Loader2 size={12} className="animate-spin text-[#8B1730]" />
    case 'page_images_ready':  return <FileText size={12} className="text-sky-500" />
    case 'chunk_done':         return <CheckCircle2 size={12} className="text-emerald-500" />
    case 'chunk_failed':       return <AlertTriangle size={12} className="text-amber-500" />
    case 'asset_added':
      return evt.payload.asset_type === 'figure'
        ? <Image size={12} className="text-violet-500" />
        : <Table2 size={12} className="text-blue-500" />
    case 'asset_failed':       return <AlertTriangle size={12} className="text-amber-500" />
    case 'chart_read':         return <BarChart2 size={12} className="text-emerald-500" />
    case 'job_completed':      return <CheckCircle2 size={13} className="text-emerald-600" />
    case 'job_failed':         return <XCircle size={13} className="text-red-500" />
    case 'job_cancelled':      return <XCircle size={13} className="text-slate-400" />
    default:                   return <Layers3 size={12} className="text-slate-300" />
  }
}

function describe(evt: StreamEvent): string {
  const p = evt.payload as Record<string, unknown>

  switch (evt.type) {
    case 'job_started':
      return 'Paper analysis started'
    case 'page_images_ready': {
      const count = Number(p.page_count ?? 0)
      return count ? `${count} page preview${count === 1 ? '' : 's'} ready` : 'Page previews ready'
    }
    case 'chunk_done': {
      const start = Number(p.page_start ?? 0)
      const end = Number(p.page_end ?? 0)
      const total = Number(p.total_pages ?? 0)
      if (start && end) return `Pages ${start}–${end}${total ? ` of ${total}` : ''} analyzed`
      return evt.message ?? 'More pages analyzed'
    }
    case 'asset_added': {
      const kind = p.asset_type === 'figure' ? 'Figure' : 'Table'
      const page = Number(p.page ?? 0)
      return page ? `${kind} found on page ${page}` : `${kind} found`
    }
    case 'chart_read':
      return evt.message ?? 'Chart converted to data'
    case 'job_completed':
      return 'Paper analysis complete'
    case 'job_failed':
      return evt.message ? `Analysis failed · ${evt.message}` : 'Analysis failed'
    case 'job_cancelled':
      return 'Analysis cancelled'
    default:
      return evt.message ?? evt.type.replace(/_/g, ' ')
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0 || Number.isNaN(ms)) return ''
  if (ms < 1000) return 'just now'
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`
  return `${Math.floor(ms / 60000)}m ago`
}

/** Backend-backed extraction timeline. Nothing here is a simulated stage:
 * every row comes from a persisted JobEvent and therefore survives refresh. */
export default function ExtractionTimeline({ events, live }: Props) {
  const recent = events.slice(-30).reverse()

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={clsx(
            'h-2 w-2 rounded-full',
            live ? 'animate-pulse bg-emerald-500' : 'bg-slate-300',
          )} />
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b8799]">
            Live activity
          </p>
        </div>
        <span className="text-[9px] font-medium text-slate-300">{live ? 'LIVE' : 'SYNCING'}</span>
      </div>

      {recent.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#eadfe2] bg-[#fffafa] px-3 py-4 text-center">
          <Loader2 size={15} className="mx-auto mb-2 animate-spin text-[#b78b96]" />
          <p className="text-[10.5px] text-[#9ca6b4]">Waiting for the first analysis event…</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {recent.map((evt, index) => (
            <div
              key={`${evt.seq}-${evt.type}`}
              className={clsx(
                'relative flex items-start gap-2.5 rounded-xl border px-2.5 py-2.5',
                index === 0
                  ? 'border-[#ead9de] bg-[#fff8fa]'
                  : 'border-transparent bg-white',
              )}
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#eee5e7]">
                {iconFor(evt)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-medium leading-snug text-[#58667a]">{describe(evt)}</p>
                {evt.created_at && (
                  <p className="mt-0.5 text-[9px] text-[#adb5c1]">{relativeTime(evt.created_at)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
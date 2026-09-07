import { CheckCircle2, AlertTriangle, Loader2, FileText, Image, Table2, BarChart2, XCircle } from 'lucide-react'
import clsx from 'clsx'
import type { StreamEvent } from '../types/workspace'

interface Props {
  events: StreamEvent[]
  live: boolean
}

function iconFor(evt: StreamEvent) {
  switch (evt.type) {
    case 'job_started':        return <Loader2 size={12} className="animate-spin text-slate-400" />
    case 'page_images_ready':  return <FileText size={12} className="text-slate-400" />
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
    default:                   return <Loader2 size={12} className="text-slate-300" />
  }
}

function describe(evt: StreamEvent): string {
  if (evt.message) return evt.message
  switch (evt.type) {
    case 'asset_added': {
      const kind = evt.payload.asset_type === 'figure' ? 'Figure' : 'Table'
      const page = evt.payload.page
      return page ? `${kind} found on page ${page}` : `${kind} found`
    }
    default:
      return evt.type.replace(/_/g, ' ')
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

/** Real, backend-emitted extraction timeline — replaces a client-side-only
 * "9 pipeline stages" progress bar that had no server basis. */
export default function ExtractionTimeline({ events, live }: Props) {
  const recent = events.slice(-40).reverse()

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={clsx(
          'w-1.5 h-1.5 rounded-full',
          live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300',
        )} />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Live Activity
        </p>
      </div>
      {recent.length === 0 ? (
        <p className="text-[11px] text-slate-300 italic">Waiting for extraction events…</p>
      ) : (
        <div className="space-y-2">
          {recent.map((evt) => (
            <div key={`${evt.seq}-${evt.type}`} className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">{iconFor(evt)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-600 leading-snug truncate">{describe(evt)}</p>
                {evt.created_at && (
                  <p className="text-[9.5px] text-slate-300">{relativeTime(evt.created_at)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

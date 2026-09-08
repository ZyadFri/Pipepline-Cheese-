import { X, ImageIcon, FileText } from 'lucide-react'
import { reviewQueueApi } from '../services/api'
import type { ProvenanceRecord } from '../types'
import AuthImage from './AuthImage'

interface Props {
  projectId: number
  title: string
  evidence: ProvenanceRecord[]
  onClose: () => void
}

/**
 * "Why was this extracted?" — shows the exact source (sentence, table cell,
 * or figure crop) behind one canonical field/observation. Reusable across
 * any page that already has ReviewObservation.evidence (Review, Database).
 */
export default function EvidenceModal({ projectId, title, evidence, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8B1538]">Why was this extracted?</p>
            <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {evidence.length === 0 ? (
            <p className="text-xs text-slate-400">No source evidence was recorded for this value.</p>
          ) : (
            evidence.map((ev) => {
              return (
                <div key={ev.id} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  {ev.has_image ? (
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <AuthImage
                        src={reviewQueueApi.provenanceImageUrl(projectId, ev.id)}
                        alt="Evidence"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                      <ImageIcon size={18} className="text-slate-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-slate-700">
                      {ev.source_snippet || 'No excerpt available.'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {ev.page_number != null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
                          <FileText size={9} /> Page {ev.page_number}
                        </span>
                      )}
                      {ev.table_number != null && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
                          Table {ev.table_number}
                        </span>
                      )}
                      {ev.section_name && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
                          {ev.section_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

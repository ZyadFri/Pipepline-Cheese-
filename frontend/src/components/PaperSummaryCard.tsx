import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw, Target, Package, FlaskConical, Activity, Lightbulb } from 'lucide-react'
import { paperAssistantApi } from '../services/api'
import type { PaperSummary } from '../services/api'
import ProviderFallbackNotice from './ProviderFallbackNotice'

interface Props {
  projectId: number
  paperId: number
}

/**
 * Auto-generated "does the system understand this paper?" card — shown
 * right after extraction, before the user opens any structured data.
 * Generated once by the LLM and cached server-side; counts are always live.
 */
export default function PaperSummaryCard({ projectId, paperId }: Props) {
  const [summary, setSummary] = useState<PaperSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const load = (regenerate = false) => {
    (regenerate ? setRegenerating : setLoading)(true)
    setError(null)
    paperAssistantApi.summary(projectId, paperId, regenerate)
      .then(setSummary)
      .catch((err) => {
        const detail = err?.response?.data?.detail
        setError(typeof detail === 'string' ? detail : 'Could not generate a summary for this paper.')
      })
      .finally(() => { setLoading(false); setRegenerating(false) })
  }

  useEffect(() => { load(false) }, [projectId, paperId])

  return (
    <div className="rounded-[20px] border border-[#eae0e3] bg-white p-4 shadow-[0_18px_42px_-38px_rgba(70,18,36,.6)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-[#8B1730]" />
          <h3 className="text-[13px] font-semibold text-slate-900">Paper summary</h3>
        </div>
        {summary && (
          <button
            onClick={() => load(true)}
            disabled={regenerating}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-slate-400 hover:bg-slate-100 hover:text-[#8B1538] disabled:opacity-50"
          >
            <RefreshCw size={11} className={regenerating ? 'animate-spin' : ''} /> Regenerate
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-3 text-[11px] text-slate-400">Reading the paper…</p>
      ) : error ? (
        <p className="mt-3 text-[11px] text-rose-600">{error}</p>
      ) : summary ? (
        <div className="mt-3 space-y-3">
          {summary.provider_fallback.length > 0 && (
            <ProviderFallbackNotice events={summary.provider_fallback} />
          )}
          <div className="flex items-start gap-2">
            <Target size={13} className="mt-0.5 shrink-0 text-[#a43c55]" />
            <p className="text-[11.5px] leading-relaxed text-slate-700">{summary.objective}</p>
          </div>
          <div className="flex items-start gap-2">
            <Package size={13} className="mt-0.5 shrink-0 text-[#a43c55]" />
            <p className="text-[11.5px] leading-relaxed text-slate-700">{summary.product}</p>
          </div>
          {summary.treatments.length > 0 && (
            <div className="flex items-start gap-2">
              <FlaskConical size={13} className="mt-0.5 shrink-0 text-[#a43c55]" />
              <div className="flex flex-wrap gap-1">
                {summary.treatments.map((t) => (
                  <span key={t} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">{t}</span>
                ))}
              </div>
            </div>
          )}
          {summary.variables.length > 0 && (
            <div className="flex items-start gap-2">
              <Activity size={13} className="mt-0.5 shrink-0 text-[#a43c55]" />
              <div className="flex flex-wrap gap-1">
                {summary.variables.map((v) => (
                  <span key={v} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">{v}</span>
                ))}
              </div>
            </div>
          )}
          {summary.main_findings.length > 0 && (
            <div className="flex items-start gap-2">
              <Lightbulb size={13} className="mt-0.5 shrink-0 text-[#a43c55]" />
              <ul className="space-y-1 text-[11.5px] leading-relaxed text-slate-700">
                {summary.main_findings.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 border-t border-slate-100 pt-2.5 text-[10.5px] text-slate-400">
            <span>{summary.counts.experiment_count} experiment{summary.counts.experiment_count === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{summary.counts.observation_count} observation{summary.counts.observation_count === 1 ? '' : 's'}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

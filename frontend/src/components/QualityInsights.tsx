import { Gauge, AlertTriangle } from 'lucide-react'
import type { QualityScore, MissingFieldItem } from '../services/api'

function scoreColor(score: number) {
  if (score >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700' }
  if (score >= 60) return { bar: 'bg-lime-500', text: 'text-lime-700' }
  if (score >= 40) return { bar: 'bg-amber-500', text: 'text-amber-700' }
  return { bar: 'bg-rose-500', text: 'text-rose-700' }
}

interface Props {
  score: QualityScore | null
  missing: MissingFieldItem[] | null
  loading?: boolean
}

/**
 * "Extraction completeness: 87%" + "N expected fields were not found: ...".
 * Shown right after a paper finishes extraction — before the user even
 * opens the review queue — so the app looks like it "understood" the paper.
 */
export default function QualityInsights({ score, missing, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-400">
        Scoring extraction quality…
      </div>
    )
  }
  if (!score || !score.has_data) return null

  const colors = scoreColor(score.overall_score)
  const uniqueLabels = Array.from(new Set((missing ?? []).map((m) => m.label)))

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Gauge size={15} className={colors.text} />
          <p className="text-[12px] font-semibold text-slate-900">Extraction completeness</p>
        </div>
        <div className="mt-3 flex items-end gap-2">
          <span className={`text-[26px] font-bold leading-none ${colors.text}`}>{score.overall_score}%</span>
          <span className="mb-0.5 text-[11px] text-slate-400">
            {score.experiment_count} experiment{score.experiment_count === 1 ? '' : 's'} · {score.observation_count} measurement{score.observation_count === 1 ? '' : 's'}
          </span>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${colors.bar} transition-all`} style={{ width: `${score.overall_score}%` }} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className={uniqueLabels.length ? 'text-amber-500' : 'text-emerald-500'} />
          <p className="text-[12px] font-semibold text-slate-900">Missing expected fields</p>
        </div>
        {uniqueLabels.length === 0 ? (
          <p className="mt-3 text-[11px] text-emerald-700">All expected fields were found.</p>
        ) : (
          <>
            <p className="mt-2.5 text-[11px] text-slate-500">
              {uniqueLabels.length} expected field{uniqueLabels.length === 1 ? ' was' : 's were'} not found:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {uniqueLabels.map((label) => (
                <span key={label} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  {label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

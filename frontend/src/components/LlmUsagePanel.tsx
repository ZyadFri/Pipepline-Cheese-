import { useEffect, useState } from 'react'
import { Cpu, Gauge, AlertTriangle, RefreshCw } from 'lucide-react'
import { authApi } from '../services/api'
import type { LLMUsageSummary } from '../services/api'

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function pct(remaining: number | null, limit: number | null): number | null {
  if (remaining == null || limit == null || limit === 0) return null
  return Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)))
}

/** LLM/vision API consumption for the current user, shown on the profile page. */
export default function LlmUsagePanel() {
  const [summary, setSummary] = useState<LLMUsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = () => {
    setLoading(true)
    setError(false)
    authApi.llmUsage().then(setSummary).catch(() => setError(true)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-38px_rgba(30,20,25,.25)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-[#8B1730]" />
          <h2 className="text-[15px] font-semibold text-slate-900">LLM usage</h2>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-50 hover:text-[#8B1538]"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-[12px] text-slate-400">Loading usage…</p>
      ) : error || !summary ? (
        <p className="text-[12px] text-rose-600">Could not load usage data.</p>
      ) : summary.total_calls === 0 ? (
        <p className="text-[12px] text-slate-400">No AI calls recorded yet — usage appears here after you extract a paper, generate a summary, or ask a question.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total calls</p>
              <p className="mt-1 text-[20px] font-bold text-slate-900">{summary.total_calls}</p>
              {summary.failed_calls > 0 && (
                <p className="mt-0.5 text-[10px] text-amber-600">{summary.failed_calls} failed</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total tokens</p>
              <p className="mt-1 text-[20px] font-bold text-slate-900">{formatTokens(summary.total_tokens)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Prompt / completion</p>
              <p className="mt-1 text-[13px] font-semibold text-slate-700">
                {formatTokens(summary.total_prompt_tokens)} / {formatTokens(summary.total_completion_tokens)}
              </p>
            </div>
          </div>

          {summary.rate_limits.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <Gauge size={12} /> Remaining quota (as of last call — not a total balance)
              </p>
              <div className="space-y-2">
                {summary.rate_limits.map((rl) => {
                  const reqPct = pct(rl.remaining_requests, rl.limit_requests)
                  const tokPct = pct(rl.remaining_tokens, rl.limit_tokens)
                  return (
                    <div key={rl.provider} className="rounded-xl border border-slate-100 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold capitalize text-slate-800">{rl.provider}</span>
                        <span className="text-[10px] text-slate-400">{rl.model}</span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {reqPct !== null && (
                          <div>
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span>Requests</span>
                              <span>{rl.remaining_requests} / {rl.limit_requests}</span>
                            </div>
                            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${reqPct < 15 ? 'bg-rose-500' : reqPct < 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${reqPct}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {tokPct !== null && (
                          <div>
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span>Tokens</span>
                              <span>{formatTokens(rl.remaining_tokens ?? 0)} / {formatTokens(rl.limit_tokens ?? 0)}</span>
                            </div>
                            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${tokPct < 15 ? 'bg-rose-500' : tokPct < 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${tokPct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-400">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                Providers don't expose a total account credit balance through this API — this is each provider's own per-minute rate-limit window, snapshotted from its last response.
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold text-slate-600">By model</p>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-left text-[11.5px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-slate-500">Provider</th>
                    <th className="px-3 py-2 font-semibold text-slate-500">Model</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-500">Calls</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-500">Tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {summary.by_model.map((m) => (
                    <tr key={`${m.provider}-${m.model}`}>
                      <td className="px-3 py-2 capitalize text-slate-700">{m.provider}</td>
                      <td className="px-3 py-2 text-slate-500">{m.model}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{m.calls}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{formatTokens(m.total_tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold text-slate-600">By feature</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.by_feature.map((f) => (
                <span key={f.feature} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10.5px] text-slate-600">
                  {f.feature.replace(/_/g, ' ')} · {f.calls} call{f.calls === 1 ? '' : 's'} · {formatTokens(f.total_tokens)} tok
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

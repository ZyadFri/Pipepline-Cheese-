import { useState, type FormEvent } from 'react'
import { MessageCircleQuestion, Send, Loader2 } from 'lucide-react'
import { paperAssistantApi } from '../services/api'
import type { AskPaperSource, ProviderFallbackEvent } from '../services/api'
import ProviderFallbackNotice from './ProviderFallbackNotice'

interface Props {
  projectId: number
  paperId: number
}

interface Turn {
  question: string
  answer: string
  sources: AskPaperSource[]
  providerFallback: ProviderFallbackEvent[]
}

const SUGGESTIONS = [
  'What treatments were tested?',
  'What storage temperature was used?',
  'What were the main findings?',
]

/** A small chat box limited to this one paper's already-extracted text. */
export default function AskPaperChat({ projectId, paperId }: Props) {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ask = async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed || asking) return
    setAsking(true)
    setError(null)
    setQuestion('')
    try {
      const res = await paperAssistantApi.ask(projectId, paperId, trimmed)
      setTurns((prev) => [...prev, {
        question: trimmed, answer: res.answer, sources: res.sources,
        providerFallback: res.provider_fallback,
      }])
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Could not answer that question right now.')
    } finally {
      setAsking(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    ask(question)
  }

  return (
    <div className="flex flex-col rounded-[20px] border border-[#eae0e3] bg-white p-4 shadow-[0_18px_42px_-38px_rgba(70,18,36,.6)]">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion size={15} className="text-[#8B1730]" />
        <h3 className="text-[13px] font-semibold text-slate-900">Ask this paper</h3>
      </div>

      <div className="mt-3 max-h-64 flex-1 space-y-3 overflow-y-auto pr-1">
        {turns.length === 0 && !asking && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10.5px] text-slate-600 hover:bg-slate-100"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-1">
            <p className="text-[11.5px] font-semibold text-slate-800">{t.question}</p>
            {t.providerFallback.length > 0 && <ProviderFallbackNotice events={t.providerFallback} />}
            <p className="text-[11.5px] leading-relaxed text-slate-600">{t.answer}</p>
            {t.sources.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {t.sources.map((s, si) => (
                  <span
                    key={si}
                    title={s.snippet}
                    className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-500"
                  >
                    p.{s.page_number ?? '?'}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {asking && (
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Loader2 size={11} className="animate-spin" /> Reading the paper…
          </p>
        )}
        {error && <p className="text-[11px] text-rose-600">{error}</p>}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about this paper…"
          disabled={asking}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11.5px] outline-none focus:border-[#c98c9c]"
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#8B1538] text-white disabled:opacity-40"
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  )
}

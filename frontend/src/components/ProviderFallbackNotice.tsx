import { ArrowRightLeft } from 'lucide-react'
import type { ProviderFallbackEvent } from '../services/api'

const LABELS: Record<string, string> = {
  openai: 'OpenAI', groq: 'Groq', gemini: 'Gemini', google_ai: 'Gemini', anthropic: 'Anthropic', vertexai: 'Vertex AI',
}

/** Shown whenever a request actually fell back to a backup AI provider —
 * e.g. after the primary provider's response, paper summary, or chat
 * answer. Never fabricated: only rendered when the backend reports a real
 * fallback event for this specific call. */
export default function ProviderFallbackNotice({ events }: { events: ProviderFallbackEvent[] }) {
  if (!events.length) return null
  const { from_provider, to_provider } = events[0]
  const from = LABELS[from_provider] ?? from_provider
  const to = LABELS[to_provider] ?? to_provider

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
      <ArrowRightLeft size={13} className="mt-0.5 shrink-0" />
      <span>
        <strong>{from}</strong> has reached its usage limit — this ran on the backup provider, <strong>{to}</strong>, instead.
      </span>
    </div>
  )
}

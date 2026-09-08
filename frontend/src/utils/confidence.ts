/**
 * Shared continuous confidence -> color mapping, used anywhere a
 * confidence/quality_score (0-1) needs to read as a heatmap instead of a
 * blunt low/medium/high bucket. Five bands, interpolated by the caller only
 * at the boundaries (kept discrete-but-fine-grained rather than a literal
 * per-pixel gradient — easier to reason about and to test).
 */
export interface ConfidenceStyle {
  bg: string
  text: string
  border: string
  label: string
}

const BANDS: { min: number; style: ConfidenceStyle }[] = [
  { min: 0.85, style: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', label: 'Very confident' } },
  { min: 0.70, style: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Confident' } },
  { min: 0.55, style: { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200', label: 'Likely' } },
  { min: 0.40, style: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Uncertain' } },
  { min: 0.0, style: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'Low confidence' } },
]

export function confidenceStyle(value: number | null | undefined): ConfidenceStyle | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  const clamped = Math.max(0, Math.min(1, value))
  return (BANDS.find((b) => clamped >= b.min) ?? BANDS[BANDS.length - 1]).style
}

/** Opacity fades with confidence, giving a true heatmap feel rather than 5 flat blocks. */
export function confidenceOpacity(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 1
  return 0.45 + Math.max(0, Math.min(1, value)) * 0.55
}

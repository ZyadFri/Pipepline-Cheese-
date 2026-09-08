import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  Loader2,
  Package,
  Play,
  RefreshCw,
  Sparkles,
  Table2,
  Thermometer,
  type LucideIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { extractionEnginesApi, papersApi, workspaceApi, insightsApi } from '../../services/api'
import type { QualityScore, MissingFieldItem } from '../../services/api'
import AuthImage from '../../components/AuthImage'
import QualityInsights from '../../components/QualityInsights'
import ProviderFallbackNotice from '../../components/ProviderFallbackNotice'

interface Paper {
  id: number
  original_name: string
  status: string
}

interface ParagraphItem {
  asset_id: number
  link_id: number
  link_type: string
  text: string
  page_number: number
  score: number
  section_name: string | null
  asset_caption: string | null
  relevance_score: number
}

interface AssetItem {
  id: number
  asset_type: string
  classification: string
  caption: string | null
  section_name: string | null
  page_number: number
  relevance_score: number
  selected_for_llm: boolean
  has_csv: boolean
  has_image: boolean
  csv_rows: number | null
  csv_cols: number | null
  link_count: number
  context_links: Array<{
    id: number
    link_type: string
    text: string
    page_number: number
    score: number
  }>
}

interface EvidencePackages {
  paragraphs: ParagraphItem[]
  native_tables: AssetItem[]
  chart_csvs: AssetItem[]
  excluded: AssetItem[]
  totals: {
    paragraphs: number
    native_tables: number
    chart_csvs: number
    excluded: number
  }
  last_job: ExtractionJob | null
}

interface ExtractionJob {
  job_id: number
  status: string
  progress: number
  current_step: string
  error_message?: string | null
  result?: {
    experiments_reported?: number
    experiments_stored: number
    measurements_reported?: number
    measurements_stored: number
    unmapped_facts_stored?: number
    reasoning: string
    low_confidence_count?: number
    warnings: string[]
    provider_fallback?: { from_provider: string; to_provider: string; reason: string }[]
  } | null
  completed_at?: string | null
}

interface WhatCardProps {
  Icon: LucideIcon
  title: string
  body: string
  iconClass: string
}

function WhatCard({ Icon, title, body, iconClass }: WhatCardProps) {
  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4 shadow-[0_8px_28px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#dcb6c0] hover:shadow-[0_12px_32px_rgba(122,27,46,0.08)]">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>
        <Icon size={22} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-[12px] leading-5 text-slate-500">{body}</p>
      </div>
    </div>
  )
}

function StatItem({
  Icon,
  value,
  label,
  tone,
}: {
  Icon: LucideIcon
  value: number
  label: string
  tone: string
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-5 py-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
        <Icon size={21} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <div className="font-serif text-[27px] leading-none text-slate-950">{value}</div>
        <div className="mt-1 text-[12px] leading-4 text-slate-500">{label}</div>
      </div>
    </div>
  )
}

function VisualAssetCard({
  item,
  kind,
  projectId,
  paperId,
}: {
  item: AssetItem
  kind: 'table' | 'chart'
  projectId: number
  paperId: number
}) {
  const [imgError, setImgError] = useState(false)
  const Icon = kind === 'table' ? Table2 : BarChart3
  const label = kind === 'table' ? 'Table' : 'Chart'
  const chip = kind === 'table'
    ? 'bg-blue-50 text-blue-700 border-blue-100'
    : 'bg-emerald-50 text-emerald-700 border-emerald-100'

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative flex h-36 items-center justify-center overflow-hidden bg-[#f8fafc]">
        {item.has_image && !imgError ? (
          <AuthImage
            src={workspaceApi.imageUrl(projectId, paperId, item.id)}
            alt={item.caption || `${label} on page ${item.page_number}`}
            className="h-full w-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-300">
            <Icon size={34} strokeWidth={1.4} />
            {item.csv_rows != null && (
              <span className="text-[11px] text-slate-400">
                {item.csv_rows} rows × {item.csv_cols ?? 0} columns
              </span>
            )}
          </div>
        )}
        <span className="absolute right-2.5 top-2.5 rounded-full border border-white/70 bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
          p.{item.page_number}
        </span>
      </div>
      <div className="p-3.5">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${chip}`}>
          <Icon size={11} /> {label}
        </span>
        {item.caption && (
          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-700">{item.caption}</p>
        )}
        {!item.caption && item.csv_rows != null && (
          <p className="mt-2 text-[12px] text-slate-500">
            {item.csv_rows} rows × {item.csv_cols ?? 0} columns
          </p>
        )}
      </div>
    </div>
  )
}

function TextEvidenceCard({ item }: { item: ParagraphItem }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">
          <FileText size={11} /> Text
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">p.{item.page_number}</span>
      </div>
      <p className="mt-3 line-clamp-4 text-[12px] leading-5 text-slate-600">{item.text}</p>
    </div>
  )
}

export default function ValidationPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const pid = Number(projectId)

  const [papers, setPapers] = useState<Paper[]>([])
  const [paperId, setPaperId] = useState<number | null>(null)
  const [pkgData, setPkgData] = useState<EvidencePackages | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [job, setJob] = useState<ExtractionJob | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [qualityScore, setQualityScore] = useState<QualityScore | null>(null)
  const [missingFields, setMissingFields] = useState<MissingFieldItem[] | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    papersApi.list(pid).then((list: Paper[]) => {
      const extracted = list.filter((p) => ['extracted', 'extracting'].includes(p.status))
      setPapers(extracted.length > 0 ? extracted : list)
      const fromQuery = searchParams.get('paperId')
      if (fromQuery) setPaperId(Number(fromQuery))
      else if (list.length > 0) setPaperId(list[0].id)
    }).catch(() => toast.error('Could not load papers'))
  }, [pid, searchParams])

  const startPolling = useCallback((pId: number, jobId: number) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const next: ExtractionJob = await workspaceApi.getLlmJob(pid, pId, jobId)
        setJob(next)
        if (!['queued', 'running'].includes(next.status)) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          if (next.status === 'completed') toast.success('Structured extraction complete')
          if (next.status === 'failed') toast.error(next.error_message || 'Extraction failed')
        }
      } catch {
        clearInterval(pollRef.current!)
        pollRef.current = null
      }
    }, 2000)
  }, [pid])

  const loadPackages = useCallback(async (pId: number) => {
    setLoading(true)
    setPkgData(null)
    setJob(null)
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    try {
      const data: EvidencePackages = await workspaceApi.getEvidencePackages(pid, pId)
      setPkgData(data)
      if (data.last_job) {
        setJob(data.last_job)
        if (['queued', 'running'].includes(data.last_job.status)) {
          startPolling(pId, data.last_job.job_id)
        }
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (!message?.includes('No extracted assets')) toast.error('Could not prepare this paper for extraction')
    } finally {
      setLoading(false)
    }
  }, [pid, startPolling])

  useEffect(() => {
    if (paperId) loadPackages(paperId)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [paperId, loadPackages])

  useEffect(() => {
    setQualityScore(null)
    setMissingFields(null)
    if (!paperId || job?.status !== 'completed' || !(job.result?.experiments_stored ?? 0)) return
    setInsightsLoading(true)
    Promise.all([
      insightsApi.qualityScore(pid, paperId),
      insightsApi.missingFields(pid, paperId),
    ])
      .then(([score, missing]) => {
        setQualityScore(score)
        setMissingFields(missing.missing)
      })
      .catch(() => { /* insights are a bonus, not required for the core flow */ })
      .finally(() => setInsightsLoading(false))
  }, [pid, paperId, job?.status, job?.result?.experiments_stored])

  const handleExtract = async () => {
    if (!paperId || !pkgData) return
    setSending(true)
    try {
      const response = await extractionEnginesApi.run(pid, paperId, 'llm')
      setJob({
        job_id: response.job_id,
        status: 'queued',
        progress: 0,
        current_step: 'Preparing extraction',
      })
      startPolling(paperId, response.job_id)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(message || 'Could not start extraction')
    } finally {
      setSending(false)
    }
  }

  const selectedPaper = papers.find((p) => p.id === paperId)
  const selectedCount = pkgData
    ? pkgData.totals.paragraphs + pkgData.totals.native_tables + pkgData.totals.chart_csvs
    : 0
  const isRunning = !!job && ['queued', 'running'].includes(job.status)
  const canExtract = !!paperId && !!pkgData && selectedCount > 0 && !isRunning && !sending

  const previewParagraphs = pkgData?.paragraphs.slice(0, 6) ?? []
  const previewTables = pkgData?.native_tables.slice(0, 4) ?? []
  const previewCharts = pkgData?.chart_csvs.slice(0, 4) ?? []

  if (!paperId) {
    return (
      <div className="flex h-full items-center justify-center bg-[#fffdfd]">
        <div className="text-center text-slate-400">
          <BookOpen size={42} strokeWidth={1.2} className="mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">Choose a research paper to continue</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#fffdfd]">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 size={20} className="animate-spin text-[#7A1B2E]" />
          Preparing extraction workspace…
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,#fffdfd_0%,#ffffff_48%,#fffafa_100%)]">
      <div className="mx-auto w-full max-w-[1500px] px-7 pb-12 pt-5">
        <div className="mb-4 flex items-center justify-end gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Paper</span>
          <select
            value={paperId ?? ''}
            onChange={(event) => setPaperId(Number(event.target.value))}
            className="max-w-[360px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 shadow-sm outline-none transition focus:border-[#c98c9c] focus:ring-2 focus:ring-[#7A1B2E]/10"
          >
            {papers.map((paper) => (
              <option key={paper.id} value={paper.id}>{paper.original_name}</option>
            ))}
          </select>
          <button
            onClick={() => paperId && loadPackages(paperId)}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:text-slate-700"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <section className="relative overflow-hidden rounded-[28px] border border-[#eadde1] bg-white shadow-[0_22px_70px_rgba(81,28,42,0.07)]">
          <div className="absolute inset-y-0 right-0 hidden w-[34%] overflow-hidden lg:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(232,202,173,0.50),transparent_38%),radial-gradient(circle_at_45%_75%,rgba(210,228,204,0.55),transparent_34%),linear-gradient(135deg,#fff7f2_0%,#faf1ea_55%,#f7eee7_100%)]" />
            <div className="absolute right-12 top-10 h-52 w-40 rotate-[7deg] rounded-[18px] border border-white/80 bg-white/75 shadow-[0_18px_40px_rgba(80,42,30,0.12)]" />
            <div className="absolute right-28 top-16 h-52 w-40 rotate-[-4deg] rounded-[18px] border border-white/80 bg-white/90 shadow-[0_18px_40px_rgba(80,42,30,0.10)]" />
            <div className="absolute bottom-12 right-16 rounded-2xl border border-white/80 bg-white/78 px-5 py-4 shadow-lg backdrop-blur-sm">
              <p className="font-serif text-[18px] italic leading-6 text-[#6f4d51]">From scientific literature<br />to usable data, faster.</p>
              <div className="mt-3 h-[2px] w-10 bg-[#8B1538]" />
            </div>
          </div>

          <div className="relative z-10 px-8 py-8 lg:w-[69%] lg:px-10 lg:py-10">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8B1538]">Extract structured data</p>
            <h1 className="max-w-3xl font-serif text-[42px] leading-[1.02] tracking-[-0.02em] text-[#171827] md:text-[50px]">
              Turn this research paper into structured data
            </h1>
            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-slate-500">
              We’ll organize the selected evidence into research-ready experiments, treatments, conditions and measurements.
            </p>
            {selectedPaper && (
              <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-[#eadde1] bg-[#fff8fa] px-3 py-1.5 text-[11px] text-[#7A1B2E]">
                <FileText size={12} />
                <span className="truncate">{selectedPaper.original_name}</span>
              </div>
            )}
          </div>
        </section>

        {pkgData ? (
          <>
            <div className="relative z-20 mx-auto -mt-1 flex max-w-5xl divide-x divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
              <StatItem Icon={BookOpen} value={selectedCount} label="evidence items" tone="bg-[#fff0f3] text-[#9B1741]" />
              <StatItem Icon={FileText} value={pkgData.totals.paragraphs} label="text passages" tone="bg-blue-50 text-blue-600" />
              <StatItem Icon={Table2} value={pkgData.totals.native_tables} label="tables" tone="bg-violet-50 text-violet-600" />
              <StatItem Icon={BarChart3} value={pkgData.totals.chart_csvs} label="charts" tone="bg-emerald-50 text-emerald-600" />
            </div>

            <section className="mt-8">
              <div className="mb-4">
                <h2 className="font-serif text-[27px] text-slate-950">What we’ll extract</h2>
                <p className="mt-1 text-[12px] text-slate-500">The system will look for these scientific elements in the evidence you selected.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <WhatCard Icon={Package} title="Cheese / product information" body="Product type, matrix, formulation details and characteristics" iconClass="bg-amber-50 text-amber-600" />
                <WhatCard Icon={FlaskConical} title="Treatments & ingredients" body="Preservatives, concentrations and application methods" iconClass="bg-rose-50 text-rose-600" />
                <WhatCard Icon={Thermometer} title="Storage conditions" body="Temperature, storage time, packaging and atmosphere" iconClass="bg-blue-50 text-blue-600" />
                <WhatCard Icon={Activity} title="Microbiological measurements" body="Counts, organisms and other microbiological outcomes" iconClass="bg-violet-50 text-violet-600" />
                <WhatCard Icon={Sparkles} title="Physicochemical measurements" body="pH, acidity, texture, water activity and related values" iconClass="bg-emerald-50 text-emerald-600" />
                <WhatCard Icon={Clock3} title="Sampling times" body="Time points, study days and associated measurements" iconClass="bg-orange-50 text-orange-600" />
              </div>
            </section>

            <section className="mt-7 flex flex-col items-center">
              <button
                onClick={handleExtract}
                disabled={!canExtract}
                className="group inline-flex min-w-[250px] items-center justify-center gap-2 rounded-xl bg-[#93052f] px-7 py-3.5 text-[14px] font-semibold text-white shadow-[0_12px_28px_rgba(147,5,47,0.24)] transition-all hover:-translate-y-0.5 hover:bg-[#7d0428] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {isRunning || sending ? <Loader2 size={17} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                {isRunning ? 'Extracting…' : job?.status === 'completed' ? 'Run extraction again' : 'Start extraction'}
              </button>
              <p className="mt-3 text-[11px] text-slate-400">Only the evidence prepared from this paper will be used.</p>
            </section>

            {job && (
              <section className="mx-auto mt-6 max-w-4xl">
                {isRunning ? (
                  <div className="rounded-2xl border border-[#eadde1] bg-[#fff8fa] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Loader2 size={18} className="animate-spin text-[#8B1538]" />
                        <div>
                          <p className="text-[13px] font-semibold text-slate-900">Building structured data</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{job.current_step}</p>
                        </div>
                      </div>
                      <span className="text-[12px] font-semibold text-[#8B1538]">{job.progress}%</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#efdde2]">
                      <div className="h-full rounded-full bg-[#8B1538] transition-all duration-500" style={{ width: `${job.progress}%` }} />
                    </div>
                  </div>
                ) : job.status === 'completed' ? (
                  <div className="space-y-2.5">
                    {(job.result?.provider_fallback?.length ?? 0) > 0 && (
                      <ProviderFallbackNotice events={job.result!.provider_fallback!} />
                    )}
                    <div className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
                        <div>
                          <p className="text-[13px] font-semibold text-emerald-900">Structured data is ready</p>
                          <p className="mt-1 text-[11px] text-emerald-700">
                            {job.result?.experiments_stored ?? 0} experiments · {job.result?.measurements_stored ?? 0} measurements
                          </p>
                        </div>
                      </div>
                      {(job.result?.experiments_stored ?? 0) > 0 && (
                        <button
                          onClick={() => navigate(`/projects/${pid}/papers/${paperId}/review`)}
                          className="rounded-xl bg-emerald-700 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-emerald-800"
                        >
                          Review extracted data →
                        </button>
                      )}
                    </div>
                  </div>
                ) : job.status === 'failed' ? (
                  <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
                    <AlertCircle size={19} className="mt-0.5 shrink-0 text-red-500" />
                    <div>
                      <p className="text-[13px] font-semibold text-red-800">Extraction could not finish</p>
                      {job.error_message && <p className="mt-1 text-[11px] leading-5 text-red-600">{job.error_message}</p>}
                    </div>
                  </div>
                ) : null}
              </section>
            )}

            {job?.status === 'completed' && (job.result?.experiments_stored ?? 0) > 0 && (
              <section className="mx-auto mt-4 max-w-4xl">
                <QualityInsights score={qualityScore} missing={missingFields} loading={insightsLoading} />
              </section>
            )}

            <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.035)]">
              <button
                onClick={() => setReviewOpen((value) => !value)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50/70"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0f3] text-[#8B1538]">
                  <BookOpen size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-slate-900">Review included evidence <span className="font-normal text-slate-400">(optional)</span></p>
                  <p className="mt-0.5 text-[11px] text-slate-500">See the tables, charts and text passages that will be used for extraction.</p>
                </div>
                <ChevronDown size={18} className={`text-slate-400 transition-transform ${reviewOpen ? 'rotate-180' : ''}`} />
              </button>

              {reviewOpen && (
                <div className="border-t border-slate-100 bg-[#fcfcfd] p-5">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {previewCharts.map((item) => (
                      <VisualAssetCard key={`chart-${item.id}`} item={item} kind="chart" projectId={pid} paperId={paperId} />
                    ))}
                    {previewTables.map((item) => (
                      <VisualAssetCard key={`table-${item.id}`} item={item} kind="table" projectId={pid} paperId={paperId} />
                    ))}
                    {previewParagraphs.map((item, index) => (
                      <TextEvidenceCard key={`text-${item.asset_id}-${item.link_id}-${index}`} item={item} />
                    ))}
                  </div>
                  {(pkgData.totals.paragraphs > previewParagraphs.length || pkgData.totals.native_tables > previewTables.length || pkgData.totals.chart_csvs > previewCharts.length) && (
                    <p className="mt-4 text-center text-[11px] text-slate-400">Showing a visual preview of the included evidence.</p>
                  )}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
            <FileText size={40} strokeWidth={1.2} className="text-slate-300" />
            <h2 className="mt-4 font-serif text-[25px] text-slate-900">Evidence is still being prepared</h2>
            <p className="mt-2 max-w-md text-[12px] leading-5 text-slate-500">Return to the paper overview once the paper analysis has finished.</p>
            <button
              onClick={() => navigate(`/projects/${pid}/papers/${paperId}/overview`)}
              className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back to paper overview
            </button>
          </section>
        )}
      </div>
    </div>
  )
}

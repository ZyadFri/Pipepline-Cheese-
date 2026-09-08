import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  BarChart2,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Image,
  Layers,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Star,
  Table2,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { papersApi, workspaceApi } from '../../services/api'
import AuthImage from '../../components/AuthImage'
import AssetCard from '../../components/AssetCard'
import AssetDetailPanel from '../../components/AssetDetailPanel'
import ExtractionTimeline from '../../components/ExtractionTimeline'
import PaperSummaryCard from '../../components/PaperSummaryCard'
import AskPaperChat from '../../components/AskPaperChat'
import { useExtractionStream } from '../../hooks/useExtractionStream'
import type { ExtractionAsset, WorkspaceStatus } from '../../types/workspace'

const FILTERS = [
  { id: 'all', label: 'All', icon: <Layers size={12} /> },
  { id: 'chart', label: 'Charts', icon: <BarChart2 size={12} /> },
  { id: 'native_table', label: 'Tables', icon: <Table2 size={12} /> },
  { id: 'figure', label: 'Figures', icon: <Image size={12} /> },
  { id: 'photograph', label: 'Photos', icon: <Image size={12} /> },
  { id: 'diagram', label: 'Diagrams', icon: <Image size={12} /> },
]

const NON_SCIENTIFIC = ['publisher_logo', 'license_icon', 'decorative_asset']

interface EvidencePreview {
  totals: { paragraphs: number; native_tables: number; chart_csvs: number }
  native_tables: { selected_for_llm: boolean }[]
  chart_csvs: { selected_for_llm: boolean }[]
}

function friendlyStep(raw: string | undefined, progress: number, pageImagesReady: number) {
  if (pageImagesReady > 0 && progress <= 5) return 'Reading the first pages and identifying scientific evidence…'
  const value = raw?.trim() ?? ''
  if (!value) return 'Preparing paper analysis…'
  if (/rendering page images/i.test(value)) return 'Preparing page previews…'
  if (/linking context/i.test(value)) return 'Linking captions, tables, figures and nearby text…'
  if (/chart/i.test(value) && /convert|read|process/i.test(value)) return 'Reading chart data…'
  if (/relevance|scor/i.test(value)) return 'Ranking the most useful scientific evidence…'
  if (/starting extraction/i.test(value)) return 'Preparing paper analysis…'
  return value
}

function assetLabel(asset: ExtractionAsset) {
  if (asset.asset_type === 'native_table') return 'Table'
  if (asset.classification === 'chart') return 'Chart'
  if (asset.classification === 'diagram') return 'Diagram'
  if (asset.classification === 'photograph') return 'Scientific image'
  return 'Figure'
}

function LiveEvidenceRow({
  asset,
  projectId,
  paperId,
  onOpen,
}: {
  asset: ExtractionAsset
  projectId: number
  paperId: number
  onOpen: (asset: ExtractionAsset) => void
}) {
  const label = assetLabel(asset)
  const isTable = asset.asset_type === 'native_table'

  return (
    <button
      onClick={() => onOpen(asset)}
      className="group flex w-full items-center gap-3 rounded-xl border border-[#eee5e7] bg-white p-2.5 text-left transition-all hover:-translate-y-px hover:border-[#dec3cb] hover:shadow-[0_12px_30px_-24px_rgba(87,24,46,.55)]"
    >
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f7f2f4]">
        {!isTable && asset.has_image ? (
          <AuthImage
            src={workspaceApi.imageUrl(projectId, paperId, asset.id)}
            alt={asset.caption || label}
            className="h-full w-full object-cover"
          />
        ) : (
          <Table2 size={20} className="text-[#a94b61]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#fff2f5] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#8B1730]">
            {label}
          </span>
          {asset.page_number && <span className="text-[9.5px] text-slate-400">Page {asset.page_number}</span>}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-snug text-[#566377]">
          {asset.caption || (isTable
            ? `${asset.csv_rows ?? '—'} rows × ${asset.csv_cols ?? '—'} columns`
            : 'Scientific visual extracted from the paper')}
        </p>
      </div>
      <ChevronRight size={13} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#8B1730]" />
    </button>
  )
}

export default function ExtractionWorkspacePage() {
  const { projectId, paperId } = useParams<{ projectId: string; paperId: string }>()
  const pid = Number(projectId)
  const paperIdNum = Number(paperId)
  const navigate = useNavigate()

  const [status, setStatus] = useState<WorkspaceStatus | null>(null)
  const [assets, setAssets] = useState<ExtractionAsset[]>([])
  const [paperName, setPaperName] = useState('')
  const [paperPageCount, setPaperPageCount] = useState(0)
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedAsset, setSelectedAsset] = useState<ExtractionAsset | null>(null)
  const [starting, setStarting] = useState(false)
  const [showAllAssets, setShowAllAssets] = useState(false)
  const [evidencePreview, setEvidencePreview] = useState<EvidencePreview | null>(null)
  const [previewPage, setPreviewPage] = useState(1)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isRunning = status?.status === 'running' || status?.status === 'queued'
  const isDone = status?.status === 'completed' || status?.status === 'partial_success'
  const isFailed = status?.status === 'failed' || status?.status === 'cancelled'

  const pageUrl = useCallback(
    (page: number) => `${api.defaults.baseURL}/projects/${pid}/papers/${paperIdNum}/pages/${page}/image`,
    [pid, paperIdNum],
  )

  const fetchAssets = useCallback(async () => {
    try {
      const res = await workspaceApi.listAssets(pid, paperIdNum, { limit: 200 })
      setAssets(res.items)
    } catch {
      // The status poll remains the correctness fallback while the job starts.
    }
  }, [pid, paperIdNum])

  const pollStatus = useCallback(async () => {
    try {
      const s: WorkspaceStatus = await workspaceApi.status(pid, paperIdNum)
      setStatus(s)
      if (s.status === 'running' || s.status === 'queued') {
        fetchAssets()
      } else if (s.status === 'completed' || s.status === 'partial_success') {
        fetchAssets()
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
        if (s.status === 'partial_success' && s.warnings?.length) {
          toast(`Analysis completed with ${s.warnings.length} warning(s)`, { icon: '⚠️' })
        }
      } else if (s.status === 'failed' || s.status === 'cancelled') {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
        if (s.status === 'failed') toast.error('Analysis failed: ' + (s.error ?? 'unknown error'))
      }
    } catch {
      // keep the existing UI while a transient request fails
    }
  }, [pid, paperIdNum, fetchAssets])

  const stream = useExtractionStream(pid, paperIdNum, {
    enabled: status?.status === 'running' || status?.status === 'queued',
    onAssetEvent: fetchAssets,
  })

  useEffect(() => {
    const init = async () => {
      // Fetch paper metadata independently from Docling. This gives the UI a
      // title/page count even while the analysis worker is still booting.
      papersApi.list(pid).then((list: any[]) => {
        const paper = list.find((item) => item.id === paperIdNum)
        if (paper) {
          setPaperName(paper.original_name || paper.filename || '')
          setPaperPageCount(Number(paper.page_count || 0))
        }
      }).catch(() => null)

      try {
        const s: WorkspaceStatus = await workspaceApi.status(pid, paperIdNum)
        setStatus(s)
        if (s.status === 'not_started') {
          setStarting(true)
          try {
            const res = await workspaceApi.start(pid, paperIdNum)
            setPaperName((current) => current || res.paper?.filename || '')
            const fresh = await workspaceApi.status(pid, paperIdNum)
            setStatus(fresh)
          } catch (e: any) {
            toast.error(e.response?.data?.detail ?? 'Failed to start paper analysis')
          } finally {
            setStarting(false)
          }
        } else if (s.status === 'completed' || s.status === 'partial_success') {
          fetchAssets()
          return
        } else if (s.status === 'running' || s.status === 'queued') {
          fetchAssets()
        }
        pollRef.current = setInterval(pollStatus, 2000)
      } catch {
        toast.error('Could not load paper analysis status')
      }
    }

    init()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pid, paperIdNum, fetchAssets, pollStatus])

  useEffect(() => {
    if (isRunning && !pollRef.current) pollRef.current = setInterval(pollStatus, 2000)
  }, [isRunning, pollStatus])

  useEffect(() => {
    if (!isDone) return
    workspaceApi.getEvidencePackages(pid, paperIdNum).then(setEvidencePreview).catch(() => null)
  }, [isDone, pid, paperIdNum, assets])

  const handleToggleSelect = async (asset: ExtractionAsset, val: boolean) => {
    try {
      const updated = await workspaceApi.patchAsset(pid, paperIdNum, asset.id, { selected_for_llm: val })
      setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, selected_for_llm: updated.selected_for_llm } : a))
      if (selectedAsset?.id === asset.id) {
        setSelectedAsset((prev) => prev ? { ...prev, selected_for_llm: updated.selected_for_llm } : prev)
      }
    } catch {
      toast.error('Failed to update evidence selection')
    }
  }

  const isOtherFigure = (a: ExtractionAsset) =>
    a.asset_type === 'figure' &&
    !['chart', 'photograph', 'diagram'].includes(a.classification) &&
    !NON_SCIENTIFIC.includes(a.classification)

  const nonScientific = assets.filter((a) => NON_SCIENTIFIC.includes(a.classification))
  const scientificAssets = assets.filter((a) => !NON_SCIENTIFIC.includes(a.classification))
  const visibleAssets = showAllAssets ? assets : scientificAssets
  const filteredAssets = visibleAssets.filter((a) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'figure') return isOtherFigure(a)
    return a.classification === activeFilter
  })

  const selectedCount = assets.filter((a) => a.selected_for_llm).length
  const evidenceTotal = evidencePreview
    ? evidencePreview.totals.paragraphs + evidencePreview.totals.native_tables + evidencePreview.totals.chart_csvs
    : 0
  const evidenceManual = evidencePreview
    ? evidencePreview.native_tables.filter((a) => a.selected_for_llm).length
      + evidencePreview.chart_csvs.filter((a) => a.selected_for_llm).length
    : 0
  const evidenceAuto = Math.max(0, evidenceTotal - evidenceManual)

  const progress = status?.progress ?? 0
  const nFigures = assets.filter(isOtherFigure).length
  const nTables = assets.filter((a) => a.asset_type === 'native_table').length
  const nCharts = assets.filter((a) => a.classification === 'chart').length

  const pageImagesReady = useMemo(() => {
    const event = [...stream.events].reverse().find((evt) => evt.type === 'page_images_ready')
    return Number(event?.payload?.page_count ?? 0)
  }, [stream.events])

  const totalPages = Math.max(
    1,
    Number(status?.result?.page_count || 0),
    Number(status?.total_pages || 0),
    Number(stream.totalPages || 0),
    Number(pageImagesReady || 0),
    Number(paperPageCount || 0),
  )
  const pagesDone = Math.max(Number(status?.pages_done || 0), Number(stream.pagesDone || 0))
  const displayedPages = Array.from({ length: Math.min(totalPages, 30) }, (_, i) => i + 1)
  const latestAssets = [...scientificAssets].sort((a, b) => b.id - a.id).slice(0, 10)
  const stepText = friendlyStep(status?.current_step, progress, pageImagesReady)

  if (!isDone && !isFailed && (isRunning || starting || !status)) {
    return (
      <div className="flex min-h-full flex-col bg-[radial-gradient(circle_at_74%_-8%,rgba(139,23,48,.07),transparent_28%),#fcf9fa]">
        <div className="shrink-0 border-b border-[#eee4e7] bg-white px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Link
                to={`/projects/${pid}`}
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#eee3e6] text-[#8290a3] hover:border-[#d9bdc5] hover:bg-[#fff8fa] hover:text-[#8B1730]"
              >
                <ArrowLeft size={15} />
              </Link>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e6675]">Live paper analysis</p>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#efd4db] bg-[#fff4f6] px-2.5 py-1 text-[9.5px] font-semibold text-[#8B1730]">
                    <Loader2 size={9} className="animate-spin" /> Analyzing
                  </span>
                </div>
                <h1 className="mt-1.5 max-w-4xl truncate font-display text-[22px] font-semibold leading-tight text-[#241a1e]">
                  {paperName || `Paper ${paperIdNum}`}
                </h1>
                <p className="mt-1 text-[11px] text-[#768398]">{stepText}</p>
              </div>
            </div>

            <div className="flex min-w-[280px] items-center gap-4 xl:w-[390px]">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-[#657287]">Overall progress</span>
                  <span className="font-bold text-[#8B1730]">{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#f1e8eb]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#8B1730,#c34d69)] transition-all duration-700"
                    style={{ width: `${Math.max(3, progress)}%` }}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-[#eee4e7] bg-[#fffafa] px-3 py-2 text-center">
                <p className="font-display text-[19px] leading-none text-[#2b2024]">{pagesDone}</p>
                <p className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">of {totalPages} pages</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-[260px_minmax(0,1fr)_330px]">
          <aside className="flex min-h-[520px] flex-col gap-4 xl:min-h-0">
            <section className="rounded-[20px] border border-[#eae0e3] bg-white p-4 shadow-[0_18px_42px_-38px_rgba(70,18,36,.6)]">
              <ExtractionTimeline events={stream.events} live={stream.connection === 'live'} />
            </section>

            <section className="rounded-[20px] border border-[#eae0e3] bg-white p-4 shadow-[0_18px_42px_-38px_rgba(70,18,36,.6)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8799]">What is ready</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: 'Pages', value: pageImagesReady || totalPages, Icon: FileText },
                  { label: 'Tables', value: nTables, Icon: Table2 },
                  { label: 'Charts', value: nCharts, Icon: BarChart3 },
                  { label: 'Figures', value: nFigures, Icon: Image },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className="rounded-xl border border-[#f0e8ea] bg-[#fffdfd] px-3 py-3">
                    <Icon size={13} className="text-[#a53b54]" />
                    <p className="mt-2 font-display text-[21px] leading-none text-[#2b2024]">{value}</p>
                    <p className="mt-1 text-[9px] font-medium text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[9.5px] leading-relaxed text-[#98a2b1]">
                These are real persisted results. New evidence appears here without waiting for the whole paper to finish.
              </p>
            </section>
          </aside>

          <main className="min-h-[620px] overflow-hidden rounded-[22px] border border-[#e7dde0] bg-white shadow-[0_24px_55px_-45px_rgba(67,17,34,.7)] xl:min-h-0">
            <div className="flex items-center justify-between border-b border-[#eee6e8] bg-white px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold text-[#536176]">Paper preview</p>
                <p className="mt-0.5 text-[9.5px] text-[#9aa4b2]">Available immediately — independent of the slower scientific analysis</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  disabled={previewPage <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#eee4e7] text-[#768398] disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="min-w-[74px] text-center text-[10px] font-semibold text-[#657287]">Page {previewPage} / {totalPages}</span>
                <button
                  onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))}
                  disabled={previewPage >= totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#eee4e7] text-[#768398] disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div className="flex h-[calc(100%-62px)] min-h-[560px] items-start justify-center overflow-auto bg-[linear-gradient(145deg,#f3f0f1,#faf7f8)] p-5">
              <div className="relative mx-auto w-full max-w-[780px]">
                <AuthImage
                  key={previewPage}
                  src={pageUrl(previewPage)}
                  alt={`Page ${previewPage} of ${paperName || 'paper'}`}
                  className="mx-auto block max-h-[calc(100vh-285px)] w-auto max-w-full rounded-[10px] bg-white object-contain shadow-[0_28px_55px_-35px_rgba(34,25,29,.45)] ring-1 ring-black/5"
                />
              </div>
            </div>
          </main>

          <aside className="flex min-h-[620px] flex-col gap-4 xl:min-h-0">
            <section className="max-h-[235px] overflow-hidden rounded-[20px] border border-[#eae0e3] bg-white shadow-[0_18px_42px_-38px_rgba(70,18,36,.6)]">
              <div className="flex items-center justify-between border-b border-[#f0e8ea] px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8799]">Pages</p>
                  <p className="mt-0.5 text-[9px] text-slate-400">Click a thumbnail to preview</p>
                </div>
                <span className="rounded-full bg-[#fff2f5] px-2 py-1 text-[9px] font-bold text-[#8B1730]">{totalPages}</span>
              </div>
              <div className="scrollbar-none flex gap-2 overflow-x-auto p-3">
                {displayedPages.map((page) => (
                  <button
                    key={page}
                    onClick={() => setPreviewPage(page)}
                    className={clsx(
                      'relative h-[112px] w-[78px] shrink-0 overflow-hidden rounded-lg border bg-white transition-all',
                      previewPage === page
                        ? 'border-[#8B1730] shadow-[0_8px_20px_-14px_rgba(139,23,48,.8)] ring-2 ring-[#8B1730]/10'
                        : 'border-[#e9e1e3] hover:border-[#d7bbc3]',
                    )}
                  >
                    <AuthImage src={pageUrl(page)} alt={`Page ${page}`} className="h-full w-full object-cover object-top" />
                    <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 py-0.5 text-[8px] font-semibold text-[#69768a] shadow-sm">{page}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-[#eae0e3] bg-white shadow-[0_18px_42px_-38px_rgba(70,18,36,.6)]">
              <div className="flex items-center justify-between border-b border-[#f0e8ea] px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8799]">Evidence appearing live</p>
                  </div>
                  <p className="mt-0.5 text-[9px] text-slate-400">Tables and figures are added as soon as each chunk is ready</p>
                </div>
                <span className="text-[10px] font-semibold text-[#8B1730]">{scientificAssets.length}</span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {latestAssets.length === 0 ? (
                  <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[#eadfe2] bg-[#fffafa] px-5 text-center">
                    <LayoutGrid size={26} strokeWidth={1.2} className="text-[#c7b4ba]" />
                    <p className="mt-3 text-[11px] font-medium text-[#7d8999]">The page preview is already available.</p>
                    <p className="mt-1 max-w-[240px] text-[9.5px] leading-relaxed text-[#a2abb7]">
                      Scientific tables and figures will appear here as soon as the first page chunks finish — you no longer need to wait for the full paper.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {latestAssets.map((asset) => (
                      <LiveEvidenceRow
                        key={asset.id}
                        asset={asset}
                        projectId={pid}
                        paperId={paperIdNum}
                        onOpen={setSelectedAsset}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        {selectedAsset && (
          <AssetDetailPanel
            asset={selectedAsset}
            projectId={pid}
            paperId={paperIdNum}
            onClose={() => setSelectedAsset(null)}
            onToggleSelect={handleToggleSelect}
          />
        )}
      </div>
    )
  }

  if (isFailed) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#fcf9fa] p-6">
        <div className="w-full max-w-lg rounded-[24px] border border-[#eddde2] bg-white p-7 text-center shadow-[0_28px_70px_-52px_rgba(91,20,43,.75)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertCircle size={24} className="text-red-400" />
          </div>
          <h2 className="mt-4 font-display text-[24px] text-[#2b2024]">
            {status?.status === 'cancelled' ? 'Analysis cancelled' : 'Paper analysis failed'}
          </h2>
          {status?.status !== 'cancelled' && (
            <p className="mt-2 text-[11px] leading-relaxed text-red-500">{status?.error ?? 'Unknown error'}</p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Link to={`/projects/${pid}`} className="rounded-xl border border-[#e8dde0] bg-white px-4 py-2.5 text-[11px] font-semibold text-[#657287]">
              Back to dashboard
            </Link>
            <button
              onClick={async () => {
                setStarting(true)
                try {
                  await workspaceApi.start(pid, paperIdNum)
                  const s = await workspaceApi.status(pid, paperIdNum)
                  setStatus(s)
                  pollRef.current = setInterval(pollStatus, 2000)
                } finally {
                  setStarting(false)
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#8B1730] px-4 py-2.5 text-[11px] font-semibold text-white"
            >
              <RefreshCw size={12} /> Retry analysis
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_70%_-10%,rgba(139,23,48,.06),transparent_28%),#fcf9fa] p-4 lg:p-5">
      <section className="overflow-hidden rounded-[22px] border border-[#e8dde0] bg-white shadow-[0_22px_50px_-44px_rgba(74,18,38,.7)]">
        <div className="grid gap-5 p-4 md:grid-cols-[126px_minmax(0,1fr)_auto] md:items-center lg:p-5">
          <div className="h-[158px] overflow-hidden rounded-xl border border-[#e9e0e2] bg-[#f6f2f3] shadow-[0_16px_30px_-25px_rgba(55,28,37,.5)]">
            <AuthImage src={pageUrl(1)} alt="First page" className="h-full w-full object-cover object-top" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[9.5px] font-semibold text-emerald-700">
                <CheckCircle2 size={10} /> {status?.status === 'partial_success' ? 'Analysis ready · warnings present' : 'Analysis ready'}
              </span>
              <span className="text-[9.5px] text-slate-400">{status?.result?.page_count ?? totalPages} pages</span>
            </div>
            <h1 className="mt-2 truncate font-display text-[24px] font-semibold text-[#271d21]">{paperName || `Paper ${paperIdNum}`}</h1>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#7d8999]">
              Your paper has been separated into reviewable scientific evidence. Open any table or figure to inspect its original source and provenance.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { label: 'Tables', value: nTables, Icon: Table2 },
                { label: 'Charts', value: nCharts, Icon: BarChart3 },
                { label: 'Figures', value: nFigures, Icon: Image },
                { label: 'Evidence', value: scientificAssets.length, Icon: Layers },
              ].map(({ label, value, Icon }) => (
                <span key={label} className="inline-flex items-center gap-1.5 rounded-lg border border-[#eee5e7] bg-[#fffdfd] px-2.5 py-1.5 text-[9.5px] font-medium text-[#69768a]">
                  <Icon size={11} className="text-[#a43c55]" /> {value} {label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 md:min-w-[180px]">
            {evidenceTotal > 0 && (
              <button
                onClick={() => navigate(`/projects/${pid}/validation?paperId=${paperIdNum}`)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8B1730] px-4 py-2.5 text-[11px] font-semibold text-white shadow-[0_12px_24px_-18px_rgba(139,23,48,.85)] hover:bg-[#751329]"
              >
                <Star size={12} /> Extract structured data <ChevronRight size={11} />
              </button>
            )}
            {nCharts > 0 && (
              <Link
                to={`/projects/${pid}/papers/${paperIdNum}/charts`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#e6dade] bg-white px-4 py-2.5 text-[11px] font-semibold text-[#657287] hover:bg-[#fff9fa]"
              >
                <BarChart3 size={12} /> Open charts
              </Link>
            )}
          </div>
        </div>

        {(status?.warnings?.length ?? 0) > 0 && (
          <div className="flex items-start gap-2 border-t border-amber-100 bg-amber-50 px-5 py-2.5">
            <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="text-[10.5px] leading-snug text-amber-700">
              {status!.warnings!.length} item{status!.warnings!.length !== 1 ? 's' : ''} could not be processed: {status!.warnings!.join(' · ')}
            </div>
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <PaperSummaryCard projectId={pid} paperId={paperIdNum} />
        <AskPaperChat projectId={pid} paperId={paperIdNum} />
      </div>

      <section className="mt-4 overflow-hidden rounded-[22px] border border-[#e8dde0] bg-white shadow-[0_22px_50px_-44px_rgba(74,18,38,.65)]">
        <div className="flex flex-col gap-3 border-b border-[#eee6e8] px-4 py-3 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-display text-[20px] text-[#2a2024]">Scientific evidence</h2>
            <p className="mt-0.5 text-[9.5px] text-slate-400">Tables, charts and figures extracted from the paper</p>
          </div>
          <div className="flex-1" />
          <div className="flex gap-1 overflow-x-auto">
            <Filter size={12} className="mr-1 mt-2 text-slate-400" />
            {FILTERS.map((f) => {
              const count = f.id === 'all'
                ? visibleAssets.length
                : f.id === 'figure'
                ? visibleAssets.filter(isOtherFigure).length
                : visibleAssets.filter((a) => a.classification === f.id).length
              if (count === 0 && f.id !== 'all') return null
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={clsx(
                    'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium transition-colors',
                    activeFilter === f.id ? 'bg-[#8B1730] text-white' : 'text-slate-500 hover:bg-[#f8f3f4]',
                  )}
                >
                  {f.icon}{f.label}<span className={clsx('text-[9px]', activeFilter === f.id ? 'text-white/70' : 'text-slate-400')}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {nonScientific.length > 0 && (
          <div className="flex justify-end border-b border-[#f2ebed] px-4 py-2">
            <button
              onClick={() => setShowAllAssets((v) => !v)}
              className="text-[9.5px] font-medium text-slate-400 hover:text-[#8B1730]"
            >
              {showAllAssets
                ? 'Hide non-scientific images'
                : `${nonScientific.length} non-scientific image${nonScientific.length !== 1 ? 's' : ''} hidden · Show all`}
            </button>
          </div>
        )}

        <div className="bg-[#fdfafb] p-4">
          {filteredAssets.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-300">
              <Layers size={34} strokeWidth={1} />
              <p className="text-sm">No evidence matches this filter.</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-[10px] text-slate-400">
                {filteredAssets.length} element{filteredAssets.length !== 1 ? 's' : ''}
                {selectedCount > 0 && ` · ${selectedCount} starred`}
                {evidenceTotal > 0 && ` · ${evidenceManual} manually selected · ${evidenceAuto} automatically included for extraction`}
              </p>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    projectId={pid}
                    paperId={paperIdNum}
                    onClick={setSelectedAsset}
                    onToggleSelect={handleToggleSelect}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          projectId={pid}
          paperId={paperIdNum}
          onClose={() => setSelectedAsset(null)}
          onToggleSelect={handleToggleSelect}
        />
      )}
    </div>
  )
}
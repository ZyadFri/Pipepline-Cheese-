import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, Loader2, AlertCircle,
  BarChart3, Table2, Image, Layers, Filter, RefreshCw,
  FileText, Star, ChevronRight, FileType2, LayoutGrid,
  BarChart2, AlignLeft,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { workspaceApi } from '../../services/api'
import AuthImage from '../../components/AuthImage'
import AssetCard from '../../components/AssetCard'
import AssetDetailPanel from '../../components/AssetDetailPanel'
import ExtractionTimeline from '../../components/ExtractionTimeline'
import { useExtractionStream } from '../../hooks/useExtractionStream'
import type { ExtractionAsset, WorkspaceStatus } from '../../types/workspace'

// ─── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS = [
  { id: 'all',          label: 'All',     icon: <Layers size={12} /> },
  { id: 'chart',        label: 'Charts',  icon: <BarChart2 size={12} /> },
  { id: 'native_table', label: 'Tables',  icon: <Table2 size={12} /> },
  { id: 'figure',       label: 'Figures', icon: <Image size={12} /> },
  { id: 'photograph',   label: 'Photos',  icon: <Image size={12} /> },
  { id: 'diagram',      label: 'Diagrams',icon: <Image size={12} /> },
]

// Publisher logos, license icons, and decorative graphics — never scientific
// evidence. Hidden from the gallery by default (same categories
// DoclingResultsPage.tsx already segregates into its own collapsed section).
const NON_SCIENTIFIC = ['publisher_logo', 'license_icon', 'decorative_asset']

interface EvidencePreview {
  totals: { paragraphs: number; native_tables: number; chart_csvs: number }
  native_tables: { selected_for_llm: boolean }[]
  chart_csvs: { selected_for_llm: boolean }[]
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ExtractionWorkspacePage() {
  const { projectId, paperId } = useParams<{ projectId: string; paperId: string }>()
  const pid        = Number(projectId)
  const paperIdNum = Number(paperId)
  const navigate   = useNavigate()

  const [status, setStatus]               = useState<WorkspaceStatus | null>(null)
  const [assets, setAssets]               = useState<ExtractionAsset[]>([])
  const [paperName, setPaperName]         = useState('')
  const [activeFilter, setActiveFilter]   = useState('all')
  const [selectedAsset, setSelectedAsset] = useState<ExtractionAsset | null>(null)
  const [starting, setStarting]           = useState(false)
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null)
  const [showAllAssets, setShowAllAssets] = useState(false)
  const [evidencePreview, setEvidencePreview] = useState<EvidencePreview | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isRunning = status?.status === 'running' || status?.status === 'queued'
  const isDone    = status?.status === 'completed' || status?.status === 'partial_success'
  const isFailed  = status?.status === 'failed' || status?.status === 'cancelled'

  // ── Fetch assets ────────────────────────────────────────────────────────────
  const fetchAssets = useCallback(async () => {
    try {
      const res = await workspaceApi.listAssets(pid, paperIdNum, { limit: 200 })
      setAssets(res.items)
      const withPage = (res.items as ExtractionAsset[]).find((a) => a.has_page_image)
      if (withPage && !previewUrl) {
        setPreviewUrl(workspaceApi.pageImageUrl(pid, paperIdNum, withPage.id))
      }
    } catch { /* silent */ }
  }, [pid, paperIdNum])

  // ── Poll status ─────────────────────────────────────────────────────────────
  const pollStatus = useCallback(async () => {
    try {
      const s: WorkspaceStatus = await workspaceApi.status(pid, paperIdNum)
      setStatus(s)
      if (s.status === 'running' || s.status === 'queued') fetchAssets()
      else if (s.status === 'completed' || s.status === 'partial_success') {
        fetchAssets()
        if (pollRef.current) clearInterval(pollRef.current)
        if (s.status === 'partial_success' && s.warnings?.length) {
          toast(`Extraction completed with ${s.warnings.length} warning(s)`, { icon: '⚠️' })
        }
      } else if (s.status === 'failed' || s.status === 'cancelled') {
        if (pollRef.current) clearInterval(pollRef.current)
        if (s.status === 'failed') toast.error('Extraction failed: ' + (s.error ?? 'unknown error'))
      }
    } catch { /* silent */ }
  }, [pid, paperIdNum, fetchAssets])

  // ── Live progress stream (real backend events; falls back to the polling
  // above if SSE isn't available) ─────────────────────────────────────────────
  const stream = useExtractionStream(pid, paperIdNum, {
    enabled: status?.status === 'running' || status?.status === 'queued',
    onAssetEvent: fetchAssets,
  })

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const s: WorkspaceStatus = await workspaceApi.status(pid, paperIdNum)
      setStatus(s)
      if (s.status === 'not_started') {
        setStarting(true)
        try {
          const res = await workspaceApi.start(pid, paperIdNum)
          setPaperName(res.paper?.filename ?? '')
          const fresh = await workspaceApi.status(pid, paperIdNum)
          setStatus(fresh)
        } catch (e: any) {
          toast.error(e.response?.data?.detail ?? 'Failed to start extraction')
        } finally {
          setStarting(false)
        }
      } else if (s.status === 'completed') {
        fetchAssets(); return
      } else if (s.status === 'running' || s.status === 'queued') {
        fetchAssets()
      }
      pollRef.current = setInterval(pollStatus, 2500)
    }
    init()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [pid, paperIdNum])

  useEffect(() => {
    if (isRunning && !pollRef.current) pollRef.current = setInterval(pollStatus, 2500)
  }, [isRunning, pollStatus])

  // Preview of what extraction will actually use — the backend auto-includes
  // high-relevance tables/charts beyond whatever the user manually starred, so
  // "N starred" alone understates what gets processed. This resolves that gap.
  useEffect(() => {
    if (!isDone) return
    workspaceApi.getEvidencePackages(pid, paperIdNum).then(setEvidencePreview).catch(() => null)
  }, [isDone, pid, paperIdNum, assets])

  const handleToggleSelect = async (asset: ExtractionAsset, val: boolean) => {
    try {
      const updated = await workspaceApi.patchAsset(pid, paperIdNum, asset.id, { selected_for_llm: val })
      setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, selected_for_llm: updated.selected_for_llm } : a))
      if (selectedAsset?.id === asset.id)
        setSelectedAsset((prev) => prev ? { ...prev, selected_for_llm: updated.selected_for_llm } : prev)
    } catch {
      toast.error('Failed to update selection')
    }
  }

  // "Figures" means a figure asset that ISN'T already counted under a more
  // specific category (chart/photograph/diagram) — otherwise Figures and
  // Charts/Photos/Diagrams double-count the same assets, matching the fix
  // already applied in DoclingResultsPage.tsx's otherFigs computation.
  const isOtherFigure = (a: ExtractionAsset) =>
    a.asset_type === 'figure' && !['chart', 'photograph', 'diagram'].includes(a.classification) &&
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

  // Manual-vs-automatic breakdown: the backend auto-includes high-relevance
  // tables/charts beyond whatever's manually starred, so "N starred" alone
  // understates what extraction will actually use. evidencePreview mirrors
  // extraction_workspace.py's own selection logic (same endpoint Evidence
  // Review previews from), so counting selected_for_llm within it gives an
  // accurate manual/auto split without duplicating that logic client-side.
  const evidenceTotal = evidencePreview
    ? evidencePreview.totals.paragraphs + evidencePreview.totals.native_tables + evidencePreview.totals.chart_csvs
    : 0
  const evidenceManual = evidencePreview
    ? evidencePreview.native_tables.filter((a) => a.selected_for_llm).length
      + evidencePreview.chart_csvs.filter((a) => a.selected_for_llm).length
    : 0
  const evidenceAuto = Math.max(0, evidenceTotal - evidenceManual)

  const progress  = status?.progress ?? 0
  const nFigures  = assets.filter(isOtherFigure).length
  const nTables   = assets.filter((a) => a.asset_type === 'native_table').length
  const nCharts   = assets.filter((a) => a.classification === 'chart').length

  // ─── Processing view ───────────────────────────────────────────────────────
  if (!isDone && !isFailed && (isRunning || starting || !status)) {
    return (
      <div className="flex flex-col h-full bg-white">

        {/* Info bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
          <Link to={`/projects/${pid}/upload`} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 truncate">{paperName || `Paper ${paperIdNum}`}</h1>
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: 'var(--primary)', background: 'rgba(122,27,46,0.06)', borderColor: 'rgba(122,27,46,0.16)' }}>
                <Loader2 size={9} className="animate-spin" /> Running
              </span>
            </div>
            {status?.current_step && (
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">{status.current_step}</p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <span className="text-sm font-bold text-slate-700">{progress}%</span>
            <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: 'var(--primary)' }} />
            </div>
          </div>
        </div>

        {/* Real page-parsing progress — pagesDone/totalPages come straight from
            the backend's chunked Docling loop, not an inferred client-side stage */}
        {stream.totalPages > 0 && (
          <div className="flex items-center gap-3 px-5 py-2 border-b border-slate-100 bg-slate-50 shrink-0">
            <span className="text-[10.5px] font-medium text-slate-500 shrink-0">
              Pages {stream.pagesDone} / {stream.totalPages}
            </span>
            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden max-w-xs">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, (stream.pagesDone / stream.totalPages) * 100)}%` }}
              />
            </div>
            {stream.tablesFound > 0 && (
              <span className="text-[10.5px] text-slate-400 shrink-0">{stream.tablesFound} table(s)</span>
            )}
            {stream.figuresFound > 0 && (
              <span className="text-[10.5px] text-slate-400 shrink-0">{stream.figuresFound} figure(s)</span>
            )}
            {stream.connection !== 'live' && (
              <span className="text-[10px] text-slate-300 shrink-0 ml-auto">
                {stream.connection === 'connecting' ? 'Connecting…' : 'Live updates unavailable — polling'}
              </span>
            )}
          </div>
        )}

        {/* 3-column body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: live timeline + counts */}
          <div className="w-56 shrink-0 border-r border-slate-200 flex flex-col overflow-y-auto">
            <div className="px-4 py-3">
              <ExtractionTimeline events={stream.events} live={stream.connection === 'live'} />
            </div>

            {assets.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 mt-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Extracted</p>
                <div className="space-y-2">
                  {[
                    { label: 'Figures',  count: nFigures, Icon: Image,    color: 'text-violet-500' },
                    { label: 'Charts',   count: nCharts,  Icon: BarChart3, color: 'text-emerald-500' },
                    { label: 'Tables',   count: nTables,  Icon: Table2,   color: 'text-blue-500' },
                  ].map(({ label, count, Icon, color }) => (
                    <div key={label} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                      <div className="flex items-center gap-1.5">
                        <Icon size={12} className={color} />
                        <span className="text-[11px] text-slate-600">{label}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-800">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Center: document preview */}
          <div className="flex-1 flex flex-col bg-slate-100 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <FileType2 size={12} className="text-slate-400" />
                Document Preview
              </span>
              <span className="text-[10px] text-slate-400">
                {assets.length > 0 ? `${assets.length} elements detected` : 'Parsing…'}
              </span>
            </div>
            <div className="flex-1 overflow-auto flex items-start justify-center p-6">
              {previewUrl ? (
                <AuthImage
                  src={previewUrl}
                  alt="Page preview"
                  className="max-w-full rounded-xl border border-slate-300 shadow-lg bg-white"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4 py-20 w-full">
                  <FileText size={44} strokeWidth={1} />
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-400">
                      {progress < 25 ? 'Parsing document structure…' : 'Extracting visual elements…'}
                    </p>
                    <p className="text-xs text-slate-300 mt-1">Preview will appear once pages are rendered</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: live mini-gallery */}
          <div className="w-64 shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <LayoutGrid size={11} className="text-slate-400" />
                Live Gallery
              </span>
              {assets.length > 0 && <span className="text-[10px] text-slate-400">{assets.length}</span>}
            </div>
            <div className="flex-1 overflow-y-auto p-2.5">
              {assets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-200 gap-2 py-10">
                  <LayoutGrid size={28} strokeWidth={1} />
                  <p className="text-[11px] text-center text-slate-300">Elements appear here as they are extracted</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {assets.map((asset) => (
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
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Failure view ──────────────────────────────────────────────────────────
  if (isFailed) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5">
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
          <AlertCircle size={24} className="text-red-400" />
        </div>
        <div className="text-center">
          <h2 className="text-base font-bold text-slate-700">
            {status?.status === 'cancelled' ? 'Extraction cancelled' : 'Extraction failed'}
          </h2>
          {status?.status !== 'cancelled' && (
            <p className="text-sm text-red-500 mt-1 max-w-md">{status?.error ?? 'Unknown error'}</p>
          )}
        </div>
        <div className="flex gap-3">
          <Link to={`/projects/${pid}/upload`} className="btn-secondary text-sm">
            <ArrowLeft size={13} /> Back
          </Link>
          <button
            onClick={async () => {
              setStarting(true)
              try {
                await workspaceApi.start(pid, paperIdNum)
                const s = await workspaceApi.status(pid, paperIdNum)
                setStatus(s)
                pollRef.current = setInterval(pollStatus, 2500)
              } finally { setStarting(false) }
            }}
            className="btn-primary text-sm"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      </div>
    )
  }

  // ─── Explorer view (completed) ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
        <Link to={`/projects/${pid}/upload`} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            Extraction Workspace
            {status?.status === 'partial_success' ? (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                Complete — review required
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                Complete
              </span>
            )}
          </h1>
          {status?.result && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {status.result.page_count} pages · {status.result.figures} figures
              {status.result.chart_conversion_available === false
                ? ' (chart reading unavailable)'
                : ` (${status.result.charts} charts)`}
              {' '}· {status.result.native_tables} tables
              {status.result.decorative_excluded
                ? ` · ${status.result.decorative_excluded} decorative excluded`
                : ''}
            </p>
          )}
        </div>
        <Link
          to={`/projects/${pid}/papers/${paperIdNum}/charts`}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
        >
          <BarChart3 size={12} />
          Charts
        </Link>
        {evidenceTotal > 0 && (
          <button
            onClick={() => navigate(`/projects/${pid}/validation?paperId=${paperIdNum}`)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#7A1B2E] text-white rounded-lg text-xs font-semibold hover:bg-[#661523] transition-colors"
            title={
              `${evidenceTotal} item(s): ${evidenceManual} manually selected, ${evidenceAuto} automatically included ` +
              `(${evidencePreview?.totals.paragraphs ?? 0} text, ${evidencePreview?.totals.native_tables ?? 0} tables, ${evidencePreview?.totals.chart_csvs ?? 0} charts)`
            }
          >
            <Star size={12} />
            {evidenceTotal} item{evidenceTotal !== 1 ? 's' : ''} ready
            {evidenceManual > 0 && ` (${evidenceManual} starred)`}
            <ChevronRight size={11} />
          </button>
        )}
      </div>

      {/* Warnings — shown only when something genuinely failed, never fabricated */}
      {(status?.warnings?.length ?? 0) > 0 && (
        <div className="flex items-start gap-2 px-5 py-2 border-b border-amber-100 bg-amber-50 shrink-0">
          <AlertCircle size={13} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="text-[11px] text-amber-700 leading-snug">
            {status!.warnings!.length} item{status!.warnings!.length !== 1 ? 's' : ''} could not be processed:{' '}
            {status!.warnings!.join(' · ')}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-5 py-2 border-b border-slate-100 shrink-0 overflow-x-auto">
        <Filter size={12} className="text-slate-400 mr-1 shrink-0" />
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
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap',
                activeFilter === f.id ? 'bg-[#7A1B2E] text-white' : 'text-slate-500 hover:bg-slate-100',
              )}
            >
              {f.icon}{f.label}
              <span className={clsx('ml-0.5 text-[10px]', activeFilter === f.id ? 'opacity-70' : 'text-slate-400')}>{count}</span>
            </button>
          )
        })}
        {nonScientific.length > 0 && (
          <button
            onClick={() => setShowAllAssets((v) => !v)}
            className="ml-auto text-[10px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded-md hover:bg-slate-100 whitespace-nowrap"
          >
            {showAllAssets
              ? 'Hide non-scientific images'
              : `${nonScientific.length} non-scientific image${nonScientific.length !== 1 ? 's' : ''} hidden · Show all assets`}
          </button>
        )}
      </div>

      {/* Gallery */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
        {filteredAssets.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-300 gap-2">
            <Layers size={36} strokeWidth={1} />
            <p className="text-sm">No elements match this filter.</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-slate-400 mb-3">
              {filteredAssets.length} element{filteredAssets.length !== 1 ? 's' : ''}
              {selectedCount > 0 && ` · ${selectedCount} starred`}
              {evidenceTotal > 0 && (
                <>
                  {' · '}
                  {evidenceTotal} item{evidenceTotal !== 1 ? 's' : ''} will be used for extraction:{' '}
                  {evidenceManual} manually selected, {evidenceAuto} automatically included
                  {' '}({evidencePreview?.totals.paragraphs ?? 0} text, {evidencePreview?.totals.native_tables ?? 0} tables, {evidencePreview?.totals.chart_csvs ?? 0} charts)
                </>
              )}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
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

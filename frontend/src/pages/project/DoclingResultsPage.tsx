import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  RefreshCw, Loader2, Table2, BarChart2, Image, AlertCircle,
  Eye, EyeOff, ChevronDown, ChevronRight, FileText,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { workspaceApi } from '../../services/api'
import type { ExtractionAsset } from '../../types/workspace'
import AssetDetailPanel from '../../components/AssetDetailPanel'

// ─── Constants ─────────────────────────────────────────────────────────────────

const NON_SCIENTIFIC = ['publisher_logo', 'license_icon', 'decorative_asset']

const CLASS_META: Record<string, { label: string; cls: string }> = {
  chart:               { label: 'Chart',              cls: 'bg-emerald-100 text-emerald-700' },
  native_table:        { label: 'Native Table',       cls: 'bg-[#f3dde2] text-[#661523]' },
  photograph:          { label: 'Photograph',         cls: 'bg-slate-100 text-slate-600' },
  diagram:             { label: 'Diagram',            cls: 'bg-violet-100 text-violet-700' },
  chemical_structure:  { label: 'Chemical Structure', cls: 'bg-amber-100 text-amber-700' },
  multi_panel_figure:  { label: 'Multi-Panel',        cls: 'bg-indigo-100 text-indigo-700' },
  publisher_logo:      { label: 'Publisher Logo',     cls: 'bg-slate-100 text-slate-400' },
  license_icon:        { label: 'License Icon',       cls: 'bg-slate-100 text-slate-400' },
  decorative_asset:    { label: 'Decorative',         cls: 'bg-slate-100 text-slate-400' },
  unknown:             { label: 'Unknown',            cls: 'bg-slate-100 text-slate-500' },
}

// ─── Asset row ─────────────────────────────────────────────────────────────────

interface AssetRowProps {
  asset: ExtractionAsset
  pid: number
  paperIdNum: number
  onToggle: (id: number, val: boolean) => Promise<void>
  onClick: (asset: ExtractionAsset) => void
}

function AssetRow({ asset, pid, paperIdNum, onToggle, onClick }: AssetRowProps) {
  const [toggling, setToggling] = useState(false)
  const [imgError, setImgError] = useState(false)

  const cls = CLASS_META[asset.classification] ?? CLASS_META.unknown
  const imgUrl = workspaceApi.imageUrl(pid, paperIdNum, asset.id)

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setToggling(true)
    try {
      await onToggle(asset.id, !asset.selected_for_llm)
    } finally {
      setToggling(false)
    }
  }

  const bboxStr = asset.bbox
    ? `[${asset.bbox.x1.toFixed(0)}, ${asset.bbox.y1.toFixed(0)}, ${asset.bbox.x2.toFixed(0)}, ${asset.bbox.y2.toFixed(0)}]`
    : null

  return (
    <div
      onClick={() => onClick(asset)}
      className={clsx(
        'group flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all',
        'hover:shadow-sm hover:border-slate-300',
        asset.selected_for_llm
          ? 'border-[#d9a5b3] bg-[#fdf3f5]/20'
          : 'border-slate-200 bg-white',
      )}
    >
      {/* Thumbnail / icon */}
      <div className="w-14 h-14 rounded-md bg-slate-100 shrink-0 overflow-hidden flex items-center justify-center">
        {asset.asset_type === 'figure' && asset.has_image && !imgError ? (
          <img
            src={imgUrl}
            alt={asset.caption ?? 'Figure'}
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : asset.asset_type === 'native_table' ? (
          <Table2 size={20} className="text-slate-400" />
        ) : (
          <Image size={20} className="text-slate-300" />
        )}
      </div>

      {/* Metadata */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 justify-between">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0', cls.cls)}>
              {cls.label}
            </span>
            {asset.page_number != null && (
              <span className="text-[10px] text-slate-400 shrink-0">p.{asset.page_number}</span>
            )}
            {asset.section_name && (
              <span className="text-[10px] text-slate-400 italic truncate">{asset.section_name}</span>
            )}
            {asset.relevance_score > 0 && (
              <span className={clsx(
                'text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0',
                asset.relevance_score >= 3 ? 'bg-emerald-50 text-emerald-700' :
                asset.relevance_score >= 1 ? 'bg-amber-50 text-amber-600' :
                'bg-slate-50 text-slate-500',
              )}>
                ★ {asset.relevance_score.toFixed(1)}
              </span>
            )}
          </div>

          {/* Include / Exclude button */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            title={asset.selected_for_llm ? 'Remove from evidence' : 'Include as evidence'}
            className={clsx(
              'shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100',
              asset.selected_for_llm
                ? 'bg-[#f3dde2] text-[#661523] hover:bg-[#e8c6d0] opacity-100'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200',
            )}
          >
            {toggling ? (
              <Loader2 size={9} className="animate-spin" />
            ) : asset.selected_for_llm ? (
              <Eye size={9} />
            ) : (
              <EyeOff size={9} />
            )}
            {asset.selected_for_llm ? 'Included' : 'Include'}
          </button>
        </div>

        {/* Caption */}
        {asset.caption ? (
          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed line-clamp-2">{asset.caption}</p>
        ) : (
          <p className="text-[11px] text-slate-300 mt-1 italic">No caption</p>
        )}

        {/* Technical metadata row */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {asset.docling_item_ref && (
            <code className="text-[9px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded font-mono">
              {asset.docling_item_ref}
            </code>
          )}
          {bboxStr && (
            <code className="text-[9px] text-slate-300 font-mono">bbox {bboxStr}</code>
          )}
          {asset.asset_type === 'native_table' && asset.csv_rows != null && (
            <span className="text-[9px] text-emerald-600 font-medium">
              {asset.csv_rows}r × {asset.csv_cols}c
            </span>
          )}
          {asset.conversion_status === 'complete' && (
            <span className="text-[9px] text-emerald-600 font-medium">CSV ready</span>
          )}
          {asset.conversion_status === 'failed' && (
            <span className="text-[9px] text-red-500 font-medium">Conversion failed</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Section ───────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  icon: React.ReactNode
  assets: ExtractionAsset[]
  pid: number
  paperIdNum: number
  onToggle: (id: number, val: boolean) => Promise<void>
  onClick: (asset: ExtractionAsset) => void
  defaultOpen?: boolean
  countCls?: string
}

function Section({
  title, icon, assets, pid, paperIdNum, onToggle, onClick,
  defaultOpen = true, countCls,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (assets.length === 0) return null

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-1 py-1.5 text-left rounded-lg hover:bg-slate-100 transition-colors"
      >
        <span className="text-slate-400">{icon}</span>
        <span className="font-semibold text-slate-800 text-sm flex-1">{title}</span>
        <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-md mr-1', countCls ?? 'bg-slate-100 text-slate-500')}>
          {assets.length}
        </span>
        {open ? (
          <ChevronDown size={13} className="text-slate-400 shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="space-y-2 mt-2">
          {assets.map((a) => (
            <AssetRow
              key={a.id}
              asset={a}
              pid={pid}
              paperIdNum={paperIdNum}
              onToggle={onToggle}
              onClick={onClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DoclingResultsPage() {
  const { projectId, paperId } = useParams<{ projectId: string; paperId: string }>()
  const pid        = Number(projectId)
  const paperIdNum = Number(paperId)

  const [assets, setAssets]               = useState<ExtractionAsset[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<ExtractionAsset | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await workspaceApi.listAssets(pid, paperIdNum, { limit: 500 })
      setAssets(res.items)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }, [pid, paperIdNum])

  useEffect(() => { load() }, [load])

  const handleToggle = async (assetId: number, val: boolean) => {
    const updated = await workspaceApi.patchAsset(pid, paperIdNum, assetId, { selected_for_llm: val })
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, selected_for_llm: updated.selected_for_llm } : a)),
    )
    if (selectedAsset?.id === assetId) {
      setSelectedAsset((prev) => prev ? { ...prev, selected_for_llm: updated.selected_for_llm } : prev)
    }
    toast.success(val ? 'Included as evidence' : 'Removed from evidence')
  }

  // Group assets
  const tables       = assets.filter((a) => a.asset_type === 'native_table')
  const charts       = assets.filter((a) => a.asset_type === 'figure' && a.classification === 'chart')
  const otherFigs    = assets.filter(
    (a) => a.asset_type === 'figure' && a.classification !== 'chart' && !NON_SCIENTIFIC.includes(a.classification),
  )
  const nonScientific = assets.filter((a) => NON_SCIENTIFIC.includes(a.classification))
  const includedCount = assets.filter((a) => a.selected_for_llm).length

  // ── Loading / error ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <Loader2 size={18} className="animate-spin mr-2" />
        Loading Docling output…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle size={28} className="text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <button onClick={load} className="text-xs text-slate-500 underline">Retry</button>
      </div>
    )
  }

  if (assets.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400">
        <FileText size={40} strokeWidth={1} className="mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-500">No assets extracted yet</p>
        <p className="text-xs mt-1">Run the Docling pipeline on the Overview tab first.</p>
      </div>
    )
  }

  // ── Main layout ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: asset list */}
      <div className="flex-1 overflow-y-auto p-5 min-w-0">
        {/* Page header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Docling Extraction Results</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {assets.length} assets · {includedCount} included as evidence
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {/* Sections */}
        <Section
          title="Native Tables"
          icon={<Table2 size={14} />}
          assets={tables}
          pid={pid}
          paperIdNum={paperIdNum}
          onToggle={handleToggle}
          onClick={setSelectedAsset}
          countCls="bg-[#f3dde2] text-[#661523]"
        />
        <Section
          title="Charts"
          icon={<BarChart2 size={14} />}
          assets={charts}
          pid={pid}
          paperIdNum={paperIdNum}
          onToggle={handleToggle}
          onClick={setSelectedAsset}
          countCls="bg-emerald-100 text-emerald-700"
        />
        <Section
          title="Other Figures"
          icon={<Image size={14} />}
          assets={otherFigs}
          pid={pid}
          paperIdNum={paperIdNum}
          onToggle={handleToggle}
          onClick={setSelectedAsset}
          defaultOpen={false}
        />
        <Section
          title="Non-Scientific Assets"
          icon={<EyeOff size={14} />}
          assets={nonScientific}
          pid={pid}
          paperIdNum={paperIdNum}
          onToggle={handleToggle}
          onClick={setSelectedAsset}
          defaultOpen={false}
          countCls="bg-slate-100 text-slate-400"
        />
      </div>

      {/* Right: detail panel */}
      {selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          projectId={pid}
          paperId={paperIdNum}
          onClose={() => setSelectedAsset(null)}
          onToggleSelect={async (asset, val) => handleToggle(asset.id, val)}
        />
      )}
    </div>
  )
}

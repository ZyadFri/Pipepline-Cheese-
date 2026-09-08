import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AlertCircle, BarChart3, Camera, Grid2X2, Image as ImageIcon,
  List, Loader2, RefreshCw, Table2,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { workspaceApi } from '../../services/api'
import type { ExtractionAsset } from '../../types/workspace'
import AssetCard from '../../components/AssetCard'
import AssetDetailPanel from '../../components/AssetDetailPanel'

const BURGUNDY = '#8B1538'

type FilterKey = 'all' | 'figures' | 'tables' | 'photos' | 'charts'
type ViewMode = 'grid' | 'list'
type SortMode = 'paper' | 'newest'

function isChart(a: ExtractionAsset) {
  return a.asset_type === 'figure' && a.classification === 'chart'
}

function isPhoto(a: ExtractionAsset) {
  return a.asset_type === 'figure' && a.classification === 'photograph'
}

function isFigure(a: ExtractionAsset) {
  return a.asset_type === 'figure' && !isChart(a) && !isPhoto(a)
}

function fallbackTitle(asset: ExtractionAsset) {
  switch (asset.classification) {
    case 'publisher_logo': return 'Publisher logo'
    case 'license_icon': return 'Publication mark'
    case 'decorative_asset': return 'Document figure'
    case 'photograph': return 'Photograph'
    case 'diagram': return 'Diagram'
    case 'chemical_structure': return 'Chemical structure'
    case 'multi_panel_figure': return 'Multi-panel figure'
    case 'chart': return 'Chart'
    case 'native_table': return 'Table'
    default: return asset.asset_type === 'native_table' ? 'Table' : 'Figure'
  }
}

function simpleType(asset: ExtractionAsset) {
  if (asset.asset_type === 'native_table') return 'Table'
  if (asset.classification === 'chart') return 'Chart'
  if (asset.classification === 'photograph') return 'Photograph'
  return 'Figure'
}

export default function DoclingResultsPage() {
  const { projectId, paperId } = useParams<{ projectId: string; paperId: string }>()
  const pid = Number(projectId)
  const paperIdNum = Number(paperId)

  const [assets, setAssets] = useState<ExtractionAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<ExtractionAsset | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [view, setView] = useState<ViewMode>('grid')
  const [sort, setSort] = useState<SortMode>('paper')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await workspaceApi.listAssets(pid, paperIdNum, { limit: 500 })
      setAssets(res.items)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Could not load the extracted items')
    } finally {
      setLoading(false)
    }
  }, [pid, paperIdNum])

  useEffect(() => { load() }, [load])

  const handleToggle = async (asset: ExtractionAsset, val: boolean) => {
    const updated = await workspaceApi.patchAsset(pid, paperIdNum, asset.id, { selected_for_llm: val })
    setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, selected_for_llm: updated.selected_for_llm } : a))
    setSelectedAsset((prev) => prev?.id === asset.id ? { ...prev, selected_for_llm: updated.selected_for_llm } : prev)
    toast.success(val ? 'Added to evidence' : 'Removed from evidence')
  }

  const counts = useMemo(() => ({
    all: assets.length,
    figures: assets.filter(isFigure).length,
    tables: assets.filter((a) => a.asset_type === 'native_table').length,
    photos: assets.filter(isPhoto).length,
    charts: assets.filter(isChart).length,
  }), [assets])

  const visibleAssets = useMemo(() => {
    let result = assets.filter((a) => {
      if (filter === 'all') return true
      if (filter === 'figures') return isFigure(a)
      if (filter === 'tables') return a.asset_type === 'native_table'
      if (filter === 'photos') return isPhoto(a)
      return isChart(a)
    })

    result = [...result].sort((a, b) => {
      if (sort === 'newest') return b.id - a.id
      const pa = a.page_number ?? Number.MAX_SAFE_INTEGER
      const pb = b.page_number ?? Number.MAX_SAFE_INTEGER
      return pa - pb || a.id - b.id
    })
    return result
  }, [assets, filter, sort])

  const filters: { key: FilterKey; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: 'All', icon: <Grid2X2 size={14} /> },
    { key: 'figures', label: 'Figures', icon: <ImageIcon size={14} /> },
    { key: 'tables', label: 'Tables', icon: <Table2 size={14} /> },
    { key: 'photos', label: 'Photos', icon: <Camera size={14} /> },
    { key: 'charts', label: 'Charts', icon: <BarChart3 size={14} /> },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[360px] text-slate-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading extracted items…
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[360px] flex flex-col items-center justify-center text-center px-8">
        <AlertCircle size={28} className="text-rose-400 mb-3" />
        <p className="text-sm text-slate-700 mb-4">{error}</p>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    )
  }

  if (!assets.length) {
    return (
      <div className="min-h-[360px] flex flex-col items-center justify-center text-center px-8">
        <ImageIcon size={42} strokeWidth={1.25} className="text-slate-300 mb-3" />
        <h2 className="font-semibold text-slate-800">Evidence will appear here</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">Figures, tables and photographs are shown as soon as they are extracted from the paper.</p>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[#fcfbfa]">
      <div className="px-6 py-5 border-b border-[#eee4e6] bg-white/90 sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((item) => {
              const active = filter === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => setFilter(item.key)}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all',
                    active
                      ? 'border-[#8B1538] bg-[#8B1538] text-white shadow-sm'
                      : 'border-[#e8e1e3] bg-white text-slate-600 hover:border-[#d9bcc5] hover:text-[#8B1538]',
                  )}
                >
                  {item.icon}
                  {item.label} ({counts[item.key]})
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="h-10 rounded-xl border border-[#e8e1e3] bg-white px-3 text-xs font-medium text-slate-600 outline-none focus:border-[#cda7b2]"
            >
              <option value="paper">Paper order</option>
              <option value="newest">Newest extracted</option>
            </select>
            <div className="flex rounded-xl border border-[#e8e1e3] bg-white p-1">
              <button
                onClick={() => setView('grid')}
                className={clsx('h-8 w-8 rounded-lg flex items-center justify-center transition-colors', view === 'grid' ? 'bg-[#8B1538] text-white' : 'text-slate-400 hover:bg-slate-50')}
                title="Grid view"
              >
                <Grid2X2 size={15} />
              </button>
              <button
                onClick={() => setView('list')}
                className={clsx('h-8 w-8 rounded-lg flex items-center justify-center transition-colors', view === 'list' ? 'bg-[#8B1538] text-white' : 'text-slate-400 hover:bg-slate-50')}
                title="List view"
              >
                <List size={16} />
              </button>
            </div>
            <button
              onClick={load}
              className="h-10 w-10 rounded-xl border border-[#e8e1e3] bg-white text-slate-400 hover:text-[#8B1538] hover:border-[#d9bcc5] flex items-center justify-center"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {view === 'grid' ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {visibleAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                projectId={pid}
                paperId={paperIdNum}
                onClick={setSelectedAsset}
                onToggleSelect={handleToggle}
                active={selectedAsset?.id === asset.id}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleAssets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => setSelectedAsset(asset)}
                className={clsx(
                  'w-full flex items-center gap-4 rounded-2xl border bg-white p-3 text-left transition-all hover:shadow-sm',
                  selectedAsset?.id === asset.id ? 'border-[#8B1538] ring-1 ring-[#8B1538]' : 'border-[#eadfe2] hover:border-[#d9bcc5]',
                )}
              >
                <div className="h-12 w-12 shrink-0 rounded-xl bg-[#f7f4f3] flex items-center justify-center">
                  {asset.asset_type === 'native_table' ? <Table2 size={20} className="text-blue-600" /> : isChart(asset) ? <BarChart3 size={20} className="text-emerald-600" /> : isPhoto(asset) ? <Camera size={20} className="text-orange-600" /> : <ImageIcon size={20} className="text-[#8B1538]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 truncate">{asset.caption?.trim() || fallbackTitle(asset)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{simpleType(asset)}{asset.page_number != null ? ` · Page ${asset.page_number}` : ''}</div>
                </div>
                {asset.selected_for_llm && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Included</span>}
              </button>
            ))}
          </div>
        )}

        {!visibleAssets.length && (
          <div className="py-20 text-center text-slate-400 text-sm">No items in this view.</div>
        )}
      </div>

      {selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          projectId={pid}
          paperId={paperIdNum}
          onClose={() => setSelectedAsset(null)}
          onToggleSelect={handleToggle}
          assets={visibleAssets}
          onNavigate={setSelectedAsset}
        />
      )}
    </div>
  )
}

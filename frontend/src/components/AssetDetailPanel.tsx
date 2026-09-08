import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CheckCircle2, Download, ExternalLink,
  FileText, Image as ImageIcon, Table2, X, ArrowRightLeft,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { workspaceApi } from '../services/api'
import { downloadAuthenticated, fetchAuthenticatedBlob } from '../services/download'
import type { ExtractionAsset, AssetDetail, ContextLink } from '../types/workspace'
import AuthImage from './AuthImage'

interface TablePreviewData {
  table: Record<string, unknown>[]
  rows: Record<string, unknown>[]
}

function MiniTable({ records, emptyLabel }: { records: Record<string, unknown>[]; emptyLabel: string }) {
  if (records.length === 0) {
    return <p className="p-4 text-center text-[11px] text-slate-400">{emptyLabel}</p>
  }
  const columns = Object.keys(records[0])
  return (
    <div className="max-h-56 overflow-auto">
      <table className="w-full text-left text-[11px]">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1.5 font-semibold text-slate-500">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.slice(0, 50).map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} className="whitespace-nowrap px-2 py-1.5 text-slate-700">
                  {row[c] === null || row[c] === undefined ? '—' : String(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {records.length > 50 && (
        <p className="px-2 py-1.5 text-[10px] text-slate-400">Showing first 50 of {records.length} rows.</p>
      )}
    </div>
  )
}

function displayType(asset: ExtractionAsset) {
  if (asset.asset_type === 'native_table') return 'Table'
  if (asset.classification === 'chart') return 'Chart'
  if (asset.classification === 'photograph') return 'Photograph'
  return 'Figure'
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

function cleanSnippet(text: string, max = 112) {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max).trim()}…`
}

function contextPriority(link: ContextLink) {
  if (link.link_type === 'caption') return 5
  if (link.link_type === 'explicit_figure_reference') return 4
  if (link.link_type === 'neighbor_before' || link.link_type === 'neighbor_after') return 3
  if (link.link_type === 'same_section') return 2
  return 1
}

interface Props {
  asset: ExtractionAsset
  projectId: number
  paperId: number
  onClose: () => void
  onToggleSelect: (asset: ExtractionAsset, val: boolean) => void
  assets?: ExtractionAsset[]
  onNavigate?: (asset: ExtractionAsset) => void
}

export default function AssetDetailPanel({
  asset,
  projectId,
  paperId,
  onClose,
  onToggleSelect,
  assets = [],
  onNavigate,
}: Props) {
  const [detail, setDetail] = useState<AssetDetail | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [tablePreview, setTablePreview] = useState<TablePreviewData | null>(null)
  const [tablePreviewLoading, setTablePreviewLoading] = useState(false)

  useEffect(() => {
    setDetail(null)
    setImgError(false)
    workspaceApi.getAsset(projectId, paperId, asset.id).then(setDetail).catch(() => null)
  }, [asset.id, paperId, projectId])

  useEffect(() => {
    setTablePreview(null)
    if (asset.asset_type !== 'native_table' || !asset.has_csv) return
    setTablePreviewLoading(true)
    workspaceApi.exportAssetJson(projectId, paperId, asset.id)
      .then((data) => setTablePreview({ table: data.table, rows: data.rows }))
      .catch(() => setTablePreview(null))
      .finally(() => setTablePreviewLoading(false))
  }, [asset.id, asset.asset_type, asset.has_csv, paperId, projectId])

  const currentIndex = assets.findIndex((a) => a.id === asset.id)
  const canPrev = currentIndex > 0
  const canNext = currentIndex >= 0 && currentIndex < assets.length - 1

  const title = asset.caption?.trim() || fallbackTitle(asset)
  const type = displayType(asset)
  const imageUrl = asset.asset_type === 'native_table' && !asset.has_image
    ? null
    : workspaceApi.imageUrl(projectId, paperId, asset.id)
  const fullPageUrl = workspaceApi.pageImageUrl(projectId, paperId, asset.id)

  const mentions = useMemo(() => {
    const links = detail?.context_links ?? []
    const bestByPage = new Map<number, ContextLink>()

    for (const link of [...links].sort((a, b) => contextPriority(b) - contextPriority(a))) {
      if (!link.page_number || !link.text?.trim()) continue
      if (!bestByPage.has(link.page_number)) bestByPage.set(link.page_number, link)
    }

    const rows = Array.from(bestByPage.entries())
      .sort(([a], [b]) => a - b)
      .slice(0, 3)
      .map(([page, link]) => ({ page, text: cleanSnippet(link.text) }))

    if (!rows.length && asset.page_number) {
      return [{ page: asset.page_number, text: `Located on page ${asset.page_number} of the paper.` }]
    }
    return rows
  }, [asset.page_number, detail?.context_links])

  const handleSelect = async () => {
    setSelecting(true)
    try {
      await onToggleSelect(asset, !asset.selected_for_llm)
    } finally {
      setSelecting(false)
    }
  }

  const openFullPage = () => {
    fetchAuthenticatedBlob(fullPageUrl)
      .then((blob) => window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer'))
      .catch(() => toast.error('Could not open the page'))
  }

  const downloadItem = () => {
    if (asset.asset_type === 'native_table' && asset.has_csv) {
      downloadAuthenticated(
        workspaceApi.exportAssetUrl(projectId, paperId, asset.id, 'xlsx'),
        `table_page_${asset.page_number ?? asset.id}.xlsx`,
      )
      return
    }
    if (asset.classification === 'chart' && asset.has_csv) {
      downloadAuthenticated(
        workspaceApi.csvUrl(projectId, paperId, asset.id),
        `chart_page_${asset.page_number ?? asset.id}.csv`,
      )
      return
    }
    if (imageUrl) {
      downloadAuthenticated(imageUrl, `figure_page_${asset.page_number ?? asset.id}.png`)
      return
    }
    toast('This item has no separate file to download', { icon: 'ℹ️' })
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] bg-white border-l border-[#eadfe2] shadow-[-26px_0_70px_rgba(45,26,31,0.15)] flex flex-col">
      <header className="h-[68px] shrink-0 flex items-center gap-3 px-5 border-b border-[#eee5e7] bg-white">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-slate-900">{type}</div>
          {asset.page_number != null && <div className="text-[11px] text-slate-400 mt-0.5">Page {asset.page_number}</div>}
        </div>

        {assets.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => canPrev && onNavigate?.(assets[currentIndex - 1])}
              className="h-8 w-8 rounded-full border border-[#e8e1e3] flex items-center justify-center hover:bg-slate-50 disabled:opacity-30"
            >
              <ArrowLeft size={14} />
            </button>
            <span className="min-w-[36px] text-center font-semibold">{currentIndex + 1} / {assets.length}</span>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => canNext && onNavigate?.(assets[currentIndex + 1])}
              className="h-8 w-8 rounded-full border border-[#e8e1e3] flex items-center justify-center hover:bg-slate-50 disabled:opacity-30"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        <button type="button" onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50">
          <X size={17} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 bg-[#fffdfc]">
        <div className="rounded-2xl border border-[#e9e1e3] bg-white overflow-hidden shadow-sm">
          <div className="min-h-[255px] max-h-[340px] bg-[#fbfaf9] flex items-center justify-center overflow-hidden">
            {asset.asset_type === 'native_table' && !asset.has_image ? (
              <div className="flex flex-col items-center gap-3 text-slate-300 py-14">
                <Table2 size={52} strokeWidth={1.25} />
                <span className="text-xs font-medium text-slate-400">
                  {asset.csv_rows != null ? `${asset.csv_rows} rows × ${asset.csv_cols ?? 0} columns` : 'Scientific table'}
                </span>
              </div>
            ) : imageUrl && !imgError ? (
              <AuthImage
                src={imageUrl}
                alt={title}
                className="w-full h-full max-h-[340px] object-contain p-4"
                onError={() => setImgError(true)}
              />
            ) : (
              <ImageIcon size={52} strokeWidth={1.25} className="text-slate-300" />
            )}
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold leading-snug text-slate-900">{title}</h2>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={clsx(
                'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
                type === 'Chart' ? 'bg-emerald-50 text-emerald-700' :
                type === 'Table' ? 'bg-blue-50 text-blue-700' :
                type === 'Photograph' ? 'bg-orange-50 text-orange-700' :
                'bg-rose-50 text-[#8B1538]',
              )}>
                {type}
              </span>
              {asset.page_number != null && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">p.{asset.page_number}</span>
              )}
              {asset.selected_for_llm && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 size={11} /> Included
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={openFullPage}
            className="h-10 rounded-xl bg-[#8B1538] text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#74112f] transition-colors"
          >
            <ExternalLink size={13} /> Open full page
          </button>
          <button
            type="button"
            onClick={downloadItem}
            className="h-10 rounded-xl border border-[#e6dde0] bg-white text-slate-600 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-slate-50"
          >
            <Download size={13} /> Download
          </button>
          <button
            type="button"
            onClick={handleSelect}
            disabled={selecting}
            className={clsx(
              'h-10 rounded-xl border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60',
              asset.selected_for_llm
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-[#e6dde0] bg-white text-[#8B1538] hover:bg-[#fff7f8]',
            )}
          >
            <CheckCircle2 size={13} /> {asset.selected_for_llm ? 'Included' : 'Use as evidence'}
          </button>
        </div>

        {mentions.length > 0 && (
          <section className="mt-6 pt-5 border-t border-[#eee5e7]">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Where this appears</h3>
            <div className="space-y-2.5">
              {mentions.map((mention) => {
                const pageUrl = `${api.defaults.baseURL}/projects/${projectId}/papers/${paperId}/pages/${mention.page}/image`
                return (
                  <div key={`${mention.page}-${mention.text}`} className="flex items-center gap-3 rounded-2xl border border-[#eee7e8] bg-white p-3">
                    <span className="shrink-0 rounded-full bg-[#f4f7ff] px-2.5 py-1 text-[11px] font-bold text-[#3157a4]">p.{mention.page}</span>
                    <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-slate-600 line-clamp-2">{mention.text}</p>
                    <div className="h-12 w-16 shrink-0 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                      <AuthImage src={pageUrl} alt={`Page ${mention.page}`} className="h-full w-full object-cover object-top" />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {asset.asset_type === 'native_table' && asset.has_csv && (
          <section className="mt-6 pt-5 border-t border-[#eee5e7]">
            <div className="mb-3 flex items-center gap-2">
              <ArrowRightLeft size={14} className="text-[#8B1538]" />
              <h3 className="text-sm font-bold text-slate-900">Table → database preview</h3>
            </div>
            {tablePreviewLoading ? (
              <p className="text-[11px] text-slate-400">Converting table…</p>
            ) : !tablePreview ? (
              <p className="text-[11px] text-slate-400">Could not preview this table.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <p className="border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Original table (as Docling read it)
                  </p>
                  <MiniTable records={tablePreview.table} emptyLabel="No table data." />
                </div>
                <div className="overflow-hidden rounded-xl border border-emerald-200">
                  <p className="border-b border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Normalized database rows
                  </p>
                  <MiniTable records={tablePreview.rows} emptyLabel="No rows could be derived from this table yet." />
                </div>
              </div>
            )}
          </section>
        )}

        <section className="mt-6 pt-5 border-t border-[#eee5e7]">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Document details</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs">
              <div className="h-8 w-8 rounded-xl bg-[#faf4f6] text-[#8B1538] flex items-center justify-center"><ImageIcon size={14} /></div>
              <span className="w-16 text-slate-400">Type</span>
              <span className="font-semibold text-slate-700">{type}</span>
            </div>
            {asset.page_number != null && (
              <div className="flex items-center gap-3 text-xs">
                <div className="h-8 w-8 rounded-xl bg-[#faf4f6] text-[#8B1538] flex items-center justify-center"><FileText size={14} /></div>
                <span className="w-16 text-slate-400">Page</span>
                <span className="font-semibold text-slate-700">{asset.page_number}</span>
              </div>
            )}
            {asset.paper_name && (
              <div className="flex items-start gap-3 text-xs">
                <div className="h-8 w-8 shrink-0 rounded-xl bg-[#faf4f6] text-[#8B1538] flex items-center justify-center"><FileText size={14} /></div>
                <span className="w-16 shrink-0 pt-2 text-slate-400">Source</span>
                <span className="font-semibold text-slate-700 leading-relaxed pt-1.5 break-words">{asset.paper_name}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  )
}

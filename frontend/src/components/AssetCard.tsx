import { useEffect, useState } from 'react'
import {
  BarChart3, Camera, CheckCircle2, FileSpreadsheet, Image as ImageIcon,
  Layers3, MoreHorizontal, Star, Table2,
} from 'lucide-react'
import clsx from 'clsx'
import type { ExtractionAsset } from '../types/workspace'
import { workspaceApi } from '../services/api'
import { fetchAuthenticatedText } from '../services/download'
import AuthImage from './AuthImage'

const TYPE_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  chart:              { label: 'Chart',              cls: 'bg-emerald-50 text-emerald-700', icon: <BarChart3 size={12} /> },
  native_table:       { label: 'Table',              cls: 'bg-blue-50 text-blue-700',       icon: <Table2 size={12} /> },
  photograph:         { label: 'Photograph',         cls: 'bg-orange-50 text-orange-700',   icon: <Camera size={12} /> },
  diagram:            { label: 'Diagram',            cls: 'bg-violet-50 text-violet-700',   icon: <ImageIcon size={12} /> },
  chemical_structure: { label: 'Chemical structure', cls: 'bg-amber-50 text-amber-700',     icon: <ImageIcon size={12} /> },
  multi_panel_figure: { label: 'Figure',             cls: 'bg-indigo-50 text-indigo-700',   icon: <Layers3 size={12} /> },
  publisher_logo:     { label: 'Figure',             cls: 'bg-rose-50 text-[#8B1538]',      icon: <ImageIcon size={12} /> },
  license_icon:       { label: 'Figure',             cls: 'bg-rose-50 text-[#8B1538]',      icon: <ImageIcon size={12} /> },
  decorative_asset:   { label: 'Figure',             cls: 'bg-rose-50 text-[#8B1538]',      icon: <ImageIcon size={12} /> },
  unknown:            { label: 'Figure',             cls: 'bg-slate-50 text-slate-600',     icon: <ImageIcon size={12} /> },
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

function TableThumbnail({ projectId, paperId, asset }: { projectId: number; paperId: number; asset: ExtractionAsset }) {
  const [rows, setRows] = useState<string[][]>([])

  useEffect(() => {
    if (!asset.has_csv) return
    let alive = true
    fetchAuthenticatedText(workspaceApi.csvUrl(projectId, paperId, asset.id))
      .then((txt) => {
        if (!alive) return
        const parsed = txt.trim().split('\n').slice(0, 6).map((line) =>
          line.split(',').slice(0, 4).map((cell) => cell.trim().replace(/^"|"$/g, '')),
        )
        setRows(parsed)
      })
      .catch(() => null)
    return () => { alive = false }
  }, [asset.has_csv, asset.id, paperId, projectId])

  if (!rows.length) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-slate-300">
        <Table2 size={38} strokeWidth={1.5} />
        <span className="text-[11px] font-medium">Scientific table</span>
      </div>
    )
  }

  const [header, ...body] = rows
  return (
    <div className="w-full px-4 py-5 overflow-hidden">
      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white shadow-sm">
        <div className="grid bg-slate-50" style={{ gridTemplateColumns: `repeat(${Math.max(1, header.length)}, minmax(0,1fr))` }}>
          {header.map((cell, i) => (
            <div key={i} className="px-2 py-1.5 text-[9px] font-bold text-slate-600 border-r border-slate-200 last:border-r-0 truncate">{cell || '—'}</div>
          ))}
        </div>
        {body.slice(0, 4).map((row, ri) => (
          <div key={ri} className="grid border-t border-slate-100" style={{ gridTemplateColumns: `repeat(${Math.max(1, header.length)}, minmax(0,1fr))` }}>
            {row.map((cell, ci) => (
              <div key={ci} className="px-2 py-1 text-[9px] text-slate-600 border-r border-slate-100 last:border-r-0 truncate">{cell || '—'}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  asset: ExtractionAsset
  projectId: number
  paperId: number
  onClick: (asset: ExtractionAsset) => void
  onToggleSelect: (asset: ExtractionAsset, val: boolean) => void
  active?: boolean
}

export default function AssetCard({ asset, projectId, paperId, onClick, onToggleSelect, active = false }: Props) {
  const [imgError, setImgError] = useState(false)
  const [selecting, setSelecting] = useState(false)

  const meta = TYPE_META[asset.classification] ?? TYPE_META.unknown
  const imgUrl = workspaceApi.imageUrl(projectId, paperId, asset.id)
  const title = asset.caption?.trim() || fallbackTitle(asset)

  const handleSelect = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelecting(true)
    try {
      await onToggleSelect(asset, !asset.selected_for_llm)
    } finally {
      setSelecting(false)
    }
  }

  return (
    <article
      onClick={() => onClick(asset)}
      className={clsx(
        'group relative overflow-hidden rounded-2xl border bg-white cursor-pointer transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(74,28,41,0.10)]',
        active
          ? 'border-[#8B1538] ring-1 ring-[#8B1538] shadow-[0_10px_28px_rgba(139,21,56,0.10)]'
          : 'border-[#eadfe2] hover:border-[#d9bcc5]',
      )}
    >
      <div className="relative h-[205px] bg-[#fbfaf9] flex items-center justify-center overflow-hidden">
        {asset.asset_type === 'native_table' ? (
          <TableThumbnail projectId={projectId} paperId={paperId} asset={asset} />
        ) : asset.has_image && !imgError ? (
          <AuthImage
            src={imgUrl}
            alt={title}
            className="w-full h-full object-contain p-2"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-slate-300">
            <ImageIcon size={42} strokeWidth={1.25} />
          </div>
        )}

        {asset.page_number != null && (
          <span className="absolute top-3 left-3 rounded-full border border-white/90 bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm">
            p.{asset.page_number}
          </span>
        )}

        <button
          type="button"
          onClick={handleSelect}
          disabled={selecting}
          title={asset.selected_for_llm ? 'Remove from evidence' : 'Use as evidence'}
          className={clsx(
            'absolute top-3 right-3 h-8 w-8 rounded-full border shadow-sm flex items-center justify-center transition-all',
            asset.selected_for_llm
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'bg-white/95 border-white text-slate-500 opacity-0 group-hover:opacity-100 hover:text-[#8B1538]',
          )}
        >
          {asset.selected_for_llm ? <CheckCircle2 size={15} /> : <Star size={14} />}
        </button>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', meta.cls)}>
            {meta.icon}
            {meta.label}
          </span>
          <MoreHorizontal size={17} className="text-slate-300" />
        </div>

        <h3 className="text-[14px] font-semibold leading-snug text-slate-900 line-clamp-2 min-h-[38px]">
          {title}
        </h3>

        <div className="mt-3 min-h-[19px] flex items-center gap-2 text-[11px]">
          {asset.asset_type === 'native_table' && asset.csv_rows != null ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
              <FileSpreadsheet size={12} /> {asset.csv_rows} rows × {asset.csv_cols ?? 0} columns
            </span>
          ) : asset.conversion_status === 'complete' && asset.has_csv ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
              <CheckCircle2 size={12} /> Data available
            </span>
          ) : asset.classification === 'chart' && asset.conversion_status === 'failed' ? (
            <span className="text-amber-600 font-medium">Chart values can be added later</span>
          ) : asset.selected_for_llm ? (
            <span className="text-emerald-700 font-medium">Included as evidence</span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

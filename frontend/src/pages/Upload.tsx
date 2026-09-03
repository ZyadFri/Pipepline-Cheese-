import { useCallback, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  Upload as UploadIcon, FileText, X, ArrowLeft, CloudUpload, Microscope, ChevronRight,
  Table2, Image as ImageIcon, FileSearch, ShieldCheck,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { papersApi, workspaceApi } from '../services/api'

const EXTRACT_ITEMS = [
  { Icon: FileText, title: 'Text & metadata', body: 'Titles, authors, abstract, methods, and more.' },
  { Icon: Table2, title: 'Tables', body: 'Compositional data, measurements, results.' },
  { Icon: ImageIcon, title: 'Figures', body: 'Charts, images, and figure captions.' },
  { Icon: FileSearch, title: 'Context', body: 'Cheese type, matrices, conditions, outcomes.' },
]

export default function Upload() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)
  const navigate = useNavigate()

  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [mode, setMode] = useState<'workspace' | 'batch'>('workspace')

  const onDrop = useCallback((accepted: File[]) => {
    const pdfs = accepted.filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
    if (pdfs.length !== accepted.length) toast.error('Only PDF files are accepted')
    const limit = mode === 'workspace' ? 1 : 10
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      return [...prev, ...pdfs.filter((f) => !existing.has(f.name))].slice(0, limit)
    })
  }, [mode])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: mode === 'batch',
    maxFiles: mode === 'workspace' ? 1 : 10,
  })

  const remove = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name))

  const handleUpload = async () => {
    if (!files.length) return
    setUploading(true)
    try {
      const created: { id: number }[] = await papersApi.upload(pid, files)
      if (mode === 'workspace' && created.length === 1) {
        navigate(`/projects/${pid}/papers/${created[0].id}/overview`)
        return
      }
      // Batch mode: start the same Docling/asset-extraction pipeline single
      // uploads get, one paper at a time. Each call just enqueues a background
      // job server-side, so this loop finishes quickly even though extraction
      // itself keeps running after navigating away. Sequential, not concurrent —
      // chart reading calls a vision-model API per figure, and firing every
      // paper's figures at once would multiply that load unpredictably.
      for (const paper of created) {
        try { await workspaceApi.start(pid, paper.id) }
        catch { /* one paper failing to start shouldn't block the rest */ }
      }
      toast.success(`${files.length} paper${files.length > 1 ? 's' : ''} uploaded — extraction started`)
      navigate(`/projects/${pid}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const totalMB = files.reduce((s, f) => s + f.size, 0) / (1024 * 1024)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${pid}`}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">Upload Papers</h1>
            <p className="muted">Upload cheese research papers for AI extraction. We'll parse text, tables, figures, and metadata into structured evidence.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-6">
          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setMode('workspace'); setFiles([]) }}
              className={clsx(
                'flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all',
                mode === 'workspace'
                  ? 'bg-[#fdf3f5]'
                  : 'border-slate-200 bg-white hover:border-slate-300',
              )}
              style={mode === 'workspace' ? { borderColor: 'var(--primary)' } : undefined}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: mode === 'workspace' ? 'rgba(122,27,46,0.1)' : '#f1f5f9' }}>
                <Microscope size={18} style={{ color: mode === 'workspace' ? 'var(--primary)' : '#64748b' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: mode === 'workspace' ? 'var(--primary)' : '#334155' }}>
                  Single-file workspace
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Explore, preview, and extract from one paper at a time.
                </p>
              </div>
              {mode === 'workspace' && (
                <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--primary)' }}>
                  <ChevronRight size={11} /> Opens workspace automatically
                </div>
              )}
            </button>

            <button
              onClick={() => { setMode('batch'); setFiles([]) }}
              className={clsx(
                'flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all',
                mode === 'batch'
                  ? 'bg-[#fdf3f5]'
                  : 'border-slate-200 bg-white hover:border-slate-300',
              )}
              style={mode === 'batch' ? { borderColor: 'var(--primary)' } : undefined}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: mode === 'batch' ? 'rgba(122,27,46,0.1)' : '#f1f5f9' }}>
                <UploadIcon size={18} style={{ color: mode === 'batch' ? 'var(--primary)' : '#64748b' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: mode === 'batch' ? 'var(--primary)' : '#334155' }}>Batch upload</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upload up to 10 PDFs and extract them in a single run.
                </p>
              </div>
            </button>
          </div>

          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={clsx(
              'border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200',
              isDragActive
                ? 'scale-[1.01] bg-[#fdf3f5]'
                : 'border-slate-300 hover:bg-slate-50 bg-white',
            )}
            style={isDragActive ? { borderColor: 'var(--primary)' } : undefined}
          >
            <input {...getInputProps()} />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors" style={{ background: isDragActive ? 'rgba(122,27,46,0.1)' : '#f1f5f9' }}>
              <CloudUpload size={26} style={{ color: isDragActive ? 'var(--primary)' : '#94a3b8' }} />
            </div>
            {isDragActive ? (
              <p className="font-semibold text-base" style={{ color: 'var(--primary)' }}>Drop your PDF here</p>
            ) : (
              <>
                <p className="text-slate-800 font-semibold text-base mb-1">
                  {mode === 'workspace' ? 'Drop a single PDF file here' : 'Drag & drop PDF files here'}
                </p>
                <p className="text-slate-400 text-sm">
                  or <span className="hover:underline" style={{ color: 'var(--primary)' }}>browse your files</span>
                </p>
                <p className="text-slate-400 text-xs mt-3">
                  {mode === 'workspace' ? 'PDF only · 50 MB max' : 'Up to 10 files · 50 MB each'}
                </p>
              </>
            )}
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-700">
                  {files.length} file{files.length > 1 ? 's' : ''} selected
                  <span className="text-slate-400 font-normal ml-1.5">({totalMB.toFixed(1)} MB total)</span>
                </p>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(122,27,46,0.08)' }}>
                      <FileText size={13} style={{ color: 'var(--primary)' }} />
                    </div>
                    <span className="text-sm text-slate-700 flex-1 truncate font-medium">{file.name}</span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <button
                      onClick={() => remove(file.name)}
                      className="p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trust note */}
          <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <p className="text-xs text-slate-500">
              Your files are processed securely within this workspace and are not shared outside your project.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Link to={`/projects/${pid}`} className="btn-secondary">Cancel</Link>
            <button
              onClick={handleUpload}
              disabled={!files.length || uploading}
              className="btn-primary min-w-40 justify-center"
            >
              {uploading ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading…</>
              ) : mode === 'workspace' ? (
                <><Microscope size={14} /> Analyze in Workspace</>
              ) : (
                <><UploadIcon size={14} /> Upload {files.length || ''} PDF{files.length !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-xs font-bold text-slate-700 mb-3">What we'll extract</h3>
            <div className="space-y-3">
              {EXTRACT_ITEMS.map(({ Icon, title, body }) => (
                <div key={title} className="flex items-start gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(122,27,46,0.08)' }}>
                    <Icon size={13} style={{ color: 'var(--primary)' }} />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-slate-700">{title}</p>
                    <p className="text-[11px] text-slate-400">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

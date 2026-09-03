import { useState, useEffect, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FileText, CheckSquare, Trash2, FlaskConical, X, BarChart2, Eye, Calendar, LayoutGrid, Activity, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { projectsApi } from '../services/api'
import { Project } from '../types'
import { useAuthStore } from '../store/auth'

// Decorative header photos only — cycled deterministically by project id, not
// tied to any real per-project field, since the API doesn't expose one.
const CARD_PHOTOS = [
  'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=600&q=75',
  'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=600&q=75',
  'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=600&q=75',
  'https://images.unsplash.com/photo-1758685848544-625ddba413e4?auto=format&fit=crop&w=600&q=75',
  'https://images.unsplash.com/photo-1761472651462-c2a019e76f4b?auto=format&fit=crop&w=600&q=75',
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const user = useAuthStore((s) => s.user)

  const load = async () => {
    try {
      const data = await projectsApi.list()
      setProjects(data)
    } catch {
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const project = await projectsApi.create({ name: name.trim(), description: desc.trim() })
      setProjects((prev) => [project, ...prev])
      setShowCreate(false)
      setName('')
      setDesc('')
      toast.success('Project created')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number, projectName: string) => {
    if (!confirm(`Delete project "${projectName}" and all its data?`)) return
    try {
      await projectsApi.delete(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
      toast.success('Project deleted')
    } catch {
      toast.error('Failed to delete project')
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">My Projects</h1>
          <p className="muted mt-1.5">Welcome back, <span className="font-medium" style={{ color: 'var(--foreground)' }}>{user?.full_name}</span></p>
          <p className="mt-1 text-[13px] text-slate-400">Organize and manage your cheese research paper extraction projects.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} />
          New Project
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17131A]/40 backdrop-blur-sm px-4">
          <div className="surface w-full max-w-md !bg-white">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="type-h3" style={{ color: 'var(--foreground)' }}>New Research Project</h2>
              <button onClick={() => setShowCreate(false)} className="btn-ghost p-1.5">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="label">Project Name *</label>
                <input
                  className="input"
                  placeholder="e.g. Gouda Shelf-Life Study 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <textarea
                  className="input resize-none h-20"
                  placeholder="Brief description of this research project…"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1 justify-center" disabled={creating}>
                  {creating ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
            <p className="text-sm text-slate-500">Loading projects…</p>
          </div>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(122,27,46,0.08)' }}>
            <FlaskConical size={28} style={{ color: 'var(--primary)' }} />
          </div>
          <h3 className="type-h3 mb-1" style={{ color: 'var(--foreground)' }}>No projects yet</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-xs">Create your first project to start extracting structured data from scientific papers using AI.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={16} /> Create First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map((p, idx) => (
            <div key={p.id} className="surface-interactive group flex flex-col overflow-hidden !p-0">
              <div className="relative h-[110px] w-full shrink-0 overflow-hidden bg-slate-100">
                <img src={CARD_PHOTOS[idx % CARD_PHOTOS.length]} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                <button
                  onClick={() => handleDelete(p.id, p.name)}
                  className="absolute right-2.5 top-2.5 rounded-lg bg-white/90 p-1.5 text-slate-500 opacity-0 backdrop-blur-sm transition-all hover:bg-white hover:text-red-500 group-hover:opacity-100"
                  title="Delete project"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="p-5 flex-1">
                <Link
                  to={`/projects/${p.id}`}
                  className="block type-title hover:text-[#7A1B2E] transition-colors mb-1 line-clamp-1"
                  style={{ color: 'var(--foreground)' }}
                >
                  {p.name}
                </Link>
                {p.description && (
                  <p className="text-slate-500 text-xs line-clamp-2 mb-3">{p.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
                  <span className="flex items-center gap-1.5">
                    <FileText size={12} />
                    <span>{p.paper_count ?? 0} papers</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckSquare size={12} />
                    <span>{p.row_count ?? 0} rows</span>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Calendar size={11} />
                  Last updated {formatDate(p.updated_at)}
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-2">
                <Link to={`/projects/${p.id}`} className="btn-primary text-xs py-1.5 px-3 flex-1 justify-center">
                  Open Project
                </Link>
                <Link to={`/projects/${p.id}/review`} className="btn-secondary text-xs py-1.5 px-3" title="Review">
                  <Eye size={12} />
                </Link>
                <Link to={`/projects/${p.id}/analytics`} className="btn-secondary text-xs py-1.5 px-3" title="Analytics">
                  <BarChart2 size={12} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-100 bg-white p-6 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(122,27,46,0.08)' }}>
              <LayoutGrid size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>All in one place</p>
              <p className="mt-0.5 text-xs text-slate-500">Organize your projects, papers, and extractions in one secure workspace.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(122,27,46,0.08)' }}>
              <Activity size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>Track your progress</p>
              <p className="mt-0.5 text-xs text-slate-500">Monitor extraction status, validation, and data quality at a glance.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(122,27,46,0.08)' }}>
              <ShieldCheck size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>Work with confidence</p>
              <p className="mt-0.5 text-xs text-slate-500">Your data is private, secure, and always under your control.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  Database,
  Eye,
  FileText,
  FlaskConical,
  LayoutGrid,
  List,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import api, { papersApi, projectsApi } from '../services/api'
import type { Paper, Project } from '../types'
import { useAuthStore } from '../store/auth'
import AuthImage from '../components/AuthImage'

const HERO_IMAGE = 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1800&q=86'

type ProjectFilter = 'all' | 'recent'
type SortMode = 'updated' | 'name' | 'papers'
type ViewMode = 'grid' | 'list'

function formatDate(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isRecent(iso: string) {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return false
  return Date.now() - time <= 14 * 24 * 60 * 60 * 1000
}

function PaperPreview({ projectId, paper, paperCount }: { projectId: number; paper?: Paper; paperCount: number }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
  }, [paper?.id])

  if (!paper) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#fffaf8,#f5e9ec)]">
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_20%,rgba(122,27,46,.08),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(122,27,46,.06),transparent_28%)]" />
        <div className="relative flex flex-col items-center text-center text-[#8d7780]">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#eadde1] bg-white shadow-sm">
            <FileText size={25} strokeWidth={1.45} />
          </div>
          <p className="text-xs font-semibold text-[#5c4650]">No paper uploaded yet</p>
          <p className="mt-1 text-[10px] text-[#a18e96]">Open the project to add a research paper</p>
        </div>
      </div>
    )
  }

  const src = `${api.defaults.baseURL}/projects/${projectId}/papers/${paper.id}/pages/1/image`

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f5eef0]">
      {!loaded && !failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#b9a8af]">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-[#eadde1]" />
          <span className="text-[10px] font-medium">Preparing first page…</span>
        </div>
      )}

      {!failed && (
        <AuthImage
          src={src}
          alt={`First page of ${paper.original_name}`}
          className={clsx(
            'absolute inset-0 h-full w-full bg-white object-cover object-top transition duration-500',
            loaded ? 'opacity-100 group-hover:scale-[1.015]' : 'opacity-0',
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}

      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[linear-gradient(145deg,#fff,#f8f1f3)] text-[#9f8b93]">
          <BookOpen size={28} strokeWidth={1.35} />
          <span className="max-w-[220px] truncate px-4 text-[10px] font-medium">{paper.original_name}</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white via-white/65 to-transparent" />
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <span className="rounded-full border border-white bg-white/95 px-2.5 py-1 text-[9px] font-semibold text-slate-600 shadow-sm backdrop-blur">
          Page 1{paper.page_count ? ` of ${paper.page_count}` : ''}
        </span>
        {paperCount > 1 && (
          <span className="rounded-full border border-[#eadde1] bg-[#fff7f9]/95 px-2.5 py-1 text-[9px] font-semibold text-[#7A1B2E] shadow-sm backdrop-blur">
            +{paperCount - 1} more paper{paperCount - 1 === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectPapers, setProjectPapers] = useState<Record<number, Paper[]>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('updated')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const loadPaperPreviews = async (items: Project[]) => {
    const entries = await Promise.allSettled(
      items.map(async (project) => {
        const papers: Paper[] = await papersApi.list(project.id)
        return [project.id, papers] as const
      }),
    )

    const next: Record<number, Paper[]> = {}
    entries.forEach((entry) => {
      if (entry.status === 'fulfilled') {
        next[entry.value[0]] = entry.value[1]
      }
    })
    setProjectPapers(next)
  }

  const load = async () => {
    try {
      const data: Project[] = await projectsApi.list()
      setProjects(data)
      void loadPaperPreviews(data)
    } catch {
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const project = await projectsApi.create({ name: name.trim(), description: desc.trim() })
      setProjects((prev) => [project, ...prev])
      setProjectPapers((prev) => ({ ...prev, [project.id]: [] }))
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
      setProjectPapers((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      toast.success('Project deleted')
    } catch {
      toast.error('Failed to delete project')
    }
  }

  const recentProject = useMemo(
    () => [...projects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0],
    [projects],
  )

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    let items = projects.filter((project) => {
      if (filter === 'recent' && !isRecent(project.updated_at)) return false
      if (!normalized) return true
      return `${project.name} ${project.description ?? ''}`.toLowerCase().includes(normalized)
    })

    items = [...items].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name)
      if (sortMode === 'papers') return (b.paper_count ?? 0) - (a.paper_count ?? 0)
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

    return items
  }, [projects, query, filter, sortMode])

  const totalPapers = projects.reduce((sum, project) => sum + (project.paper_count ?? 0), 0)
  const totalRows = projects.reduce((sum, project) => sum + (project.row_count ?? 0), 0)

  return (
    <div className="space-y-6 pb-2">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-[28px] border border-[#eee1e4] bg-[#fbf6f3] shadow-[0_24px_80px_-55px_rgba(76,22,38,.75)]"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(255,252,250,.99) 0%, rgba(255,252,250,.95) 43%, rgba(255,252,250,.22) 71%, rgba(255,252,250,.05) 100%), url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="relative min-h-[300px] px-7 py-10 sm:px-10 lg:px-12">
          <div className="max-w-[650px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.23em] text-[#9c1838]">Your research, organized</p>
            <h1 className="mt-3 font-display text-[42px] leading-[1.04] tracking-[-0.035em] text-[#21191d] sm:text-[50px]">
              My Research Projects
            </h1>
            <p className="mt-4 max-w-[560px] text-[15px] leading-7 text-slate-600">
              Extract, analyze, and organize data from cheese and food-science research papers — all in one place.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#9b1737] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_-18px_rgba(122,27,46,.95)] transition hover:-translate-y-0.5 hover:bg-[#7A1B2E]"
              >
                <Plus size={16} /> New Project
              </button>
              <button
                onClick={() => recentProject ? navigate(`/projects/${recentProject.id}/upload`) : setShowCreate(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-[#d9c9ce] bg-white/90 px-5 py-3 text-sm font-semibold text-[#2d2327] shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-[#c9aab3] hover:bg-white"
              >
                <Upload size={15} /> Import Papers
              </button>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-slate-500">
              <span><strong className="text-[#2f2529]">{projects.length}</strong> projects</span>
              <span><strong className="text-[#2f2529]">{totalPapers}</strong> papers</span>
              <span><strong className="text-[#2f2529]">{totalRows}</strong> structured rows</span>
            </div>
          </div>

          <div className="absolute right-8 top-8 hidden rounded-2xl border border-white/70 bg-white/70 px-5 py-4 text-right shadow-[0_20px_50px_-30px_rgba(88,33,49,.65)] backdrop-blur-md lg:block">
            <p className="font-display text-[20px] italic leading-7 text-[#765c65]">Knowledge for better</p>
            <p className="font-display text-[20px] italic leading-7 text-[#765c65]">food systems.</p>
            <div className="ml-auto mt-3 h-[2px] w-10 bg-[#9b1737]" />
          </div>
        </div>
      </section>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17131A]/40 px-4 backdrop-blur-sm">
          <div className="surface w-full max-w-md !bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="type-h3" style={{ color: 'var(--foreground)' }}>New Research Project</h2>
              <button onClick={() => setShowCreate(false)} className="btn-ghost p-1.5"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 p-6">
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
                  className="input h-20 resize-none"
                  placeholder="Brief description of this research project…"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
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
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
            <p className="text-sm text-slate-500">Loading projects…</p>
          </div>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-[#eee3e6] bg-white py-20 text-center shadow-sm">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f9ecef]">
            <FlaskConical size={28} className="text-[#8d1732]" />
          </div>
          <h3 className="type-h3 mb-1" style={{ color: 'var(--foreground)' }}>Start your research workspace</h3>
          <p className="mb-6 max-w-sm text-sm text-slate-500">Create a project, upload your first scientific paper, and its real first page will appear here automatically.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={16} /> Create First Project</button>
        </div>
      ) : (
        <>
          {/* Project controls */}
          <div className="flex flex-col gap-4 border-b border-[#eee4e7] pb-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-7">
              <button
                onClick={() => setFilter('all')}
                className={clsx(
                  'relative pb-3 text-[13px] font-semibold transition-colors',
                  filter === 'all' ? 'text-[#8d1732]' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                All Projects
                <span className="ml-2 rounded-full bg-[#f5e8eb] px-2 py-0.5 text-[10px] text-[#8d1732]">{projects.length}</span>
                {filter === 'all' && <span className="absolute inset-x-0 -bottom-[13px] h-[2px] bg-[#9b1737]" />}
              </button>
              <button
                onClick={() => setFilter('recent')}
                className={clsx(
                  'relative pb-3 text-[13px] font-semibold transition-colors',
                  filter === 'recent' ? 'text-[#8d1732]' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                Recent
                {filter === 'recent' && <span className="absolute inset-x-0 -bottom-[13px] h-[2px] bg-[#9b1737]" />}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-10 min-w-[230px] flex-1 items-center gap-2 rounded-xl border border-[#e5dadd] bg-white px-3 text-slate-400 shadow-sm lg:flex-none">
                <Search size={14} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
                />
              </label>

              <div className="relative">
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="h-10 appearance-none rounded-xl border border-[#e5dadd] bg-white py-0 pl-3 pr-9 text-xs font-medium text-slate-600 shadow-sm outline-none focus:border-[#c79ba7]"
                >
                  <option value="updated">Last updated</option>
                  <option value="name">Project name</option>
                  <option value="papers">Most papers</option>
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" />
              </div>

              <div className="flex rounded-xl border border-[#e5dadd] bg-white p-1 shadow-sm">
                <button
                  onClick={() => setViewMode('grid')}
                  className={clsx('flex h-8 w-8 items-center justify-center rounded-lg transition', viewMode === 'grid' ? 'bg-[#9b1737] text-white' : 'text-slate-400 hover:bg-slate-50')}
                  title="Grid view"
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={clsx('flex h-8 w-8 items-center justify-center rounded-lg transition', viewMode === 'list' ? 'bg-[#9b1737] text-white' : 'text-slate-400 hover:bg-slate-50')}
                  title="List view"
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </div>

          {visibleProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dbcbd0] bg-[#fffafb] px-6 py-14 text-center">
              <Search size={24} className="mx-auto mb-3 text-[#b89aa3]" />
              <p className="text-sm font-semibold text-[#4d3941]">No projects match this view</p>
              <p className="mt-1 text-xs text-slate-500">Try another search or switch back to all projects.</p>
            </div>
          ) : (
            <div className={clsx(
              viewMode === 'grid'
                ? 'grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4'
                : 'grid grid-cols-1 gap-4',
            )}>
              {visibleProjects.map((project) => {
                const papers = projectPapers[project.id] ?? []
                const firstPaper = papers[0]

                return (
                  <article
                    key={project.id}
                    className={clsx(
                      'group overflow-hidden rounded-[20px] border border-[#eadfe2] bg-white shadow-[0_18px_45px_-36px_rgba(77,27,44,.7)] transition-all duration-300 hover:-translate-y-1 hover:border-[#d8bcc4] hover:shadow-[0_25px_55px_-34px_rgba(88,28,46,.55)]',
                      viewMode === 'list' && 'flex min-h-[205px] flex-col sm:flex-row',
                    )}
                  >
                    <div className={clsx(
                      'relative shrink-0 overflow-hidden border-b border-[#eee4e7] bg-[#f8f2f4]',
                      viewMode === 'grid' ? 'h-[245px] w-full' : 'h-[220px] w-full sm:h-auto sm:w-[245px] sm:border-b-0 sm:border-r',
                    )}>
                      <PaperPreview projectId={project.id} paper={firstPaper} paperCount={project.paper_count ?? papers.length} />
                      <button
                        onClick={() => void handleDelete(project.id, project.name)}
                        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-400 opacity-0 shadow-sm backdrop-blur transition-all hover:text-red-500 group-hover:opacity-100"
                        title="Delete project"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col p-4">
                      <div className="min-h-[84px]">
                        <Link
                          to={`/projects/${project.id}`}
                          className="block truncate text-[17px] font-bold tracking-[-0.01em] text-[#261d21] transition hover:text-[#8d1732]"
                        >
                          {project.name}
                        </Link>
                        {project.description ? (
                          <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-slate-500">{project.description}</p>
                        ) : (
                          <p className="mt-1.5 text-[12px] italic text-slate-400">Research paper extraction workspace</p>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1.5"><FileText size={11} /> {project.paper_count ?? 0} papers</span>
                        <span className="flex items-center gap-1.5"><CheckSquare size={11} /> {project.row_count ?? 0} rows</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-400">
                        <CalendarDays size={11} /> Last updated {formatDate(project.updated_at)}
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <Link
                          to={`/projects/${project.id}`}
                          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#941735] px-4 text-xs font-semibold text-white shadow-[0_12px_25px_-18px_rgba(122,27,46,.9)] transition hover:bg-[#7A1B2E]"
                        >
                          Open Project <ArrowRight size={13} />
                        </Link>
                        <Link
                          to={`/projects/${project.id}/review`}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#e2d7da] bg-white text-slate-500 transition hover:border-[#caa8b1] hover:bg-[#fff8fa] hover:text-[#8d1732]"
                          title="Review"
                        >
                          <Eye size={14} />
                        </Link>
                        <Link
                          to={`/projects/${project.id}/analytics`}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#e2d7da] bg-white text-slate-500 transition hover:border-[#caa8b1] hover:bg-[#fff8fa] hover:text-[#8d1732]"
                          title="Analytics"
                        >
                          <BarChart3 size={14} />
                        </Link>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}

      {projects.length > 0 && (
        <section className="relative overflow-hidden rounded-[24px] border border-[#eadfe2] bg-[linear-gradient(115deg,#fff,#fff9fa_55%,#fdf0f3)] p-6 shadow-[0_18px_50px_-42px_rgba(92,34,50,.65)]">
          <div className="pointer-events-none absolute -bottom-16 -right-8 h-52 w-52 rounded-full border border-[#e7cfd6] opacity-40" />
          <div className="pointer-events-none absolute -bottom-10 right-14 h-36 w-36 rounded-full border border-[#efdce1] opacity-50" />
          <div className="relative grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f9e9ed] text-[#971937]"><Upload size={16} /></div>
              <div><p className="text-[13px] font-semibold text-[#2b2226]">Upload & organize</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Keep papers and projects together in one research workspace.</p></div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f9e9ed] text-[#971937]"><Database size={16} /></div>
              <div><p className="text-[13px] font-semibold text-[#2b2226]">Extract & analyze</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Turn research papers into structured, reviewable scientific data.</p></div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f9e9ed] text-[#971937]"><Activity size={16} /></div>
              <div><p className="text-[13px] font-semibold text-[#2b2226]">Track progress</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Follow extraction, review, and data quality at a glance.</p></div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f9e9ed] text-[#971937]"><ShieldCheck size={16} /></div>
              <div><p className="text-[13px] font-semibold text-[#2b2226]">Your data, your control</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Private, traceable, and always connected to source evidence.</p></div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

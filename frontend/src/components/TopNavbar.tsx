import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  Command,
  FileText,
  FolderKanban,
  LogOut,
  Search,
  User as UserIcon,
} from 'lucide-react'
import { authApi, papersApi, projectsApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import Avatar from './Avatar'

type SearchResult = {
  id: string
  title: string
  subtitle: string
  to: string
  kind: 'project' | 'paper'
}

/**
 * Premium shared top navigation.
 *
 * Both Layout and ProjectLayout render this exact component, so every
 * authenticated endpoint receives the same McGill / Cheese Database shell.
 */
export default function TopNavbar() {
  const { user, updateUser, logout } = useAuthStore()
  const navigate = useNavigate()

  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    authApi.me().then(updateUser).catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        window.setTimeout(() => searchRef.current?.focus(), 0)
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setMenuOpen(false)
        setNotificationsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const text = query.trim().toLowerCase()
    if (!searchOpen || text.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const projects: any[] = await projectsApi.list()
        const projectMatches: SearchResult[] = projects
          .filter((project) => `${project.name} ${project.description ?? ''}`.toLowerCase().includes(text))
          .slice(0, 4)
          .map((project) => ({
            id: `project-${project.id}`,
            title: project.name,
            subtitle: project.description || 'Research project',
            to: `/projects/${project.id}`,
            kind: 'project' as const,
          }))

        const paperGroups = await Promise.allSettled(
          projects.slice(0, 20).map(async (project) => {
            const papers: any[] = await papersApi.list(project.id)
            return papers.map((paper) => ({ project, paper }))
          }),
        )

        const paperMatches: SearchResult[] = paperGroups
          .flatMap((group) => group.status === 'fulfilled' ? group.value : [])
          .filter(({ paper }) => `${paper.original_name ?? ''} ${paper.filename ?? ''}`.toLowerCase().includes(text))
          .slice(0, 5)
          .map(({ project, paper }) => ({
            id: `paper-${paper.id}`,
            title: paper.original_name || paper.filename || `Paper ${paper.id}`,
            subtitle: project.name,
            to: `/projects/${project.id}/papers/${paper.id}/overview`,
            kind: 'paper' as const,
          }))

        if (!cancelled) setResults([...projectMatches, ...paperMatches].slice(0, 8))
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, searchOpen])

  const shortName = useMemo(() => {
    const full = (user?.full_name || user?.email || 'Researcher').trim()
    return full.split(/\s+/)[0]
  }, [user?.full_name, user?.email])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const openResult = (item: SearchResult) => {
    setSearchOpen(false)
    setQuery('')
    navigate(item.to)
  }

  return (
    <header
      className="relative z-50 h-[78px] shrink-0 px-2 pt-2 lg:px-3"
      style={{ background: 'var(--background)' }}
    >
      <div className="relative flex h-[64px] items-center overflow-visible rounded-[20px] border border-[#ecdde1] bg-white px-4 shadow-[0_1px_2px_rgba(76,21,39,.04),0_10px_28px_-22px_rgba(76,21,39,.35)] lg:px-5">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[20px]">
          <div className="absolute left-[43%] top-[-56px] h-[112px] w-[280px] rounded-full bg-[radial-gradient(circle,rgba(139,23,48,.06),transparent_68%)]" />
        </div>

        <NavLink to="/" className="relative z-10 flex min-w-0 shrink-0 items-center gap-3 rounded-xl py-1 transition-opacity hover:opacity-80">
          <img src="/mcgill.png" alt="McGill" className="h-12 w-auto object-contain" />
          <span className="hidden h-8 w-px bg-[#eee0e4] sm:block" />
          <div className="hidden min-w-0 sm:block">
            <p className="font-display text-[16px] font-semibold leading-none text-[#7A1B2E]">Cheese Database</p>
            <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#a9838c]">Research platform</p>
          </div>
        </NavLink>

        <div className="relative z-20 mx-auto hidden w-full max-w-[470px] px-8 md:block">
          <div
            className="group relative"
            onFocus={() => setSearchOpen(true)}
          >
            <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#718096] transition-colors group-focus-within:text-[#8B1730]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search papers, projects..."
              className="h-10 w-full rounded-[14px] border border-[#efe6e9] bg-[#faf6f7] pl-10 pr-16 text-[12px] text-[#263247] outline-none transition-all placeholder:text-[#9a99a3] focus:border-[#d7b8c1] focus:bg-white focus:shadow-[0_10px_28px_-20px_rgba(122,27,46,.45)]"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md border border-[#e8e0e3] bg-[#faf7f8] px-1.5 py-1 text-[9px] font-semibold text-[#9a8790]">
              <Command size={9} /> K
            </span>

            {searchOpen && (
              <>
                <div className="fixed inset-0 z-[-1]" onMouseDown={() => setSearchOpen(false)} />
                <div className="absolute left-0 right-0 top-[46px] overflow-hidden rounded-2xl border border-[#eadde1] bg-white shadow-[0_22px_55px_-25px_rgba(61,21,35,.42)]">
                  {query.trim().length < 2 ? (
                    <div className="px-4 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9b7a85]">Quick search</p>
                      <p className="mt-1 text-[11px] text-slate-500">Type at least two characters to find a project or paper.</p>
                    </div>
                  ) : searching ? (
                    <div className="px-4 py-4 text-[11px] text-slate-500">Searching your research workspace…</div>
                  ) : results.length ? (
                    <div className="p-1.5">
                      {results.map((item) => (
                        <button
                          key={item.id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => openResult(item)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#fff6f8]"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fff1f4] text-[#8B1730]">
                            {item.kind === 'paper' ? <FileText size={14} /> : <FolderKanban size={14} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11.5px] font-semibold text-[#263247]">{item.title}</p>
                            <p className="mt-0.5 truncate text-[9.5px] text-[#91a0b3]">{item.subtitle}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-[11px] text-slate-500">No matching projects or papers.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="relative z-20 ml-auto flex shrink-0 items-center gap-2">
          <div className="relative">
            <button
              onClick={() => {
                setNotificationsOpen((value) => !value)
                setMenuOpen(false)
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#f1e8ea] bg-[#faf6f7] text-[#6b5c62] transition-all hover:border-[#eadde1] hover:bg-[#fff1f4] hover:text-[#8B1730]"
              aria-label="Notifications"
            >
              <Bell size={16} />
            </button>
            {notificationsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setNotificationsOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-3 w-64 rounded-2xl border border-[#eadde1] bg-white p-4 shadow-[0_18px_45px_-20px_rgba(30,20,25,.35)]">
                  <p className="text-[12px] font-semibold text-[#263247]">Notifications</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500">You’re all caught up. Extraction updates will appear inside each paper workspace.</p>
                </div>
              </>
            )}
          </div>

          <span className="hidden h-7 w-px bg-[#eadde1] sm:block" />

          <div className="relative">
            <button
              onClick={() => {
                setMenuOpen((value) => !value)
                setNotificationsOpen(false)
              }}
              className="flex items-center gap-2 rounded-full border border-[#f1e8ea] bg-[#faf6f7] py-1 pl-1 pr-2.5 transition-all hover:border-[#eadde1] hover:bg-[#fff1f4]"
            >
              <Avatar user={user} size={34} />
              <span className="hidden max-w-[130px] truncate text-[12.5px] font-semibold text-[#2e384b] sm:block">
                {shortName}
              </span>
              <ChevronDown size={13} className={`text-[#8b98a9] transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-3 w-64 overflow-hidden rounded-2xl border border-[#eadde1] bg-white py-1.5 shadow-[0_18px_45px_-20px_rgba(30,20,25,.35)]">
                  <div className="flex items-center gap-3 border-b border-[#f1eaec] px-3.5 py-3">
                    <Avatar user={user} size={38} />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-[#263247]">{user?.full_name}</p>
                      <p className="truncate text-[10.5px] text-[#8e9bad]">{user?.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/profile') }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-slate-700 transition-colors hover:bg-[#fff7f9]"
                  >
                    <UserIcon size={14} className="text-slate-400" /> View profile
                  </button>
                  <div className="my-1 border-t border-[#f1eaec]" />
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

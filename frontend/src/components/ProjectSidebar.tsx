import { NavLink, useParams, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShieldCheck, Download, Settings,
  LogOut, ChevronRight, Wand2, GitBranch,
  Briefcase, ClipboardList, Users, Database, Home,
} from 'lucide-react'
import clsx from 'clsx'
import { useEffect } from 'react'
import { useAuthStore } from '../store/auth'

interface NavEntry { to: string; end?: boolean; label: string; Icon: React.ElementType }
interface NavGroup { label: string; items: NavEntry[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Project',
    items: [
      { to: '',          end: true, label: 'Dashboard', Icon: LayoutDashboard },
      { to: 'validation',           label: 'Review',    Icon: ShieldCheck },
      { to: 'dataset',              label: 'Database',  Icon: Database },
    ],
  },
  {
    label: 'Research',
    items: [
      { to: 'research-structure', label: 'Research Structure', Icon: GitBranch },
      { to: 'normalization',      label: 'Normalization',      Icon: Wand2 },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: 'export',   label: 'Export',   Icon: Download },
      { to: 'jobs',     label: 'Jobs',     Icon: Briefcase },
      { to: 'audit',    label: 'Audit',    Icon: ClipboardList },
      { to: 'team',     label: 'Team',     Icon: Users },
      { to: 'settings', label: 'Settings', Icon: Settings },
    ],
  },
]

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="select-none px-3 pb-1.5 pt-5 text-[9.5px] font-bold uppercase tracking-[0.10em] text-[#8190a8]">
      {label}
    </p>
  )
}

interface NavItemProps { to: string; label: string; Icon: React.ElementType; end?: boolean }

function NavItem({ to, label, Icon, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm transition-all duration-150',
          isActive
            ? 'font-semibold text-white'
            : 'text-[#56657c] hover:bg-[#f8f4f5] hover:text-[#281d21]',
        )
      }
      style={({ isActive }) => isActive ? {
        background: 'linear-gradient(135deg, #8B1730, #741326)',
        boxShadow: '0 8px 18px -12px rgba(122,27,46,0.9)',
      } : undefined}
    >
      {({ isActive }) => (
        <>
          <Icon size={14} className={clsx('shrink-0', isActive ? 'text-white' : 'text-[#8190a8]')} />
          <span className="truncate flex-1 text-[13px]">{label}</span>
          {isActive && <ChevronRight size={10} className="shrink-0 opacity-80" />}
        </>
      )}
    </NavLink>
  )
}

export default function ProjectSidebar() {
  const { projectId } = useParams<{ projectId: string }>()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const base = `/projects/${projectId}`

  useEffect(() => {
    if (!projectId) return
    try {
      localStorage.setItem('lastProjectId', projectId)
    } catch {
      // Browsers with blocked local storage can still use the project normally.
    }
  }, [projectId])

  let lastPaperId: string | null = null
  try {
    lastPaperId = projectId ? localStorage.getItem(`lastPaperId:${projectId}`) : null
  } catch {
    lastPaperId = null
  }

  return (
    <aside className="w-60 shrink-0 h-full flex flex-col overflow-hidden border-r border-[#efe7e9] bg-[linear-gradient(180deg,#fff_0%,#fffdfd_56%,#fffafa_100%)]">
      <div className="shrink-0 border-b border-[#f1eaec] px-4 pb-4 pt-5">
        <NavLink to="/" className="mb-3.5 flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80" title="Back to all projects">
          <div className="rounded-[10px] border border-[#ece6e8] bg-white p-1.5 shadow-sm">
            <img src="/mcgill.png" alt="McGill" className="h-10 w-auto" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold leading-tight text-[#182235]">McGill University</p>
            <p className="text-[9.5px] leading-tight text-[#7d8ba0]">Agricultural Sciences</p>
          </div>
        </NavLink>

        <NavLink
          to="/"
          className="relative flex items-center gap-2.5 overflow-hidden rounded-[11px] border border-[rgba(122,27,46,.14)] bg-[linear-gradient(135deg,rgba(122,27,46,.07),rgba(122,27,46,.035))] px-2.5 py-2 transition-all hover:border-[rgba(122,27,46,.24)] hover:bg-[#fff7f9]"
          title="Back to all projects"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[18px] shadow-sm">🧀</div>
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-[12px] font-semibold leading-tight text-[#7A1B2E]">Cheese Database</p>
            <p className="mt-0.5 text-[9.5px] leading-tight text-[rgba(122,27,46,.58)]">Research Platform</p>
          </div>
          <ChevronRight size={11} className="shrink-0 text-[#9f7e87]" />
        </NavLink>
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-3 py-2">
        <div className="pt-2">
          <NavLink
            to="/"
            className="group flex items-center gap-2.5 rounded-[10px] border border-[#eadde1] bg-white px-3 py-2.5 text-[#7A1B2E] shadow-[0_8px_20px_-18px_rgba(122,27,46,.65)] transition-all hover:-translate-y-px hover:bg-[#fff8fa]"
          >
            <Home size={14} className="shrink-0" />
            <span className="flex-1 text-[13px] font-semibold">All Projects</span>
            <ChevronRight size={10} className="opacity-60 transition-transform group-hover:translate-x-0.5" />
          </NavLink>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <SectionLabel label={group.label} />
            <div className="space-y-0.5">
              {group.items.map(({ to, end, label, Icon }) => {
                let href = end ? base : `${base}/${to}`
                if (to === 'validation' && lastPaperId) href += `?paperId=${lastPaperId}`
                return <NavItem key={label} to={href} label={label} Icon={Icon} end={end} />
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 px-3 pb-2">
        <div className="relative overflow-hidden rounded-[14px] border border-[#efe3e6] bg-[linear-gradient(145deg,#fffafa,#fff4f6)] px-3 py-3">
          <div className="pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rounded-full border border-[#8b1730]/10" />
          <div className="pointer-events-none absolute -bottom-3 right-7 h-12 w-12 rounded-full border border-[#8b1730]/10" />
          <p className="relative font-display text-[12px] italic leading-[1.25] text-[#7a4f5a]">Knowledge for<br />better dairy science.</p>
          <div className="relative mt-2 h-px w-7 bg-[#9c2d45]" />
        </div>
      </div>

      <div className="shrink-0 border-t border-[#f0e8ea] px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8B1730,#4E0F1C)] text-[11px] font-bold text-white shadow-sm">
            {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold leading-tight text-[#273247]">{user?.full_name}</p>
            <p className="truncate text-[9.5px] leading-tight text-[#8995a8]">{user?.email}</p>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            title="Sign out"
            className="rounded-lg p-1.5 text-[#8995a8] transition-colors hover:bg-red-50 hover:text-[#7A1B2E]"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}

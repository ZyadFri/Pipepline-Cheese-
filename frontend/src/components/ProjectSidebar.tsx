import { NavLink, useParams, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Cpu, FileText, UploadCloud,
  Database, FlaskConical, Activity, ShieldAlert, Download, Users, Settings,
  History,  LogOut, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../store/auth'

const PIPELINE_NAV = [
  { to: '',       end: true, label: 'Dashboard',     Icon: LayoutDashboard },
  { to: 'upload',            label: 'Upload Papers',  Icon: UploadCloud },
  { to: 'papers',            label: 'Papers',         Icon: FileText },
]

const DATABASE_NAV = [
  { to: 'dataset',      label: 'Scientific Database', Icon: Database },
  { to: 'experiments',  label: 'Experiments',         Icon: FlaskConical },
  { to: 'trajectories', label: 'Trajectories',        Icon: Activity },
  { to: 'thresholds',   label: 'Safety Thresholds',   Icon: ShieldAlert },
]

const ADMIN_NAV = [
  { to: 'team',     label: 'Team',          Icon: Users },
  { to: 'export',   label: 'Export Dataset', Icon: Download },
  { to: 'settings', label: 'Settings',      Icon: Settings },
  { to: 'audit',    label: 'Audit Log',     Icon: History },
  { to: 'jobs',     label: 'Pipeline Jobs', Icon: Cpu },
]

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="type-eyebrow px-3 pt-5 pb-1.5 text-slate-400 select-none" style={{ fontSize: '9.5px', letterSpacing: '0.09em' }}>
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
          'flex items-center gap-2.5 px-3 py-2 rounded-[--radius-md] text-sm transition-all duration-150',
          isActive
            ? 'text-white font-semibold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80',
        )
      }
      style={({ isActive }) => isActive ? {
        background: 'linear-gradient(135deg, #7A1B2E, #661523)',
        boxShadow: '0 2px 8px -2px rgba(122,27,46,0.45)',
      } : undefined}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={14}
            className={clsx('shrink-0', isActive ? 'text-white' : 'text-slate-400')}
          />
          <span className="truncate flex-1 text-[13px]">{label}</span>
          {isActive && <ChevronRight size={10} className="shrink-0 opacity-70" />}
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

  return (
    <aside className="w-60 shrink-0 h-full flex flex-col overflow-hidden border-r" style={{ background: 'var(--sidebar)', borderColor: 'var(--sidebar-border)' }}>

      {/* ── Brand ─────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="bg-white rounded-md p-1 shadow-xs border border-slate-100">
            <img src="/mcgill.png" alt="McGill" className="h-7 w-auto" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-800 leading-tight">McGill University</p>
            <p className="text-[9.5px] text-slate-400 leading-tight">Agricultural Sciences</p>
          </div>
        </div>
        {/* Project pill */}
        <div className="relative px-2.5 py-1.5 rounded-[--radius-md] overflow-hidden" style={{ background: 'rgba(122,27,46,0.07)', border: '1px solid rgba(122,27,46,0.16)' }}>
          <p className="font-display text-[12px] font-semibold truncate leading-tight" style={{ color: 'var(--primary)' }}>Cheese Database</p>
          <p className="text-[9.5px] leading-tight mt-0.5" style={{ color: 'rgba(122,27,46,0.6)' }}>Research Platform</p>
        </div>
      </div>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 scrollbar-none">
        <SectionLabel label="Extraction Pipeline" />
        <div className="space-y-0.5">
          {PIPELINE_NAV.map(({ to, end, label, Icon }) => (
            <NavItem
              key={label}
              to={end ? base : `${base}/${to}`}
              label={label}
              Icon={Icon}
              end={end}
            />
          ))}
        </div>

        <SectionLabel label="Scientific Database" />
        <div className="space-y-0.5">
          {DATABASE_NAV.map(({ to, label, Icon }) => (
            <NavItem key={label} to={`${base}/${to}`} label={label} Icon={Icon} />
          ))}
        </div>

        <SectionLabel label="Administration" />
        <div className="space-y-0.5">
          {ADMIN_NAV.map(({ to, label, Icon }) => (
            <NavItem key={label} to={`${base}/${to}`} label={label} Icon={Icon} />
          ))}
        </div>
      </nav>

      {/* ── User strip ────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold shadow-xs"
            style={{ background: 'linear-gradient(135deg, #7A1B2E, #4E0F1C)' }}
          >
            {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-800 truncate leading-tight">{user?.full_name}</p>
            <p className="text-[10px] text-slate-400 truncate leading-tight">{user?.email}</p>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            title="Sign out"
            className="p-1.5 text-slate-400 hover:text-[#7A1B2E] hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}

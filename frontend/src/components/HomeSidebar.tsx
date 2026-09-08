import { NavLink, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Briefcase,
  ClipboardList,
  Database,
  Download,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  TestTube2,
  Users,
  Wand2,
} from 'lucide-react'
import clsx from 'clsx'

type ProjectDestination =
  | ''
  | 'validation'
  | 'dataset'
  | 'studies'
  | 'experiments'
  | 'treatments'
  | 'normalization'
  | 'export'
  | 'jobs'
  | 'audit'
  | 'team'
  | 'settings'

interface SidebarItemProps {
  label: string
  Icon: React.ElementType
  destination?: ProjectDestination
  projectRequired?: boolean
}

function getLastProjectId() {
  try {
    return localStorage.getItem('lastProjectId')
  } catch {
    return null
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1.5 pt-5 text-[9.5px] font-bold uppercase tracking-[0.11em] text-[#8996a9]">
      {children}
    </p>
  )
}

function SidebarItem({ label, Icon, destination = '', projectRequired = false }: SidebarItemProps) {
  const navigate = useNavigate()
  const lastProjectId = getLastProjectId()

  if (!projectRequired) {
    return (
      <NavLink
        to="/"
        end
        className={({ isActive }) => clsx(
          'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13px] transition-all duration-150',
          isActive
            ? 'bg-[linear-gradient(135deg,#8B1730,#741326)] font-semibold text-white shadow-[0_8px_18px_-12px_rgba(122,27,46,.9)]'
            : 'text-[#56657c] hover:bg-[#f8f4f5] hover:text-[#281d21]',
        )}
      >
        <Icon size={14} className="shrink-0" />
        <span>{label}</span>
      </NavLink>
    )
  }

  const disabled = !lastProjectId
  const href = lastProjectId
    ? `/projects/${lastProjectId}${destination ? `/${destination}` : ''}`
    : '/'

  return (
    <button
      type="button"
      title={disabled ? 'Open a project first' : undefined}
      onClick={() => {
        if (disabled) return
        navigate(href)
      }}
      className={clsx(
        'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] transition-all duration-150',
        disabled
          ? 'cursor-default text-[#b2bac6]'
          : 'text-[#56657c] hover:bg-[#f8f4f5] hover:text-[#281d21]',
      )}
    >
      <Icon size={14} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

export default function HomeSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col overflow-hidden border-r border-[#efe7e9] bg-[linear-gradient(180deg,#fff_0%,#fffdfd_58%,#fffafa_100%)] lg:flex">
      <div className="border-b border-[#f1eaec] px-4 pb-4 pt-5">
        <div className="relative flex items-center gap-2.5 overflow-hidden rounded-[11px] border border-[rgba(122,27,46,.14)] bg-[linear-gradient(135deg,rgba(122,27,46,.07),rgba(122,27,46,.035))] px-2.5 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[18px] shadow-sm">🧀</div>
          <div className="min-w-0">
            <p className="font-display truncate text-[12px] font-semibold leading-tight text-[#7A1B2E]">Cheese Database</p>
            <p className="mt-0.5 text-[9.5px] leading-tight text-[rgba(122,27,46,.58)]">Research Platform</p>
          </div>
        </div>
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-3 py-2">
        <SectionLabel>Workspace</SectionLabel>
        <div className="space-y-0.5">
          <SidebarItem label="Projects" Icon={LayoutDashboard} />
          <SidebarItem label="Paper Library" Icon={BookOpen} destination="" projectRequired />
          <SidebarItem label="Review" Icon={ShieldCheck} destination="validation" projectRequired />
          <SidebarItem label="Database" Icon={Database} destination="dataset" projectRequired />
        </div>

        <SectionLabel>Analysis</SectionLabel>
        <div className="space-y-0.5">
          <SidebarItem label="Studies" Icon={FlaskConical} destination="studies" projectRequired />
          <SidebarItem label="Experiments" Icon={FolderKanban} destination="experiments" projectRequired />
          <SidebarItem label="Treatments" Icon={TestTube2} destination="treatments" projectRequired />
          <SidebarItem label="Normalization" Icon={Wand2} destination="normalization" projectRequired />
        </div>

        <SectionLabel>Admin</SectionLabel>
        <div className="space-y-0.5">
          <SidebarItem label="Export" Icon={Download} destination="export" projectRequired />
          <SidebarItem label="Jobs" Icon={Briefcase} destination="jobs" projectRequired />
          <SidebarItem label="Audit" Icon={ClipboardList} destination="audit" projectRequired />
          <SidebarItem label="Team" Icon={Users} destination="team" projectRequired />
          <SidebarItem label="Settings" Icon={Settings} destination="settings" projectRequired />
        </div>
      </nav>

      <div className="px-3 pb-4">
        <div className="relative overflow-hidden rounded-[14px] border border-[#efe3e6] bg-[linear-gradient(145deg,#fffafa,#fff4f6)] px-3.5 py-4">
          <div className="pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rounded-full border border-[#8b1730]/10" />
          <div className="pointer-events-none absolute -bottom-3 right-7 h-12 w-12 rounded-full border border-[#8b1730]/10" />
          <p className="relative font-display text-[13px] italic leading-[1.35] text-[#7a4f5a]">From research papers<br />to real impact.</p>
          <div className="relative mt-2.5 h-px w-8 bg-[#9c2d45]" />
        </div>
      </div>
    </aside>
  )
}

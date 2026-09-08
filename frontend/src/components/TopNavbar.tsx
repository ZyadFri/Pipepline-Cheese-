import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react'
import { authApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import Avatar from './Avatar'

/**
 * Shared top navigation bar, used on every page (both the top-level
 * Dashboard layout and every project page) so the app reads as one
 * consistent SaaS product rather than two different shells.
 */
export default function TopNavbar() {
  const { user, updateUser, logout } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    // Hydrate avatar/bio fields that a plain login response doesn't carry,
    // and keep them fresh (e.g. after an avatar upload from another tab).
    authApi.me().then(updateUser).catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header
      className="sticky top-0 z-40 h-14 shrink-0 border-b"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px) saturate(120%)',
        borderColor: 'var(--border, #eee4e7)',
      }}
    >
      <div className="flex h-full items-center justify-between px-4 lg:px-5">
        <NavLink to="/" className="flex items-center gap-2.5">
          <img src="/mcgill.png" alt="McGill" className="h-7 w-auto" />
          <span className="hidden h-5 w-px bg-slate-200 sm:block" />
          <span className="hidden font-display text-[14.5px] sm:block">
            <span className="font-semibold text-slate-800">Cheese </span>
            <span className="font-semibold" style={{ color: '#8B1730' }}>Database</span>
          </span>
        </NavLink>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-slate-50"
          >
            <Avatar user={user} size={28} />
            <span className="hidden max-w-[140px] truncate text-[12.5px] font-medium text-slate-700 sm:block">
              {user?.full_name}
            </span>
            <ChevronDown size={13} className={`text-slate-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-[0_18px_45px_-20px_rgba(30,20,25,.35)]">
                <div className="flex items-center gap-3 border-b border-slate-100 px-3.5 py-3">
                  <Avatar user={user} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-slate-900">{user?.full_name}</p>
                    <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate('/profile') }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <UserIcon size={14} className="text-slate-400" /> View profile
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

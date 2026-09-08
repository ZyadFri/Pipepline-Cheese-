import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { LogOut, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import HomeSidebar from './HomeSidebar'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px) saturate(120%)', borderColor: 'var(--border)' }}>
        <div className="h-16 px-5 lg:px-6 flex items-center justify-between">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-3 lg:pl-1">
            <img src="/mcgill.png" alt="McGill" className="h-8 w-auto" />
            <span className="font-display text-[19px] font-bold tracking-[-0.01em]" style={{ color: 'var(--primary)' }}>McGill</span>
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <span className="hidden font-display text-[15px] sm:block">
              <span className="font-semibold" style={{ color: 'var(--foreground)' }}>Cheese </span>
              <span className="font-semibold" style={{ color: 'var(--primary)' }}>Database</span>
            </span>
          </NavLink>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-xs"
                style={{ background: 'linear-gradient(135deg, #7A1B2E, #4E0F1C)' }}
              >
                {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
              </div>
              <span className="text-sm font-medium text-slate-700 hidden sm:block">
                {user?.full_name}
              </span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-100 mb-1">
                    <p className="text-xs font-semibold text-slate-900 truncate">{user?.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <HomeSidebar />

        {/* Dashboard content */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

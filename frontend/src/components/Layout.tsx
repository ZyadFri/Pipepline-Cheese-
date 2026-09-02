import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { LogOut, User, ChevronDown } from 'lucide-react'
import { useState } from 'react'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas)' }}>
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px) saturate(120%)', borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-3 group">
            <div className="bg-white rounded-md p-1 shadow-xs border border-slate-100 group-hover:shadow-sm transition-shadow">
              <img src="/mcgill.png" alt="McGill" className="h-7 w-auto" />
            </div>
            <div className="hidden sm:block">
              <span className="font-display font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Meat & Cheese</span>
              <span className="font-display font-semibold text-sm" style={{ color: 'var(--primary)' }}> Database</span>
            </div>
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

      {/* Dashboard content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

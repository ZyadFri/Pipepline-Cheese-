import { Outlet } from 'react-router-dom'
import HomeSidebar from './HomeSidebar'
import TopNavbar from './TopNavbar'

export default function Layout() {
  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--background)' }}>
      <TopNavbar />

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

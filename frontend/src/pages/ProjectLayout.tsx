import { Outlet } from 'react-router-dom'
import ProjectSidebar from '../components/ProjectSidebar'
import TopNavbar from '../components/TopNavbar'

export default function ProjectLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopNavbar />
      <div className="flex min-h-0 flex-1">
        <ProjectSidebar />
        <main className="flex-1 overflow-y-auto bg-white min-w-0 flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

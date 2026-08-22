import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <nav className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold text-gray-900 hover:text-blue-600">
              Site Materials
            </Link>
            <Link to="/" className="text-sm text-gray-600 hover:text-blue-600">
              Projects
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

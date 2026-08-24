import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Building2, Calendar, MapPin } from 'lucide-react'

export function ProjectsPage() {
  const [showNewProjectForm, setShowNewProjectForm] = useState(false)
  const queryClient = useQueryClient()

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    }
  })

  const createProject = useMutation({
    mutationFn: async (newProject) => {
      const { data, error } = await supabase
        .from('projects')
        .insert([newProject])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects'])
      setShowNewProjectForm(false)
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    createProject.mutate({
      name: formData.get('name'),
      client: formData.get('client') || null,
      location: formData.get('location') || null,
      install_date: formData.get('install_date') || null,
      status: 'draft'
    })
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading projects...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setShowNewProjectForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus size={20} />
          New Project
        </button>
      </div>

      {showNewProjectForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Create New Project</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client
                </label>
                <input
                  type="text"
                  name="client"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  name="location"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Install Date
                </label>
                <input
                  type="date"
                  name="install_date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewProjectForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProject.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {createProject.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {projects && projects.length === 0 ? (
        <div className="text-center py-12">
          <Building2 size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 mb-4">No projects yet</p>
          <button
            onClick={() => setShowNewProjectForm(true)}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Create your first project →
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="block p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-gray-900 mb-2">{project.name}</h3>
              {project.client && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Building2 size={16} />
                  {project.client}
                </div>
              )}
              {project.location && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <MapPin size={16} />
                  {project.location}
                </div>
              )}
              {project.install_date && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar size={16} />
                  Install: {new Date(project.install_date).toLocaleDateString()}
                </div>
              )}
              <span className={`inline-block mt-3 px-2 py-1 text-xs rounded-full ${
                project.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                project.status === 'active' ? 'bg-green-100 text-green-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {project.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

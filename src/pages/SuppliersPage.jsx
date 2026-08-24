import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useState } from 'react'
import { Building2, Plus, MapPin, Phone, Mail } from 'lucide-react'

export function SuppliersPage() {
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false)
  const queryClient = useQueryClient()

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    }
  })

  const createSupplier = useMutation({
    mutationFn: async (newSupplier) => {
      const { data, error } = await supabase
        .from('suppliers')
        .insert([newSupplier])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['suppliers'])
      setShowNewSupplierForm(false)
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    createSupplier.mutate({
      name: formData.get('name'),
      location: formData.get('location') || null,
      contact: formData.get('contact') || null,
      whatsapp: formData.get('whatsapp') || null
    })
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading suppliers...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
        <button
          onClick={() => setShowNewSupplierForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus size={20} />
          New Supplier
        </button>
      </div>

      {showNewSupplierForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Create New Supplier</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier Name *
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
                  Location
                </label>
                <input
                  type="text"
                  name="location"
                  placeholder="City, country"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Person
                </label>
                <input
                  type="text"
                  name="contact"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  WhatsApp
                </label>
                <input
                  type="text"
                  name="whatsapp"
                  placeholder="+1 234 567 8900"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewSupplierForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSupplier.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {createSupplier.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {suppliers && suppliers.length === 0 ? (
        <div className="text-center py-12">
          <Building2 size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 mb-4">No suppliers yet</p>
          <button
            onClick={() => setShowNewSupplierForm(true)}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Add your first supplier →
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {suppliers?.map((supplier) => (
            <div
              key={supplier.id}
              className="p-4 bg-white border border-gray-200 rounded-lg"
            >
              <h3 className="font-semibold text-gray-900 mb-2">{supplier.name}</h3>
              {supplier.location && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <MapPin size={16} />
                  {supplier.location}
                </div>
              )}
              {supplier.contact && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Building2 size={16} />
                  {supplier.contact}
                </div>
              )}
              {supplier.whatsapp && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone size={16} />
                  {supplier.whatsapp}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

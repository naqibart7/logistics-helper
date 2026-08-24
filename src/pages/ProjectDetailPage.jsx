import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useParams } from 'react-router-dom'
import { useState } from 'react'
import { ItemAutocomplete, CreateCatalogItemModal } from '../components/ItemAutocomplete'
import { 
  ArrowLeft, Plus, Calendar, AlertTriangle, CheckCircle, Package, 
  Truck, Edit2, Trash2, Save, X 
} from 'lucide-react'
import { Link } from 'react-router-dom'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const queryClient = useQueryClient()
  const [showNewMaterialForm, setShowNewMaterialForm] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState(null)
  const [newCatalogItem, setNewCatalogItem] = useState(null)

  // Fetch project details
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      
      if (error) throw error
      return data
    }
  })

  // Fetch materials with readiness status
  const { data: materials, isLoading: materialsLoading } = useQuery({
    queryKey: ['materials', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select(`
          *,
          item_catalog (id, canonical_name, category, default_unit),
          suppliers (id, name)
        `)
        .eq('project_id', projectId)
        .order('need_by_date', { ascending: true })
      
      if (error) throw error
      return data || []
    }
  })

  // Fetch suppliers for dropdown
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name')
      
      if (error) throw error
      return data || []
    }
  })

  // Create material mutation
  const createMaterial = useMutation({
    mutationFn: async (newMaterial) => {
      const { data, error } = await supabase
        .from('materials')
        .insert([newMaterial])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['materials', projectId])
      setShowNewMaterialForm(false)
      setNewCatalogItem(null)
    }
  })

  // Update material mutation
  const updateMaterial = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data, error } = await supabase
        .from('materials')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['materials', projectId])
      setEditingMaterial(null)
    }
  })

  // Delete material mutation
  const deleteMaterial = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['materials', projectId])
    }
  })

  // Create catalog item mutation
  const createCatalogItem = useMutation({
    mutationFn: async (itemData) => {
      const { data, error } = await supabase
        .from('item_catalog')
        .insert([itemData])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: (newItem) => {
      queryClient.invalidateQueries(['itemCatalog'])
      // Auto-select the new item in the form
      setNewCatalogItem(null)
      return newItem
    }
  })

  const handleCreateMaterial = (formData) => {
    const needByDate = formData.get('need_by_date')
    const leadTimeDays = parseInt(formData.get('lead_time_days'), 10)
    
    if (!needByDate || !leadTimeDays || leadTimeDays < 0) {
      alert('Need-by date and lead time are required. The system must know what "late" means.')
      return
    }

    const itemId = formData.get('item_id')
    
    // If no item selected but we have a name, create catalog item first
    if (!itemId && newCatalogItem) {
      createCatalogItem.mutate(newCatalogItem, {
        onSuccess: (catalogItem) => {
          createMaterial.mutate({
            project_id: projectId,
            item_id: catalogItem.id,
            quantity_required: parseFloat(formData.get('quantity_required')),
            unit: formData.get('unit') || catalogItem.default_unit,
            supplier_id: formData.get('supplier_id') || null,
            need_by_date,
            lead_time_days: leadTimeDays,
            price_per_unit: formData.get('price_per_unit') ? parseFloat(formData.get('price_per_unit')) : null,
            source: 'manual'
          })
        }
      })
    } else if (itemId) {
      createMaterial.mutate({
        project_id: projectId,
        item_id: itemId,
        quantity_required: parseFloat(formData.get('quantity_required')),
        unit: formData.get('unit'),
        supplier_id: formData.get('supplier_id') || null,
        need_by_date,
        lead_time_days: leadTimeDays,
        price_per_unit: formData.get('price_per_unit') ? parseFloat(formData.get('price_per_unit')) : null,
        source: 'manual'
      })
    }
  }

  const handleUpdateMaterial = (id, updates) => {
    updateMaterial.mutate({ id, updates })
  }

  const getStatusBadge = (status) => {
    const badges = {
      planned: 'bg-gray-100 text-gray-700',
      ordered: 'bg-blue-100 text-blue-700',
      at_risk: 'bg-yellow-100 text-yellow-700',
      late: 'bg-red-100 text-red-700',
      on_site: 'bg-green-100 text-green-700',
      complete: 'bg-green-600 text-white'
    }
    return badges[status] || badges.planned
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'complete': return <CheckCircle size={16} />
      case 'late': return <AlertTriangle size={16} />
      case 'at_risk': return <AlertTriangle size={16} />
      case 'ordered': return <Truck size={16} />
      case 'on_site': return <Package size={16} />
      default: return <Calendar size={16} />
    }
  }

  // Sort materials by urgency: late first, then at_risk, then planned/ordered
  const sortedMaterials = materials?.sort((a, b) => {
    const priority = { late: 0, at_risk: 1, planned: 2, ordered: 3, on_site: 4, complete: 5 }
    return (priority[a.status] ?? 2) - (priority[b.status] ?? 2)
  })

  if (projectLoading || materialsLoading) {
    return <div className="text-center py-12 text-gray-500">Loading project...</div>
  }

  if (!project) {
    return <div className="text-center py-12 text-gray-500">Project not found</div>
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 mb-3">
          <ArrowLeft size={16} />
          Back to Projects
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <div className="flex gap-4 mt-2 text-sm text-gray-600">
              {project.client && (
                <span className="flex items-center gap-1">
                  <Package size={14} />
                  {project.client}
                </span>
              )}
              {project.location && (
                <span className="flex items-center gap-1">
                  <Package size={14} />
                  {project.location}
                </span>
              )}
              {project.install_date && (
                <span className="flex items-center gap-1">
                  <Calendar size={14} />
                  Install: {new Date(project.install_date).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowNewMaterialForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus size={20} />
            Add Material
          </button>
        </div>
      </div>

      {/* Readiness Dashboard */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <AlertTriangle size={20} className="text-blue-600" />
          Materials Readiness
        </h2>
        
        {sortedMaterials && sortedMaterials.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package size={48} className="mx-auto text-gray-400 mb-3" />
            <p>No materials added yet</p>
            <button
              onClick={() => setShowNewMaterialForm(true)}
              className="mt-2 text-blue-600 hover:text-blue-700 font-medium"
            >
              Add your first material →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedMaterials?.map((material) => (
              <MaterialRow
                key={material.id}
                material={material}
                onEdit={() => setEditingMaterial(material)}
                onDelete={() => deleteMaterial.mutate(material.id)}
                onUpdate={handleUpdateMaterial}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Material Modal */}
      {showNewMaterialForm && (
        <NewMaterialModal
          suppliers={suppliers || []}
          installDate={project.install_date}
          onSubmit={handleCreateMaterial}
          onCancel={() => {
            setShowNewMaterialForm(false)
            setNewCatalogItem(null)
          }}
          onNewCatalogItem={setNewCatalogItem}
          isCreating={createMaterial.isPending || createCatalogItem.isPending}
        />
      )}

      {/* Edit Material Modal */}
      {editingMaterial && (
        <EditMaterialModal
          material={editingMaterial}
          suppliers={suppliers || []}
          onSubmit={(updates) => handleUpdateMaterial(editingMaterial.id, updates)}
          onCancel={() => setEditingMaterial(null)}
          isUpdating={updateMaterial.isPending}
        />
      )}

      {/* Create Catalog Item Modal */}
      {newCatalogItem && (
        <CreateCatalogItemModal
          name={newCatalogItem}
          onConfirm={(itemData) => createCatalogItem.mutate(itemData)}
          onCancel={() => setNewCatalogItem(null)}
        />
      )}
    </div>
  )
}

function MaterialRow({ material, onEdit, onDelete, onUpdate }) {
  const statusBadge = getStatusBadge(material.status)
  const statusIcon = getStatusIcon(material.status)

  return (
    <div className={`flex items-center justify-between p-4 border rounded-lg ${
      material.status === 'late' ? 'border-red-200 bg-red-50' :
      material.status === 'at_risk' ? 'border-yellow-200 bg-yellow-50' :
      'border-gray-200 bg-white'
    }`}>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${statusBadge}`}>
            {statusIcon}
            {material.status}
          </span>
          <span className="font-medium text-gray-900">
            {material.item_catalog?.canonical_name || 'Unknown Item'}
          </span>
        </div>
        <div className="flex gap-4 text-sm text-gray-600">
          <span>Qty: {material.quantity_required} {material.unit}</span>
          {material.suppliers?.name && (
            <span>Supplier: {material.suppliers.name}</span>
          )}
          <span className={material.status === 'late' || material.status === 'at_risk' ? 'text-red-600 font-medium' : ''}>
            Need by: {new Date(material.need_by_date).toLocaleDateString()}
          </span>
          <span>Order by: {new Date(material.order_by_date).toLocaleDateString()}</span>
        </div>
        {material.status === 'at_risk' && (
          <div className="mt-2 text-xs text-yellow-700 flex items-center gap-1">
            <AlertTriangle size={12} />
            Should have been ordered already
          </div>
        )}
        {material.status === 'late' && (
          <div className="mt-2 text-xs text-red-700 flex items-center gap-1">
            <AlertTriangle size={12} />
            Past need-by date
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onEdit}
          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
        >
          <Edit2 size={16} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

function NewMaterialModal({ suppliers, installDate, onSubmit, onCancel, onNewCatalogItem, isCreating }) {
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [pendingItemName, setPendingItemName] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    
    // Enforce Principle 2: need_by_date and lead_time_days are required
    const needByDate = formData.get('need_by_date')
    const leadTimeDays = formData.get('lead_time_days')
    
    if (!needByDate) {
      alert('Need-by date is required. When must this be on site?')
      return
    }
    if (!leadTimeDays || parseInt(leadTimeDays) < 0) {
      alert('Lead time is required. How many days does delivery take?')
      return
    }

    if (!selectedItemId && !pendingItemName) {
      alert('Please select or create an item')
      return
    }

    onSubmit(formData)
  }

  const handleItemChange = (value, newName) => {
    setSelectedItemId(value)
    if (newName) {
      setPendingItemName(newName)
      onNewCatalogItem(newName)
    }
  }

  // Default need_by_date to project install_date
  const defaultNeedByDate = installDate || ''

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Add Material</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item *
            </label>
            <ItemAutocomplete
              value={selectedItemId}
              onChange={handleItemChange}
              placeholder="Search catalog or type to create new..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity Required *
            </label>
            <input
              type="number"
              name="quantity_required"
              step="0.01"
              required
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unit
            </label>
            <input
              type="text"
              name="unit"
              placeholder="e.g., sqm, pcs, kg"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier
            </label>
            <select
              name="supplier_id"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select supplier...</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price per Unit
            </label>
            <input
              type="number"
              name="price_per_unit"
              step="0.01"
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Need By Date *
            </label>
            <input
              type="date"
              name="need_by_date"
              defaultValue={defaultNeedByDate}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              When must this be physically on site?
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lead Time (days) *
            </label>
            <input
              type="number"
              name="lead_time_days"
              min="0"
              required
              placeholder="e.g., 7, 14, 30"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              How many days from order to delivery? We'll prompt to save for this supplier+item combo.
            </p>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreating ? 'Adding...' : 'Add Material'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditMaterialModal({ material, suppliers, onSubmit, onCancel, isUpdating }) {
  const [formData, setFormData] = useState({
    quantity_required: material.quantity_required,
    unit: material.unit || '',
    supplier_id: material.supplier_id || '',
    price_per_unit: material.price_per_unit || '',
    need_by_date: material.need_by_date,
    lead_time_days: material.lead_time_days,
    quantity_delivered: material.quantity_delivered || 0,
    checklist_note: material.checklist_note || ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      quantity_required: parseFloat(formData.quantity_required),
      price_per_unit: formData.price_per_unit ? parseFloat(formData.price_per_unit) : null,
      lead_time_days: parseInt(formData.lead_time_days, 10)
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-auto">
        <h2 className="text-xl font-semibold mb-4">
          Edit: {material.item_catalog?.canonical_name || 'Material'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity Required
            </label>
            <input
              type="number"
              value={formData.quantity_required}
              onChange={(e) => setFormData({...formData, quantity_required: e.target.value})}
              step="0.01"
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity Delivered
            </label>
            <input
              type="number"
              value={formData.quantity_delivered}
              onChange={(e) => setFormData({...formData, quantity_delivered: e.target.value})}
              step="0.01"
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unit
            </label>
            <input
              type="text"
              value={formData.unit}
              onChange={(e) => setFormData({...formData, unit: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier
            </label>
            <select
              value={formData.supplier_id}
              onChange={(e) => setFormData({...formData, supplier_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select supplier...</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price per Unit
            </label>
            <input
              type="number"
              value={formData.price_per_unit}
              onChange={(e) => setFormData({...formData, price_per_unit: e.target.value})}
              step="0.01"
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Need By Date
            </label>
            <input
              type="date"
              value={formData.need_by_date}
              onChange={(e) => setFormData({...formData, need_by_date: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lead Time (days)
            </label>
            <input
              type="number"
              value={formData.lead_time_days}
              onChange={(e) => setFormData({...formData, lead_time_days: e.target.value})}
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Checklist Note
            </label>
            <textarea
              value={formData.checklist_note}
              onChange={(e) => setFormData({...formData, checklist_note: e.target.value})}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Notes for on-site verification..."
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function getStatusBadge(status) {
  const badges = {
    planned: 'bg-gray-100 text-gray-700',
    ordered: 'bg-blue-100 text-blue-700',
    at_risk: 'bg-yellow-100 text-yellow-700',
    late: 'bg-red-100 text-red-700',
    on_site: 'bg-green-100 text-green-700',
    complete: 'bg-green-600 text-white'
  }
  return badges[status] || badges.planned
}

function getStatusIcon(status) {
  switch (status) {
    case 'complete': return <CheckCircle size={16} />
    case 'late': return <AlertTriangle size={16} />
    case 'at_risk': return <AlertTriangle size={16} />
    case 'ordered': return <Truck size={16} />
    case 'on_site': return <Package size={16} />
    default: return <Calendar size={16} />
  }
}

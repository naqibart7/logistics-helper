import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import Fuse from 'fuse.js'
import { Search, Plus, Check } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'

/**
 * Catalog-backed autocomplete for item selection.
 * Enforces Principle 4: All item entry resolves against canonical catalog.
 */
export function ItemAutocomplete({ value, onChange, onBlur, placeholder = "Search items..." }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)

  const { data: catalogItems } = useQuery({
    queryKey: ['itemCatalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_catalog')
        .select('*')
        .order('canonical_name')
      
      if (error) throw error
      return data || []
    }
  })

  // Build Fuse instance for fuzzy matching
  const fuse = useMemo(() => {
    if (!catalogItems) return null
    return new Fuse(catalogItems, {
      keys: ['canonical_name', 'aliases'],
      threshold: 0.4,
      ignoreLocation: true
    })
  }, [catalogItems])

  const searchResults = useMemo(() => {
    if (!searchTerm.trim() || !fuse) return []
    return fuse.search(searchTerm).slice(0, 8).map(r => r.item)
  }, [searchTerm, fuse])

  // Sync external value changes
  useEffect(() => {
    if (value && catalogItems) {
      const found = catalogItems.find(item => item.id === value)
      if (found) setSelectedItem(found)
    }
  }, [value, catalogItems])

  const handleSelect = (item) => {
    setSelectedItem(item)
    setSearchTerm(item.canonical_name)
    onChange(item.id)
    setShowDropdown(false)
    if (onBlur) onBlur()
  }

  const handleCreateNew = () => {
    if (!searchTerm.trim()) return
    // Signal parent to create new catalog item
    onChange(null, searchTerm.trim())
    setShowDropdown(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search 
          size={16} 
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" 
        />
        <input
          type="text"
          value={selectedItem ? selectedItem.canonical_name : searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setShowDropdown(true)
            if (selectedItem) setSelectedItem(null)
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      {showDropdown && (searchResults.length > 0 || searchTerm.trim()) && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-auto">
          {searchResults.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between gap-2"
            >
              <div>
                <div className="font-medium text-gray-900">{item.canonical_name}</div>
                {item.category && (
                  <div className="text-xs text-gray-500">{item.category}</div>
                )}
                {item.aliases && item.aliases.length > 0 && (
                  <div className="text-xs text-gray-400">
                    Also known as: {item.aliases.join(', ')}
                  </div>
                )}
              </div>
              {value === item.id && <Check size={16} className="text-green-600" />}
            </button>
          ))}

          {searchResults.length === 0 && searchTerm.trim() && (
            <button
              type="button"
              onClick={handleCreateNew}
              className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2 text-blue-600"
            >
              <Plus size={16} />
              Create new item: "{searchTerm.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Modal for creating a new canonical catalog item.
 * Called when user chooses to create a new item from autocomplete.
 */
export function CreateCatalogItemModal({ name, onConfirm, onCancel }) {
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('')
  const [aliases, setAliases] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onConfirm({
      canonical_name: name,
      category: category || null,
      default_unit: unit || null,
      aliases: aliases.split(',').map(a => a.trim()).filter(Boolean)
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Create New Catalog Item</h2>
        <p className="text-sm text-gray-600 mb-4">
          Creating: <strong>{name}</strong>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Glass, Hardware, Sealant"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Unit
            </label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g., sqm, pcs, kg"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aliases (comma-separated)
            </label>
            <input
              type="text"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Variant spellings, abbreviations"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-ring-2 focus:ring-blue-500"
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
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

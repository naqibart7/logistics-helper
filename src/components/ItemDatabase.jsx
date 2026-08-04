import React, { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, Edit2, Check, X, Search, Download, FileUp, Package } from 'lucide-react';

const CATEGORIES = [
    'all', 'hardware', 'electrical', 'lighting', 'paint',
    'wainscotting', 'fastener', 'plumbing', 'tools', 'other'
];

const ItemDatabase = ({ catalog, setCatalog }) => {
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', category: '', price: '' });
    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState({ name: '', category: 'hardware', price: '' });
    const [sortField, setSortField] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const fileInputRef = useRef(null);

    // Derive unique categories from actual data
    const availableCategories = useMemo(() => {
        const cats = new Set(catalog.map(item => (item.category || '').toLowerCase()));
        return ['all', ...Array.from(cats).sort()];
    }, [catalog]);

    // Filter + sort
    const filteredItems = useMemo(() => {
        let items = [...catalog];

        // Search
        if (search.trim()) {
            const q = search.toLowerCase();
            items = items.filter(item =>
                item.name.toLowerCase().includes(q) ||
                (item.category || '').toLowerCase().includes(q)
            );
        }

        // Category filter
        if (categoryFilter !== 'all') {
            items = items.filter(item =>
                (item.category || '').toLowerCase() === categoryFilter
            );
        }

        // Sort
        items.sort((a, b) => {
            let valA, valB;
            if (sortField === 'price') {
                valA = parseFloat(a.price) || 0;
                valB = parseFloat(b.price) || 0;
            } else {
                valA = (a[sortField] || '').toLowerCase();
                valB = (b[sortField] || '').toLowerCase();
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return items;
    }, [catalog, search, categoryFilter, sortField, sortDir]);

    const toggleSort = (field) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const sortIcon = (field) => {
        if (sortField !== field) return '↕';
        return sortDir === 'asc' ? '↑' : '↓';
    };

    // --- CRUD ---
    const handleAdd = () => {
        if (!addForm.name.trim()) return;
        const newItem = {
            name: addForm.name.trim(),
            category: addForm.category.trim().toLowerCase(),
            price: parseFloat(addForm.price) || 0
        };
        setCatalog(prev => [...prev, newItem]);
        setAddForm({ name: '', category: 'hardware', price: '' });
        setShowAddForm(false);
    };

    const startEdit = (item, index) => {
        setEditingId(index);
        setEditForm({
            name: item.name,
            category: item.category || '',
            price: item.price ?? ''
        });
    };

    const saveEdit = (originalIndex) => {
        if (!editForm.name.trim()) return;
        setCatalog(prev => {
            // We need to map using the original catalog index, not filtered index
            const updated = [...prev];
            const actualIndex = prev.findIndex((item, i) => {
                // Match by the filteredItems[originalIndex] reference
                return item === filteredItems[originalIndex];
            });
            if (actualIndex !== -1) {
                updated[actualIndex] = {
                    ...updated[actualIndex],
                    name: editForm.name.trim(),
                    category: editForm.category.trim().toLowerCase(),
                    price: parseFloat(editForm.price) || 0
                };
            }
            return updated;
        });
        setEditingId(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({ name: '', category: '', price: '' });
    };

    const deleteItem = (filteredIndex) => {
        const item = filteredItems[filteredIndex];
        if (!window.confirm(`Delete "${item.name}"?`)) return;
        setCatalog(prev => prev.filter(i => i !== item));
    };

    // --- CSV Export ---
    const exportCSV = () => {
        const rows = [['Name', 'Category', 'Price']];
        catalog.forEach(item => {
            rows.push([
                `"${(item.name || '').replace(/"/g, '""')}"`,
                item.category || '',
                item.price ?? ''
            ]);
        });
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `item_catalog_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // --- CSV Import ---
    const importCSV = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            // Skip header if present
            const startIdx = lines[0]?.toLowerCase().includes('name') ? 1 : 0;
            const newItems = [];
            for (let i = startIdx; i < lines.length; i++) {
                // Simple CSV parse (handles quoted fields)
                const match = lines[i].match(/(?:"([^"]*(?:""[^"]*)*)"|([^,]*))(?:,(?:"([^"]*(?:""[^"]*)*)"|([^,]*)))?(?:,(?:"([^"]*(?:""[^"]*)*)"|([^,]*)))?/);
                if (match) {
                    const name = (match[1] || match[2] || '').replace(/""/g, '"').trim();
                    const category = (match[3] || match[4] || '').trim().toLowerCase();
                    const price = parseFloat(match[5] || match[6] || '0') || 0;
                    if (name) {
                        newItems.push({ name, category, price });
                    }
                }
            }
            if (newItems.length > 0) {
                const mode = window.confirm(
                    `Found ${newItems.length} items.\n\nOK = Merge with existing catalog\nCancel = Replace entire catalog`
                );
                if (mode) {
                    // Merge: add only new items (by name)
                    setCatalog(prev => {
                        const existingNames = new Set(prev.map(i => i.name.toLowerCase()));
                        const unique = newItems.filter(i => !existingNames.has(i.name.toLowerCase()));
                        return [...prev, ...unique];
                    });
                    alert(`Added ${newItems.length} item(s), duplicates skipped.`);
                } else {
                    setCatalog(newItems);
                    alert(`Catalog replaced with ${newItems.length} item(s).`);
                }
            } else {
                alert('No valid items found in the CSV file.');
            }
        };
        reader.readAsText(file);
    };

    return (
        <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Item Database</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {catalog.length} items total • {filteredItems.length} shown
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={exportCSV}
                        className="bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 flex items-center gap-2 shadow-sm transition-colors text-sm"
                    >
                        <Download size={18} /> Export CSV
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 flex items-center gap-2 shadow-sm transition-colors text-sm"
                    >
                        <FileUp size={18} /> Import CSV
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) importCSV(file);
                            e.target.value = '';
                        }}
                    />
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="bg-blue-700 text-white px-5 py-2.5 rounded-lg hover:bg-blue-800 flex items-center gap-2 shadow-sm transition-colors"
                    >
                        <Plus size={18} /> Add Item
                    </button>
                </div>
            </div>

            {/* Search + Category filter */}
            <div className="bg-white rounded-xl shadow-sm border p-4 mb-5 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search items by name or category..."
                        className="w-full border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="border rounded-lg px-4 py-2.5 text-sm bg-white min-w-[160px]"
                >
                    {availableCategories.map(cat => (
                        <option key={cat} value={cat}>
                            {cat === 'all' ? '📂 All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </option>
                    ))}
                </select>
            </div>

            {/* Add item form (inline, collapsible) */}
            {showAddForm && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5 animate-in fade-in slide-in-from-top-2">
                    <h4 className="font-semibold text-blue-900 mb-3">Add New Item</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <input
                            placeholder="Item Name *"
                            value={addForm.name}
                            onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                            className="border rounded-lg px-3 py-2.5 text-sm col-span-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <select
                            value={addForm.category}
                            onChange={e => setAddForm({ ...addForm, category: e.target.value })}
                            className="border rounded-lg px-3 py-2.5 text-sm bg-white"
                        >
                            {CATEGORIES.filter(c => c !== 'all').map(cat => (
                                <option key={cat} value={cat}>
                                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <input
                                placeholder="Price (RM)"
                                type="number"
                                step="0.01"
                                value={addForm.price}
                                onChange={e => setAddForm({ ...addForm, price: e.target.value })}
                                className="border rounded-lg px-3 py-2.5 text-sm flex-1 focus:ring-2 focus:ring-blue-500 outline-none"
                                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            />
                            <button
                                onClick={handleAdd}
                                className="bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700 transition-colors"
                                title="Add Item"
                            >
                                <Check size={18} />
                            </button>
                            <button
                                onClick={() => { setShowAddForm(false); setAddForm({ name: '', category: 'hardware', price: '' }); }}
                                className="border rounded-lg px-3 hover:bg-gray-100 transition-colors"
                                title="Cancel"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Items Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b">
                                <th className="text-left px-4 py-3 font-semibold text-gray-700 w-12">#</th>
                                <th
                                    className="text-left px-4 py-3 font-semibold text-gray-700 cursor-pointer hover:text-blue-600 select-none"
                                    onClick={() => toggleSort('name')}
                                >
                                    Item Name {sortIcon('name')}
                                </th>
                                <th
                                    className="text-left px-4 py-3 font-semibold text-gray-700 cursor-pointer hover:text-blue-600 select-none w-40"
                                    onClick={() => toggleSort('category')}
                                >
                                    Category {sortIcon('category')}
                                </th>
                                <th
                                    className="text-right px-4 py-3 font-semibold text-gray-700 cursor-pointer hover:text-blue-600 select-none w-32"
                                    onClick={() => toggleSort('price')}
                                >
                                    Price (RM) {sortIcon('price')}
                                </th>
                                <th className="text-center px-4 py-3 font-semibold text-gray-700 w-28">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                                        <Package size={48} className="mx-auto mb-3 text-gray-300" />
                                        <p className="text-lg font-medium">No items found</p>
                                        <p className="text-sm mt-1">Try adjusting your search or add a new item.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map((item, idx) => (
                                    <tr
                                        key={`${item.name}-${idx}`}
                                        className={`border-b last:border-b-0 hover:bg-gray-50 transition-colors ${editingId === idx ? 'bg-yellow-50' : ''}`}
                                    >
                                        <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>

                                        {editingId === idx ? (
                                            <>
                                                <td className="px-4 py-2">
                                                    <input
                                                        value={editForm.name}
                                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                        className="w-full border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        autoFocus
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') saveEdit(idx);
                                                            if (e.key === 'Escape') cancelEdit();
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-4 py-2">
                                                    <select
                                                        value={editForm.category}
                                                        onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                                                        className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                                                    >
                                                        {availableCategories.filter(c => c !== 'all').map(cat => (
                                                            <option key={cat} value={cat}>
                                                                {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={editForm.price}
                                                        onChange={e => setEditForm({ ...editForm, price: e.target.value })}
                                                        className="w-full border rounded px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') saveEdit(idx);
                                                            if (e.key === 'Escape') cancelEdit();
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    <div className="flex justify-center gap-1">
                                                        <button
                                                            onClick={() => saveEdit(idx)}
                                                            className="text-green-600 hover:bg-green-50 p-1.5 rounded transition-colors"
                                                            title="Save"
                                                        >
                                                            <Check size={16} />
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="text-gray-500 hover:bg-gray-100 p-1.5 rounded transition-colors"
                                                            title="Cancel"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-2.5 font-medium text-gray-800">{item.name}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full capitalize">
                                                        {item.category || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                                                    {item.price != null ? `RM ${parseFloat(item.price).toFixed(2)}` : '—'}
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <div className="flex justify-center gap-1">
                                                        <button
                                                            onClick={() => startEdit(item, idx)}
                                                            className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={15} />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteItem(idx)}
                                                            className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer summary */}
                {filteredItems.length > 0 && (
                    <div className="bg-gray-50 border-t px-4 py-3 flex justify-between items-center text-sm text-gray-600">
                        <span>Showing {filteredItems.length} of {catalog.length} items</span>
                        <span className="font-medium">
                            Avg price: RM {(filteredItems.reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0) / filteredItems.length).toFixed(2)}
                        </span>
                    </div>
                )}
            </div>
        </>
    );
};

export default ItemDatabase;

import React, { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, Edit2, Check, X, Search, Download, FileUp, Package, Save } from 'lucide-react';

const CATEGORIES = [
    'all', 'hardware', 'electrical', 'lighting', 'paint',
    'wainscotting', 'fastener', 'plumbing', 'tools', 'other'
];

const EMPTY_FORM = { name: '', category: 'hardware', price: '', unit: 'pcs', brand: '', code: '', size: '', colour: '', aliases: '', coverage: '', packSize: '' };

/** Split a comma-separated alias string into a clean array of lowercase tokens. */
const parseAliases = (raw) => (raw || '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean)
    .map(a => a.toLowerCase());

/** Build a catalog item object from a form (keeps unknown fields untouched). */
const buildItem = (form, base = {}) => ({
    ...base,
    name: (form.name || '').trim(),
    category: (form.category || '').trim().toLowerCase(),
    price: parseFloat(form.price) || 0,
    unit: (form.unit || 'pcs').trim().toLowerCase() || 'pcs',
    brand: (form.brand || '').trim(),
    code: (form.code || '').trim(),
    size: (form.size || '').trim(),
    colour: (form.colour || '').trim(),
    aliases: parseAliases(form.aliases),
    coverage: parseFloat(form.coverage) || null,
    packSize: parseFloat(form.packSize) || null,
});

const ItemDatabase = ({ catalog, setCatalog }) => {
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState(EMPTY_FORM);
    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState(EMPTY_FORM);
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

        // Search across all useful fields
        if (search.trim()) {
            const q = search.toLowerCase();
            items = items.filter(item =>
                item.name.toLowerCase().includes(q) ||
                (item.category || '').toLowerCase().includes(q) ||
                (item.brand || '').toLowerCase().includes(q) ||
                (item.code || '').toLowerCase().includes(q) ||
                (item.aliases || []).some(a => a.includes(q))
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
                valA = (a[sortField] || '').toString().toLowerCase();
                valB = (b[sortField] || '').toString().toLowerCase();
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return items;
    }, [catalog, search, categoryFilter, sortField, sortDir]);

    const toggleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const sortIcon = (field) => {
        if (sortField !== field) return '↕';
        return sortDir === 'asc' ? '↑' : '↓';
    };

    // --- CRUD ---
    const handleAdd = () => {
        if (!addForm.name.trim()) return;
        setCatalog(prev => [...prev, buildItem(addForm)]);
        setAddForm(EMPTY_FORM);
        setShowAddForm(false);
    };

    const startEdit = (item) => {
        setEditingId(item);
        setEditForm({
            name: item.name || '',
            category: item.category || '',
            price: item.price ?? '',
            unit: item.unit || 'pcs',
            brand: item.brand || '',
            code: item.code || '',
            size: item.size || '',
            colour: item.colour || '',
            aliases: (item.aliases || []).join(', '),
            coverage: item.coverage ?? '',
            packSize: item.packSize ?? '',
        });
    };

    const saveEdit = (item) => {
        if (!editForm.name.trim()) return;
        setCatalog(prev => prev.map(i => (i === item ? buildItem(editForm, item) : i)));
        setEditingId(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm(EMPTY_FORM);
    };

    const deleteItem = (item) => {
        if (!window.confirm(`Delete "${item.name}"?`)) return;
        setCatalog(prev => prev.filter(i => i !== item));
    };

    // --- CSV Export (richer columns; 3-col legacy import still works) ---
    const exportCSV = () => {
        const rows = [['Name', 'Category', 'Price', 'Unit', 'Brand', 'Code', 'Aliases', 'Coverage', 'Pack size']];
        catalog.forEach(item => {
            rows.push([
                `"${(item.name || '').replace(/"/g, '""')}"`,
                item.category || '',
                item.price ?? '',
                item.unit || 'pcs',
                `"${(item.brand || '').replace(/"/g, '""')}"`,
                `"${(item.code || '').replace(/"/g, '""')}"`,
                `"${(item.aliases || []).join(', ').replace(/"/g, '""')}"`,
                item.coverage ?? '',
                item.packSize ?? '',
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

    // --- CSV import (3-col AND 7-col headers understood) ---
    const importCSV = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            const cols = (lines[0] || '').toLowerCase().split(',');
            const hasRichHeader = cols.includes('unit') || cols.includes('brand') || cols.includes('aliases');
            const startIdx = cols.includes('name') ? 1 : 0;            const newItems = [];
            for (let i = startIdx; i < lines.length; i++) {
                // Robust-ish CSV parse: split on commas not inside quotes
                const parts = [];
                let cur = '';
                let inQ = false;
                for (const ch of lines[i]) {
                    if (ch === '"') inQ = !inQ;
                    else if (ch === ',' && !inQ) { parts.push(cur); cur = ''; }
                    else cur += ch;
                }
                parts.push(cur);
                const clean = parts.map(p => p.trim().replace(/^"+|"+$/g, ''));
                const name = clean[0];
                if (!name) continue;
                const item = { name, category: clean[1] || '', price: parseFloat(clean[2]) || 0 };
                if (hasRichHeader) {
                    item.unit = clean[3] || 'pcs';
                    item.brand = clean[4] || '';
                    item.code = clean[5] || '';
                    item.aliases = parseAliases(clean[6]);
                    if (cols.includes('coverage')) item.coverage = parseFloat(clean[7]) || null;
                    if (cols.includes('pack size') || cols.includes('packsize')) item.packSize = parseFloat(clean[8]) || null;
                }
                newItems.push(item);
            }
            if (newItems.length > 0) {
                const mode = window.confirm(
                    `Found ${newItems.length} items.\n\nOK = Merge with existing catalog (by name)\nCancel = Replace entire catalog`
                );
                if (mode) {
                    setCatalog(prev => {
                        const done = [...prev];
                        const byName = new Map(done.map(i => [i.name.toLowerCase(), i]));
                        newItems.forEach(i => {
                            const existing = byName.get(i.name.toLowerCase());
                            if (existing) byName.set(i.name.toLowerCase(), { ...existing, ...i });
                            else { done.push(i); byName.set(i.name.toLowerCase(), i); }
                        });
                        return done;
                    });
                    alert(`Merged ${newItems.length} row(s) into the catalog by name.`);
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

    const renderEditorRow = (form, setForm, onSave, onCancel, saveLabel) => (
        <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[['name', 'Item Name *'], ['brand', 'Brand'], ['code', 'Code'], ['category', 'Category'], ['size', 'Size'], ['colour', 'Colour'], ['price', 'Price (RM)'], ['unit', 'Unit'], ['coverage', 'Coverage (m²/unit)'], ['packSize', 'Pack size']].map(([f, label]) => (
                    <label key={f} className="block text-xs font-semibold text-gray-500 uppercase">
                        {label}
                        {f === 'category' ? (
                            <select
                                value={form.category}
                                onChange={e => setForm({ ...form, category: e.target.value })}
                                className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-white normal-case font-normal focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                {CATEGORIES.filter(c => c !== 'all').map(cat => (
                                    <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                                ))}
                                {availableCategories.filter(c => c !== 'all' && !CATEGORIES.includes(c)).map(cat => (
                                    <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                                ))}
                            </select>
                        ) : f === 'unit' ? (
                            <input
                                type="text"
                                value={form[f]}
                                onChange={e => setForm({ ...form, [f]: e.target.value })}
                                placeholder="pcs | m | L | bag"
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm normal-case font-normal focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        ) : f === 'price' || f === 'coverage' || f === 'packSize' ? (
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={form[f]}
                                onChange={e => setForm({ ...form, [f]: e.target.value })}
                                placeholder={f === 'coverage' ? '0' : '1'}
                                title={f === 'coverage'
                                    ? 'm² covered per unit sold — feeds coverage-shortage math in the BOM pre-flight'
                                    : 'Supplier pack size in this unit (e.g. 1000 for a box sold per pc) — feeds pack quantization'}
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm normal-case font-normal focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        ) : (
                            <input
                                value={form[f]}
                                onChange={e => setForm({ ...form, [f]: e.target.value })}
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm normal-case font-normal focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        )}
                    </label>
                ))}
            </div>
            <label className="block text-xs font-semibold text-gray-500 uppercase">
                Aliases / Synonyms (comma-separated — used by search & smart matching)
                <input
                    value={form.aliases}
                    onChange={e => setForm({ ...form, aliases: e.target.value })}
                    placeholder="e.g. papan gypsum, drywall board"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm normal-case font-normal focus:ring-2 focus:ring-blue-500 outline-none"
                />
            </label>
            <div className="flex gap-2 justify-end">
                <button onClick={onCancel} className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-gray-600 text-sm">Cancel</button>
                <button onClick={onSave} className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 text-sm font-semibold flex items-center gap-1.5">
                    <Save size={15} /> {saveLabel}
                </button>
            </div>
        </div>
    );

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
                    <button onClick={exportCSV} className="bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 flex items-center gap-2 shadow-sm transition-colors text-sm">
                        <Download size={18} /> Export CSV
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 flex items-center gap-2 shadow-sm transition-colors text-sm">
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
                    <button onClick={() => { setShowAddForm(true); setEditingId(null); }} className="bg-blue-700 text-white px-5 py-2.5 rounded-lg hover:bg-blue-800 flex items-center gap-2 shadow-sm transition-colors">
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
                        placeholder="Search name, brand, code, alias..."
                        className="w-full border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border rounded-lg px-4 py-2.5 text-sm bg-white min-w-[160px]">
                    {availableCategories.map(cat => (
                        <option key={cat} value={cat}>{cat === 'all' ? '📂 All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                    ))}
                </select>
            </div>

            {/* Add item form (inline, collapsible) */}
            {showAddForm && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5 animate-in fade-in slide-in-from-top-2">
                    <h4 className="font-semibold text-blue-900 mb-3 flex items-center justify-between">
                        Add New Item
                        <button onClick={() => { setShowAddForm(false); setAddForm(EMPTY_FORM); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                    </h4>
                    {renderEditorRow(addForm, setAddForm, handleAdd, () => { setShowAddForm(false); setAddForm(EMPTY_FORM); }, 'Add Item')}
                </div>
            )}

            {/* Items Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b">
                                <th className="text-left px-4 py-3 font-semibold text-gray-700 w-10">#</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700 cursor-pointer hover:text-blue-600 select-none w-10" onClick={() => toggleSort('unit')}>
                                    U {sortIcon('unit')}
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700 cursor-pointer hover:text-blue-600 select-none" onClick={() => toggleSort('name')}>
                                    Item Name {sortIcon('name')}
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700 cursor-pointer hover:text-blue-600 select-none w-36" onClick={() => toggleSort('category')}>
                                    Category {sortIcon('category')}
                                </th>
                                <th className="text-right px-4 py-3 font-semibold text-gray-700 cursor-pointer hover:text-blue-600 select-none w-28" onClick={() => toggleSort('price')}>
                                    Price (RM) {sortIcon('price')}
                                </th>
                                <th className="text-center px-4 py-3 font-semibold text-gray-700 w-28">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                                        <Package size={48} className="mx-auto mb-3 text-gray-300" />
                                        <p className="text-lg font-medium">No items found</p>
                                        <p className="text-sm mt-1">Try adjusting your search or add a new item.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map((item, idx) => (
                                    editingId === item ? (
                                        <tr key={`${item.name}-${idx}`} className="bg-yellow-50">
                                            <td colSpan={6} className="px-4 py-4">
                                                {renderEditorRow(editForm, setEditForm, () => saveEdit(item), cancelEdit, 'Save Changes')}
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={`${item.name}-${idx}`} className="border-b last:border-b-0 hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                                            <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{item.unit || 'pcs'}</td>
                                            <td className="px-4 py-2.5">
                                                                                                <p className="font-medium text-gray-800">{item.name}</p>
                                                {(item.brand || item.code || item.size || item.colour || item.coverage || item.packSize || (item.aliases?.length)) ? (
                                                    <p className="text-[11px] text-gray-400">
                                                        {[item.brand, item.code, item.size ? `sz ${item.size}` : '', item.colour]
                                                            .filter(Boolean).join(' · ')}
                                                        {item.coverage ? ` · cov ${item.coverage} m²/unit` : ''}
                                                        {item.packSize ? ` · pack ${item.packSize}` : ''}
                                                        {item.aliases?.length ? ` · alias: ${item.aliases.join(', ')}` : ''}
                                                    </p>
                                                ) : null}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full capitalize">{item.category || '—'}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono text-gray-700">{item.price != null ? `RM ${parseFloat(item.price).toFixed(2)}` : '—'}</td>
                                            <td className="px-4 py-2.5 text-center">
                                                <div className="flex justify-center gap-1">
                                                    <button onClick={() => startEdit(item)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors" title="Edit">
                                                        <Edit2 size={15} />
                                                    </button>
                                                    <button onClick={() => deleteItem(item)} className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors" title="Delete">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer summary */}
                {filteredItems.length > 0 && (
                    <div className="bg-gray-50 border-t px-4 py-3 flex justify-between items-center text-sm text-gray-600">
                        <span>Showing {filteredItems.length} of {catalog.length} items</span>
                        <span className="font-medium">Avg price: RM {(filteredItems.reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0) / filteredItems.length).toFixed(2)}</span>
                    </div>
                )}
            </div>
        </>
    );
};

export default ItemDatabase;
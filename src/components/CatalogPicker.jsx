/**
 * CatalogPicker — "Add from Catalog" modal body.
 *
 * Renders the standard catalog as a searchable, filterable grid of cards with
 * +/- quantity steppers. One click adds the selected item(s) to the current
 * project BOM through the `onAdd` callback, keeping the same material shape
 * the rest of the app expects (category, item, quantity, unit, price).
 */
import React, { useState, useMemo } from 'react';
import { Plus, Minus, ShoppingCart, Search } from 'lucide-react';
import { generateId } from '../utils/helpers';
import { formatCurrency } from '../utils/pdfParser';

const FRIENDLY_CATEGORIES = {
    electrical: 'Electrical',
    hardware: 'Hardware',
    fastener: 'Hardware',
    tools: 'Hardware',
    paint: 'Paint',
    lighting: 'Lighting',
    'led strip': 'Lighting',
    'pvc panel': 'Wood',
    wainscotting: 'Wood',
    fluted: 'Wood',
    other: 'Other',
};

const CATEGORY_ORDER = ['Electrical', 'Hardware', 'Paint', 'Lighting', 'Wood', 'Other'];

const CatalogPicker = ({ catalog, onAdd, onClose }) => {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [quantities, setQuantities] = useState({});

    const categories = useMemo(() => {
        const set = new Set(['All']);
        (catalog || []).forEach(item => {
            const friendly = FRIENDLY_CATEGORIES[(item.category || '').toLowerCase()] || 'Other';
            set.add(friendly);
        });
        return [...set].sort((a, b) => {
            const ia = CATEGORY_ORDER.indexOf(a);
            const ib = CATEGORY_ORDER.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return a.localeCompare(b);
        });
    }, [catalog]);

    const filteredItems = useMemo(() => {
        let items = catalog || [];
        if (search.trim()) {
            const q = search.toLowerCase();
            items = items.filter(item =>
                item.name.toLowerCase().includes(q) ||
                (item.category || '').toLowerCase().includes(q)
            );
        }
        if (category !== 'All') {
            items = items.filter(item =>
                (FRIENDLY_CATEGORIES[(item.category || '').toLowerCase()] || 'Other') === category
            );
        }
        return items.slice(0, 200);
    }, [catalog, search, category]);

    const changeQty = (name, delta) => {
        setQuantities(prev => ({
            ...prev,
            [name]: Math.max(1, (prev[name] || 1) + delta),
        }));
    };

    const addItem = (item, qty) => {
        onAdd({
            id: generateId(),
            category: item.category || 'Other',
            item: item.name,
            quantity: qty,
            unit: 'pcs',
            pricePerUnit: Number(item.price) || 0,
            price: qty * (Number(item.price) || 0),
            total: qty * (Number(item.price) || 0),
            fromCatalog: true,
        });
    };

    const addAllSelected = () => {
        filteredItems.forEach(item => {
            const qty = quantities[item.name] || 1;
            addItem(item, qty);
        });
    };

    const selectedCount = Object.values(quantities).filter(q => q > 0).length;

    return (
        <div className="space-y-4">
            {/* Header actions */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search catalog items..."
                        className="w-full border rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        autoFocus
                    />
                </div>
                <button
                    onClick={addAllSelected}
                    disabled={filteredItems.length === 0}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2 text-sm font-semibold"
                >
                    <ShoppingCart size={16} />
                    Add All ({filteredItems.length})
                </button>
            </div>

            {/* Category filter chips */}
            <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                            category === cat
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Grid of cards */}
            {filteredItems.length === 0 ? (
                <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                    <p className="font-medium">No catalog items match</p>
                </div>
            ) : (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-h-[50vh] overflow-y-auto pr-1">
                    {filteredItems.map(item => {
                        const qty = quantities[item.name] || 1;
                        const price = Number(item.price) || 0;
                        return (
                            <div key={item.name} className="border border-gray-200 rounded-xl p-3 flex flex-col gap-2 hover:shadow-sm transition-shadow bg-white">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium text-gray-800 leading-snug flex-1">{item.name}</p>
                                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded whitespace-nowrap">
                                        {price ? formatCurrency(price) : '—'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-auto pt-1">
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => changeQty(item.name, -1)}
                                            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                                            aria-label="Decrease quantity"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <span className="w-10 text-center font-mono text-sm font-semibold">{qty}</span>
                                        <button
                                            onClick={() => changeQty(item.name, 1)}
                                            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                                            aria-label="Increase quantity"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => addItem(item, qty)}
                                        className="bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 text-xs font-bold flex items-center gap-1"
                                    >
                                        <Plus size={13} /> Add
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {selectedCount > 0 && (
                <p className="text-xs text-gray-500">{selectedCount} item(s) set to quantity &gt; 1.</p>
            )}

            <div className="flex justify-end pt-2 border-t">
                <button
                    onClick={onClose}
                    className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                    Close
                </button>
            </div>
        </div>
    );
};

export default CatalogPicker;

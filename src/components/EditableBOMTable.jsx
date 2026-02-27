import React, { useState, useMemo } from 'react';
import { Trash2, Edit2, Save, X, Plus, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { formatCurrency } from '../utils/pdfParser';
import { generateId } from '../utils/helpers';
import { AutocompleteItemInput } from './AutocompleteItemInput';

const EditableBOMTable = ({ materials, onUpdate, onRemove, onAdd, showPrices = true, defaultCategory = '' }) => {
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [addingNew, setAddingNew] = useState(false);
    const [collapsedCategories, setCollapsedCategories] = useState({});
    const [newItemForm, setNewItemForm] = useState({
        category: defaultCategory,
        item: '',
        quantity: '',
        unit: '',
        price: '',
        pricePerUnit: ''
    });

    const startEdit = (material) => {
        setEditingId(material.id);
        setEditForm({ ...material });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const saveEdit = () => {
        onUpdate(editingId, editForm);
        setEditingId(null);
        setEditForm({});
    };

    const handleAddNew = () => {
        if (!newItemForm.item.trim()) return;

        const newMaterial = {
            ...newItemForm,
            id: generateId(),
            quantity: parseFloat(newItemForm.quantity) || 0,
            price: parseFloat(newItemForm.price) || null,
            pricePerUnit: parseFloat(newItemForm.pricePerUnit) || null
        };

        onAdd(newMaterial);
        setNewItemForm({
            category: newItemForm.category || defaultCategory,
            item: '',
            quantity: '',
            unit: '',
            price: '',
            pricePerUnit: ''
        });
        setAddingNew(false);
    };

    const groupedMaterials = useMemo(() => {
        return materials.reduce((groups, material) => {
            const cat = material.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(material);
            return groups;
        }, {});
    }, [materials]);

    const categories = useMemo(() => Object.keys(groupedMaterials).sort(), [groupedMaterials]);

    const toggleCategory = (cat) => {
        setCollapsedCategories(prev => ({
            ...prev,
            [cat]: !prev[cat]
        }));
    };

    if (materials.length === 0 && !addingNew) {
        return (
            <div className="text-center py-8">
                <p className="text-gray-400 mb-4">No materials in this project</p>
                <button
                    onClick={() => setAddingNew(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
                >
                    <Plus size={18} /> Add Material
                </button>
            </div>
        );
    }

    const totalPrice = materials.reduce((sum, m) => sum + (m.price || 0), 0);
    const itemsWithPrice = materials.filter(m => m.price).length;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                    {materials.length} item(s) • {itemsWithPrice} with prices
                </div>
                {!addingNew && (
                    <button
                        onClick={() => setAddingNew(true)}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                    >
                        <Plus size={16} /> Add Item
                    </button>
                )}
            </div>

            <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium w-32">Category</th>
                            <th className="px-3 py-2 text-left font-medium">Item</th>
                            <th className="px-3 py-2 text-right font-medium w-20">Qty</th>
                            <th className="px-3 py-2 text-left font-medium w-20">Unit</th>
                            {showPrices && (
                                <>
                                    <th className="px-3 py-2 text-right font-medium w-24">Price/Unit</th>
                                    <th className="px-3 py-2 text-right font-medium w-24">Total</th>
                                </>
                            )}
                            <th className="px-3 py-2 w-20">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {addingNew && (
                            <tr className="border-t bg-blue-50">
                                <td className="px-3 py-2">
                                    <input
                                        value={newItemForm.category}
                                        onChange={e => setNewItemForm({ ...newItemForm, category: e.target.value })}
                                        placeholder="Category"
                                        className="w-full border rounded px-2 py-1 text-sm text-blue-800 font-medium"
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    <AutocompleteItemInput
                                        value={newItemForm.item}
                                        onChange={val => setNewItemForm({ ...newItemForm, item: val })}
                                        onSelect={item => {
                                            const newQty = parseFloat(newItemForm.quantity) || 0;
                                            setNewItemForm({
                                                ...newItemForm,
                                                item: item.name,
                                                category: item.category,
                                                pricePerUnit: item.price,
                                                price: newQty && item.price ? (newQty * item.price).toFixed(2) : ''
                                            });
                                        }}
                                        placeholder="Item name *"
                                        autoFocus
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    <input
                                        type="number"
                                        value={newItemForm.quantity}
                                        onChange={e => {
                                            const qty = e.target.value;
                                            const pricePerUnit = parseFloat(newItemForm.pricePerUnit) || 0;
                                            const calculatedPrice = qty && pricePerUnit ? (parseFloat(qty) * pricePerUnit).toFixed(2) : '';
                                            setNewItemForm({ ...newItemForm, quantity: qty, price: calculatedPrice });
                                        }}
                                        placeholder="0"
                                        className="w-full border rounded px-2 py-1 text-sm text-right font-mono"
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    <input
                                        value={newItemForm.unit}
                                        onChange={e => setNewItemForm({ ...newItemForm, unit: e.target.value })}
                                        placeholder="pcs"
                                        className="w-full border rounded px-2 py-1 text-sm"
                                    />
                                </td>
                                {showPrices && (
                                    <>
                                        <td className="px-3 py-2">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={newItemForm.pricePerUnit}
                                                onChange={e => {
                                                    const pricePerUnit = e.target.value;
                                                    const qty = parseFloat(newItemForm.quantity) || 0;
                                                    const calculatedPrice = pricePerUnit && qty ? (parseFloat(pricePerUnit) * qty).toFixed(2) : '';
                                                    setNewItemForm({ ...newItemForm, pricePerUnit, price: calculatedPrice });
                                                }}
                                                placeholder="0.00"
                                                className="w-full border rounded px-2 py-1 text-sm text-right font-mono"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={newItemForm.price}
                                                onChange={e => setNewItemForm({ ...newItemForm, price: e.target.value })}
                                                placeholder="0.00"
                                                className="w-full border rounded px-2 py-1 text-sm text-right bg-white font-mono"
                                            />
                                        </td>
                                    </>
                                )}
                                <td className="px-3 py-2">
                                    <div className="flex gap-1 justify-center">
                                        <button
                                            onClick={handleAddNew}
                                            className="bg-green-600 text-white p-1 rounded hover:bg-green-700 transition-colors"
                                            title="Save"
                                        >
                                            <Save size={16} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setAddingNew(false);
                                                setNewItemForm({
                                                    category: defaultCategory,
                                                    item: '',
                                                    quantity: '',
                                                    unit: '',
                                                    price: '',
                                                    pricePerUnit: ''
                                                });
                                            }}
                                            className="bg-gray-200 text-gray-600 p-1 rounded hover:bg-gray-300 transition-colors"
                                            title="Cancel"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}

                        {categories.map(category => (
                            <React.Fragment key={category}>
                                {/* Category Header */}
                                <tr className="bg-gray-50/80 border-t">
                                    <td colSpan={showPrices ? 7 : 5} className="px-3 py-1.5 cursor-pointer hover:bg-gray-100" onClick={() => toggleCategory(category)}>
                                        <div className="flex items-center gap-2">
                                            {collapsedCategories[category] ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                                            <span className="font-bold text-gray-700 uppercase tracking-tight text-[11px]">{category}</span>
                                            <span className="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-200/50 rounded-full font-medium">
                                                {groupedMaterials[category].length} items
                                            </span>
                                        </div>
                                    </td>
                                </tr>

                                {/* Material Rows for Category */}
                                {!collapsedCategories[category] && groupedMaterials[category].map((m, i) => (
                                    <tr key={m.id || i} className="border-t hover:bg-blue-50/30 group">
                                        {editingId === m.id ? (
                                            // Edit mode
                                            <>
                                                <td className="px-3 py-2">
                                                    <input
                                                        value={editForm.category}
                                                        onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                                                        className="w-full border rounded px-2 py-1 text-sm font-medium"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <AutocompleteItemInput
                                                        value={editForm.item}
                                                        onChange={val => setEditForm({ ...editForm, item: val })}
                                                        onSelect={item => {
                                                            const eqty = parseFloat(editForm.quantity) || 0;
                                                            setEditForm({
                                                                ...editForm,
                                                                item: item.name,
                                                                category: item.category,
                                                                pricePerUnit: item.price,
                                                                price: eqty && item.price ? eqty * item.price : null
                                                            });
                                                        }}
                                                        placeholder="Item name"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        value={editForm.quantity}
                                                        onChange={e => {
                                                            const qty = e.target.value;
                                                            const pricePerUnit = parseFloat(editForm.pricePerUnit) || 0;
                                                            const calculatedPrice = qty && pricePerUnit ? parseFloat(qty) * pricePerUnit : null;
                                                            setEditForm({ ...editForm, quantity: qty, price: calculatedPrice });
                                                        }}
                                                        className="w-full border rounded px-2 py-1 text-sm text-right font-mono"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        value={editForm.unit}
                                                        onChange={e => setEditForm({ ...editForm, unit: e.target.value })}
                                                        className="w-full border rounded px-2 py-1 text-sm"
                                                    />
                                                </td>
                                                {showPrices && (
                                                    <>
                                                        <td className="px-3 py-2">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={editForm.pricePerUnit || ''}
                                                                onChange={e => {
                                                                    const pricePerUnit = parseFloat(e.target.value) || null;
                                                                    const qty = parseFloat(editForm.quantity) || 0;
                                                                    const calculatedPrice = pricePerUnit && qty ? pricePerUnit * qty : null;
                                                                    setEditForm({ ...editForm, pricePerUnit, price: calculatedPrice });
                                                                }}
                                                                className="w-full border rounded px-2 py-1 text-sm text-right font-mono"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={editForm.price || ''}
                                                                onChange={e => setEditForm({ ...editForm, price: parseFloat(e.target.value) || null })}
                                                                className="w-full border rounded px-2 py-1 text-sm text-right bg-white font-mono"
                                                            />
                                                        </td>
                                                    </>
                                                )}
                                                <td className="px-3 py-2">
                                                    <div className="flex gap-1 justify-center">
                                                        <button
                                                            onClick={saveEdit}
                                                            className="text-green-600 hover:text-green-800 p-1"
                                                            title="Save"
                                                        >
                                                            <Save size={16} />
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="text-gray-400 hover:text-gray-600 p-1"
                                                            title="Cancel"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </>
                                        ) : (
                                            // View mode
                                            <>
                                                <td className="px-3 py-2 text-[10px] text-gray-400 font-medium uppercase">{m.category}</td>
                                                <td className="px-3 py-2 font-medium text-gray-700">
                                                    <div>{m.item}</div>
                                                    {m.standardItem && m.item !== m.standardItem && (
                                                        <div
                                                            className="text-[10px] text-blue-600 mt-0.5 flex items-center gap-1 bg-blue-50 w-fit px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-100 transition-colors"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onUpdate(m.id, {
                                                                    ...m,
                                                                    item: m.standardItem,
                                                                    pricePerUnit: m.standardPrice,
                                                                    price: m.quantity && m.standardPrice ? m.quantity * m.standardPrice : null,
                                                                    category: m.standardCategory
                                                                });
                                                            }}
                                                            title="Click to apply standard item mapping"
                                                        >
                                                            <Check size={10} /> Match: {m.standardItem}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-gray-900">{m.quantity}</td>
                                                <td className="px-3 py-2 text-gray-500">{m.unit}</td>
                                                {showPrices && (
                                                    <>
                                                        <td className="px-3 py-2 text-right font-mono text-gray-600 text-[11px]">
                                                            {m.pricePerUnit ? formatCurrency(m.pricePerUnit) : '—'}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">
                                                            {m.price ? formatCurrency(m.price) : '—'}
                                                        </td>
                                                    </>
                                                )}
                                                <td className="px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <div className="flex gap-1 justify-center">
                                                        <button
                                                            onClick={() => startEdit(m)}
                                                            className="text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm('Delete this item?')) {
                                                                    onRemove(m.id);
                                                                }
                                                            }}
                                                            className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                    {showPrices && totalPrice > 0 && (
                        <tfoot className="bg-gray-100 border-t-2">
                            <tr>
                                <td colSpan={showPrices ? 5 : 3} className="px-3 py-3 text-right font-bold text-gray-700">
                                    Grand Total ({itemsWithPrice}/{materials.length} items with prices):
                                </td>
                                <td className="px-3 py-3 text-right font-mono font-black text-blue-600 text-lg">
                                    {formatCurrency(totalPrice)}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {showPrices && itemsWithPrice < materials.length && (
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-2">
                    <span className="flex-shrink-0 w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                    <span>{materials.length - itemsWithPrice} item(s) are missing price information. Update them to see a complete total.</span>
                </div>
            )}
        </div>
    );
};

export default EditableBOMTable;

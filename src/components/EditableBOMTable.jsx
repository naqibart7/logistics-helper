import React, { useState } from 'react';
import { Trash2, Edit2, Save, X, Plus } from 'lucide-react';
import { formatCurrency } from '../utils/pdfParser';
import { generateId } from '../utils/helpers';

const EditableBOMTable = ({ materials, onUpdate, onRemove, onAdd, showPrices = true, defaultCategory = '' }) => {
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [addingNew, setAddingNew] = useState(false);
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
            category: defaultCategory,
            item: '',
            quantity: '',
            unit: '',
            price: '',
            pricePerUnit: ''
        });
        setAddingNew(false);
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
                            <th className="px-3 py-2 text-left font-medium">Category</th>
                            <th className="px-3 py-2 text-left font-medium">Item</th>
                            <th className="px-3 py-2 text-right font-medium">Qty</th>
                            <th className="px-3 py-2 text-left font-medium">Unit</th>
                            {showPrices && (
                                <>
                                    <th className="px-3 py-2 text-right font-medium">Price/Unit</th>
                                    <th className="px-3 py-2 text-right font-medium">Total</th>
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
                                        className="w-full border rounded px-2 py-1 text-sm"
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    <input
                                        value={newItemForm.item}
                                        onChange={e => setNewItemForm({ ...newItemForm, item: e.target.value })}
                                        placeholder="Item name *"
                                        className="w-full border rounded px-2 py-1 text-sm"
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
                                        placeholder="Qty"
                                        className="w-full border rounded px-2 py-1 text-sm text-right"
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    <input
                                        value={newItemForm.unit}
                                        onChange={e => setNewItemForm({ ...newItemForm, unit: e.target.value })}
                                        placeholder="Unit"
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
                                                className="w-full border rounded px-2 py-1 text-sm text-right"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={newItemForm.price}
                                                onChange={e => setNewItemForm({ ...newItemForm, price: e.target.value })}
                                                placeholder="0.00"
                                                className="w-full border rounded px-2 py-1 text-sm text-right bg-gray-50"
                                                title="Auto-calculated from Qty × Price/Unit"
                                            />
                                        </td>
                                    </>
                                )}
                                <td className="px-3 py-2">
                                    <div className="flex gap-1">
                                        <button
                                            onClick={handleAddNew}
                                            className="text-green-600 hover:text-green-800 p-1"
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
                                            className="text-gray-600 hover:text-gray-800 p-1"
                                            title="Cancel"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}
                        {materials.map((m, i) => (
                            <tr key={m.id || i} className="border-t hover:bg-gray-50">
                                {editingId === m.id ? (
                                    // Edit mode
                                    <>
                                        <td className="px-3 py-2">
                                            <input
                                                value={editForm.category}
                                                onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                                                className="w-full border rounded px-2 py-1 text-sm"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                value={editForm.item}
                                                onChange={e => setEditForm({ ...editForm, item: e.target.value })}
                                                className="w-full border rounded px-2 py-1 text-sm"
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
                                                className="w-full border rounded px-2 py-1 text-sm text-right"
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
                                                        className="w-full border rounded px-2 py-1 text-sm text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={editForm.price || ''}
                                                        onChange={e => setEditForm({ ...editForm, price: parseFloat(e.target.value) || null })}
                                                        className="w-full border rounded px-2 py-1 text-sm text-right bg-gray-50"
                                                        title="Auto-calculated from Qty × Price/Unit"
                                                    />
                                                </td>
                                            </>
                                        )}
                                        <td className="px-3 py-2">
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={saveEdit}
                                                    className="text-green-600 hover:text-green-800 p-1"
                                                    title="Save"
                                                >
                                                    <Save size={16} />
                                                </button>
                                                <button
                                                    onClick={cancelEdit}
                                                    className="text-gray-600 hover:text-gray-800 p-1"
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
                                        <td className="px-3 py-2 text-xs">{m.category}</td>
                                        <td className="px-3 py-2">{m.item}</td>
                                        <td className="px-3 py-2 text-right font-mono">{m.quantity}</td>
                                        <td className="px-3 py-2">{m.unit}</td>
                                        {showPrices && (
                                            <>
                                                <td className="px-3 py-2 text-right font-mono text-gray-600 text-xs">
                                                    {m.pricePerUnit ? formatCurrency(m.pricePerUnit) : '—'}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-medium">
                                                    {m.price ? formatCurrency(m.price) : '—'}
                                                </td>
                                            </>
                                        )}
                                        <td className="px-3 py-2">
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => startEdit(m)}
                                                    className="text-blue-600 hover:text-blue-800 p-1"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm('Delete this item?')) {
                                                            onRemove(m.id);
                                                        }
                                                    }}
                                                    className="text-red-600 hover:text-red-800 p-1"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                    {showPrices && totalPrice > 0 && (
                        <tfoot className="bg-gray-50 border-t-2">
                            <tr>
                                <td colSpan={5} className="px-3 py-2 text-right font-semibold">
                                    Total ({itemsWithPrice}/{materials.length} items with prices):
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-lg">
                                    {formatCurrency(totalPrice)}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {showPrices && itemsWithPrice < materials.length && (
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    ⚠️ {materials.length - itemsWithPrice} item(s) without price information
                </div>
            )}
        </div>
    );
};

export default EditableBOMTable;

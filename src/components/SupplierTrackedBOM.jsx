import React, { useState, useMemo } from 'react';
import { Edit2, Save, X, Package, CheckCircle, Clock, AlertCircle, Check, Zap } from 'lucide-react';
import { formatCurrency } from '../utils/pdfParser';
import AutocompleteSupplierInput from './AutocompleteSupplierInput';
import { CATEGORY_KEYWORDS } from '../data/initialData';

const STATUS_STYLES = {
    'Not Ordered': { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock, border: 'border-gray-300' },
    'Ordered': { bg: 'bg-blue-100', text: 'text-blue-700', icon: Package, border: 'border-blue-300' },
    'Received': { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, border: 'border-green-300' }
};

const SupplierTrackedBOM = ({ materials, suppliers, onUpdate, showPrices = true }) => {
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    // Group materials by supplier
    const groupedBySupplier = useMemo(() => {
        const groups = {
            unassigned: [],
            assigned: {}
        };

        materials.forEach(m => {
            if (m.assignedSupplier) {
                const supplierId = m.assignedSupplier.id;
                if (!groups.assigned[supplierId]) {
                    groups.assigned[supplierId] = {
                        supplier: m.assignedSupplier,
                        materials: []
                    };
                }
                groups.assigned[supplierId].materials.push(m);
            } else {
                groups.unassigned.push(m);
            }
        });

        return groups;
    }, [materials]);

    const startEdit = (material) => {
        setEditingId(material.id);
        setEditForm({
            assignedSupplier: material.assignedSupplier || null,
            orderStatus: material.orderStatus || 'Not Ordered',
            orderDate: material.orderDate || '',
            expectedDelivery: material.expectedDelivery || '',
            actualDelivery: material.actualDelivery || '',
            orderNotes: material.orderNotes || ''
        });
    };

    const saveEdit = (materialId) => {
        onUpdate(materialId, editForm);
        setEditingId(null);
        setEditForm({});
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const assignSupplier = (materialId, supplier) => {
        onUpdate(materialId, {
            assignedSupplier: supplier,
            orderStatus: 'Not Ordered'
        });
    };

    // Quick-assign: find suppliers whose categories match a material's category
    const getSuggestedSuppliers = (material) => {
        if (!material.category) return [];
        const matCat = material.category.toLowerCase();
        return suppliers.filter(s =>
            (s.categories || []).some(c => {
                const cl = c.toLowerCase();
                // Check direct match
                if (cl.includes(matCat) || matCat.includes(cl)) return true;
                // Check via CATEGORY_KEYWORDS
                const keywords = CATEGORY_KEYWORDS[c] || [];
                return keywords.some(kw => matCat.includes(kw) || kw.includes(matCat));
            })
        ).slice(0, 3);
    };

    // Bulk assign: assign all unassigned materials to a supplier
    const bulkAssign = (supplier) => {
        const unassigned = materials.filter(m => !m.assignedSupplier);
        unassigned.forEach(m => {
            const suggested = getSuggestedSuppliers(m);
            if (suggested.some(s => s.id === supplier.id)) {
                assignSupplier(m.id, supplier);
            }
        });
    };

    const renderMaterialRow = (m) => {
        const isEditing = editingId === m.id;
        const status = m.orderStatus || 'Not Ordered';
        const statusStyle = STATUS_STYLES[status];
        const StatusIcon = statusStyle?.icon || Clock;

        return (
            <div key={m.id} className={`border rounded-lg p-4 ${statusStyle.bg} ${statusStyle.border}`}>
                <div className="flex items-start gap-4">
                    {/* Supplier Badge */}
                    <div className="flex-shrink-0 w-40">
                        {m.assignedSupplier ? (
                            <div className="bg-white border rounded-lg p-2">
                                <div className="font-semibold text-sm text-blue-700">
                                    {m.assignedSupplier.name}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {m.assignedSupplier.contact}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white border border-dashed rounded-lg p-2">
                                <div className="text-[10px] text-gray-400 mb-1.5 text-center">Quick Assign</div>
                                {getSuggestedSuppliers(m).length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                        {getSuggestedSuppliers(m).map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => assignSupplier(m.id, s)}
                                                className="text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors font-medium truncate max-w-[140px]"
                                                title={`Assign to ${s.name}`}
                                            >
                                                {s.name}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => startEdit(m)}
                                        className="text-xs text-blue-600 hover:text-blue-700 w-full text-center"
                                    >
                                        Search & Assign
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Material Details */}
                    <div className="flex-1">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="font-medium text-gray-900">{m.item}</div>
                                {m.standardItem && m.item !== m.standardItem && (
                                    <div
                                        className="text-[10px] text-blue-600 mt-1 flex items-center gap-1 bg-white w-fit px-1.5 py-0.5 rounded border border-blue-200 cursor-pointer hover:bg-blue-50 transition-colors"
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
                                <div className="text-sm text-gray-600 mt-1">
                                    <span className="font-mono">{m.quantity} {m.unit}</span>
                                    {showPrices && m.pricePerUnit && (
                                        <span className="ml-3 text-gray-500">
                                            @ {formatCurrency(m.pricePerUnit)}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-500 mt-1 uppercase">
                                    {m.category}
                                </div>
                            </div>
                            {showPrices && m.price && (
                                <div className="text-right">
                                    <div className="font-bold text-lg text-gray-900">
                                        {formatCurrency(m.price)}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Status Badge */}
                        <div className="mt-3 flex items-center gap-3">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
                                <StatusIcon size={14} />
                                {status}
                            </span>

                            {m.orderDate && (
                                <span className="text-xs text-gray-600">
                                    Ordered: {new Date(m.orderDate).toLocaleDateString()}
                                </span>
                            )}
                            {m.expectedDelivery && (
                                <span className="text-xs text-gray-600">
                                    Expected: {new Date(m.expectedDelivery).toLocaleDateString()}
                                </span>
                            )}
                            {m.actualDelivery && (
                                <span className="text-xs text-green-700 font-medium">
                                    Delivered: {new Date(m.actualDelivery).toLocaleDateString()}
                                </span>
                            )}
                        </div>

                        {/* Notes */}
                        {m.orderNotes && (
                            <div className="mt-2 text-xs text-gray-600 bg-white bg-opacity-50 rounded p-2">
                                📝 {m.orderNotes}
                            </div>
                        )}
                    </div>

                    {/* Edit Button */}
                    <div className="flex-shrink-0">
                        {!isEditing && (
                            <button
                                onClick={() => startEdit(m)}
                                className="p-2 text-blue-600 hover:bg-white rounded-lg transition-colors"
                                title="Edit tracking"
                            >
                                <Edit2 size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Edit Form */}
                {isEditing && (
                    <div className="mt-4 bg-white rounded-lg p-4 border border-gray-300">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Assign Supplier
                                </label>
                                <AutocompleteSupplierInput
                                    suppliers={suppliers}
                                    value={editForm.assignedSupplier}
                                    onSelect={(supplier) => setEditForm({ ...editForm, assignedSupplier: supplier })}
                                    onClear={() => setEditForm({ ...editForm, assignedSupplier: null })}
                                    materialCategory={m.category}
                                    placeholder="Search supplier by name, location..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Order Status
                                </label>
                                <select
                                    value={editForm.orderStatus}
                                    onChange={e => setEditForm({ ...editForm, orderStatus: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                >
                                    <option value="Not Ordered">Not Ordered</option>
                                    <option value="Ordered">Ordered</option>
                                    <option value="Received">Received</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Order Date
                                </label>
                                <input
                                    type="date"
                                    value={editForm.orderDate}
                                    onChange={e => setEditForm({ ...editForm, orderDate: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Expected Delivery
                                </label>
                                <input
                                    type="date"
                                    value={editForm.expectedDelivery}
                                    onChange={e => setEditForm({ ...editForm, expectedDelivery: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Actual Delivery
                                </label>
                                <input
                                    type="date"
                                    value={editForm.actualDelivery}
                                    onChange={e => setEditForm({ ...editForm, actualDelivery: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Notes
                                </label>
                                <textarea
                                    value={editForm.orderNotes}
                                    onChange={e => setEditForm({ ...editForm, orderNotes: e.target.value })}
                                    placeholder="Add notes about this order..."
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    rows={2}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={cancelEdit}
                                className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm"
                            >
                                <X size={14} /> Cancel
                            </button>
                            <button
                                onClick={() => saveEdit(m.id)}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                            >
                                <Save size={14} /> Save Changes
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Calculate totals by status
    const statusSummary = useMemo(() => {
        const summary = {
            'Not Ordered': { count: 0, total: 0 },
            'Ordered': { count: 0, total: 0 },
            'Received': { count: 0, total: 0 }
        };

        materials.forEach(m => {
            const status = m.orderStatus || 'Not Ordered';
            summary[status].count++;
            summary[status].total += (m.price || 0);
        });

        return summary;
    }, [materials]);

    if (materials.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                No materials in this project
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Status Summary */}
            <div className="grid grid-cols-3 gap-4">
                {Object.entries(statusSummary).map(([status, data]) => {
                    const style = STATUS_STYLES[status];
                    const Icon = style.icon;
                    return (
                        <div key={status} className={`${style.bg} ${style.border} border rounded-xl p-4`}>
                            <div className="flex items-center gap-2 mb-2">
                                <Icon size={18} className={style.text} />
                                <span className={`font-semibold ${style.text}`}>{status}</span>
                            </div>
                            <div className="text-2xl font-bold text-gray-900">{data.count}</div>
                            {showPrices && (
                                <div className="text-sm text-gray-600 mt-1">
                                    {formatCurrency(data.total)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Materials grouped by supplier */}
            {Object.keys(groupedBySupplier.assigned).length > 0 && (
                <div className="space-y-6">
                    {Object.values(groupedBySupplier.assigned).map(({ supplier, materials: groupMaterials }) => (
                        <div key={supplier.id} className="space-y-3">
                            <div className="flex items-center gap-3 pb-2 border-b-2 border-blue-200">
                                <Package size={20} className="text-blue-600" />
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800">{supplier.name}</h3>
                                    <p className="text-sm text-gray-600">
                                        {supplier.location} • {supplier.contact}
                                    </p>
                                </div>
                                <div className="ml-auto flex items-center gap-3">
                                    {groupedBySupplier.unassigned.length > 0 && (
                                        <button
                                            onClick={() => bulkAssign(supplier)}
                                            className="text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors font-bold flex items-center gap-1"
                                            title={`Assign matching unassigned materials to ${supplier.name}`}
                                        >
                                            <Zap size={10} /> Bulk Assign
                                        </button>
                                    )}
                                    <div className="text-right">
                                        <div className="text-sm text-gray-500">{groupMaterials.length} items</div>
                                        {showPrices && (
                                            <div className="font-semibold text-gray-900">
                                                {formatCurrency(groupMaterials.reduce((sum, m) => sum + (m.price || 0), 0))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {groupMaterials.map(renderMaterialRow)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Unassigned materials */}
            {groupedBySupplier.unassigned.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-3 pb-2 border-b-2 border-gray-200">
                        <AlertCircle size={20} className="text-gray-400" />
                        <h3 className="font-bold text-lg text-gray-600">Unassigned Materials</h3>
                        <div className="ml-auto text-sm text-gray-500">
                            {groupedBySupplier.unassigned.length} items
                        </div>
                    </div>
                    <div className="space-y-3">
                        {groupedBySupplier.unassigned.map(renderMaterialRow)}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupplierTrackedBOM;

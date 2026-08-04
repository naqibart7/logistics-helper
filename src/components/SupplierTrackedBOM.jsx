import React, { useState, useMemo } from 'react';
import { 
    Edit2, Save, X, Package, CheckCircle, Clock, AlertCircle, 
    Check, Zap, Calendar, TrendingUp, LayoutList, ArrowRight, UserCheck, Trash2 
} from 'lucide-react';
import { formatCurrency } from '../utils/pdfParser';
import AutocompleteSupplierInput from './AutocompleteSupplierInput';
import { CATEGORY_KEYWORDS } from '../data/initialData';

const STATUS_STYLES = {
    'Not Ordered': { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock, border: 'border-gray-300' },
    'Ordered': { bg: 'bg-blue-100', text: 'text-blue-700', icon: Package, border: 'border-blue-300' },
    'Received': { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, border: 'border-green-300' },
    'N/A': { bg: 'bg-orange-50', text: 'text-orange-700', icon: X, border: 'border-orange-200' }
};

const SupplierTrackedBOM = ({ materials, suppliers, onUpdate, onRemove, onBulkUpdate, showPrices = true }) => {
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    // Group materials by supplier with intelligent urgency sorting
    const groupedBySupplier = useMemo(() => {
        const unassigned = [];
        const assignedMap = {};

        // 1. Definition of Action Urgency
        const STATUS_WEIGHTS = {
            'Not Ordered': 1, // Action required immediately
            'Ordered': 2,     // Waiting on supplier/delivery
            'Received': 3,    // Done
            'N/A': 4          // Ignored/Cancelled
        };

        materials.forEach(m => {
            if (m.assignedSupplier) {
                const supplierId = m.assignedSupplier.id;
                if (!assignedMap[supplierId]) {
                    assignedMap[supplierId] = {
                        supplier: m.assignedSupplier,
                        materials: []
                    };
                }
                assignedMap[supplierId].materials.push(m);
            } else {
                unassigned.push(m);
            }
        });

        // 2. Sort materials INSIDE each supplier
        const assignedArray = Object.values(assignedMap).map(group => {
            group.materials.sort((a, b) => {
                const weightA = STATUS_WEIGHTS[a.orderStatus || 'Not Ordered'] || 5;
                const weightB = STATUS_WEIGHTS[b.orderStatus || 'Not Ordered'] || 5;
                
                // Sort by primary urgency weight
                if (weightA !== weightB) return weightA - weightB;
                
                // Secondary sort: Group by Category logically
                const catA = a.category || '';
                const catB = b.category || '';
                if (catA !== catB) return catA.localeCompare(catB);
                
                // Tertiary sort: Alphabetical item name
                return (a.item || '').localeCompare(b.item || '');
            });
            return group;
        });

        // 3. Sort OUTSIDE supplier groups
        // Bubble suppliers with highest urgency items to the top!
        assignedArray.sort((a, b) => {
            // Find most urgent item weight per group (since they are already sorted, it's just the first item)
            // Wait, what if materials is empty? Handle carefully
            const minWeightA = a.materials.length > 0 ? (STATUS_WEIGHTS[a.materials[0].orderStatus || 'Not Ordered'] || 5) : 5;
            const minWeightB = b.materials.length > 0 ? (STATUS_WEIGHTS[b.materials[0].orderStatus || 'Not Ordered'] || 5) : 5;
            
            if (minWeightA !== minWeightB) {
                return minWeightA - minWeightB;   
            }
            return a.supplier.name.localeCompare(b.supplier.name);
        });

        // 4. Sort unassigned list gracefully
        unassigned.sort((a, b) => {
            const catA = a.category || '';
            const catB = b.category || '';
            if (catA !== catB) return catA.localeCompare(catB);
            return (a.item || '').localeCompare(b.item || '');
        });

        return {
            unassigned,
            assignedArray
        };
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
        const updates = [];
        unassigned.forEach(m => {
            const suggested = getSuggestedSuppliers(m);
            if (suggested.some(s => s.id === supplier.id)) {
                updates.push({
                    id: m.id,
                    updates: {
                        assignedSupplier: supplier,
                        orderStatus: 'Not Ordered'
                    }
                });
            }
        });
        if (updates.length > 0) onBulkUpdate(updates);
    };

    const autoMatchUnassigned = () => {
        const updates = [];
        groupedBySupplier.unassigned.forEach(m => {
            const suggested = getSuggestedSuppliers(m);
            if (suggested.length === 1) {
                updates.push({
                    id: m.id,
                    updates: {
                        assignedSupplier: suggested[0],
                        orderStatus: 'Not Ordered'
                    }
                });
            }
        });
        if (updates.length > 0) onBulkUpdate(updates);
    };

    // Bulk mark as received: mark all items in a group as 'Received'
    const bulkMarkReceived = (groupMaterials) => {
        // Find everything NOT already received and NOT N/A
        const targetItems = groupMaterials.filter(m => m.orderStatus !== 'Received' && m.orderStatus !== 'N/A');
        if (targetItems.length === 0) return;
        
        if (!window.confirm(`Mark all ${targetItems.length} items from this supplier as RECEIVED?`)) return;

        const today = new Date().toISOString().split('T')[0];
        const updates = targetItems.map(m => ({
            id: m.id,
            updates: { 
                orderStatus: 'Received',
                actualDelivery: today
            }
        }));

        if (onBulkUpdate) {
            onBulkUpdate(updates);
        } else {
            updates.forEach(u => onUpdate(u.id, u.updates));
        }
    };

    // Bulk mark as ordered: mark all items in a group as 'Ordered'
    const bulkMarkOrdered = (groupMaterials) => {
        // Find everything that is 'Not Ordered' OR has no status yet
        const targetItems = groupMaterials.filter(m => !m.orderStatus || m.orderStatus === 'Not Ordered');
        if (targetItems.length === 0) return;

        if (!window.confirm(`Mark all ${targetItems.length} items from this supplier as ORDERED?`)) return;

        const today = new Date().toISOString().split('T')[0];
        const updates = targetItems.map(m => ({
            id: m.id,
            updates: { 
                orderStatus: 'Ordered',
                orderDate: today
            }
        }));

        if (onBulkUpdate) {
            onBulkUpdate(updates);
        } else {
            updates.forEach(u => onUpdate(u.id, u.updates));
        }
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

                        {/* Status & Quick Actions */}
                        <div className="mt-4 flex items-center flex-wrap gap-3">
                            {/* Current Status Badge */}
                            <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border-2 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} shadow-sm`}>
                                    <StatusIcon size={14} />
                                    {status.toUpperCase()}
                                </span>
                                
                                {status === 'Ordered' && m.expectedDelivery && (
                                    (() => {
                                        const today = new Date().toISOString().split('T')[0];
                                        if (m.expectedDelivery < today) {
                                            return (
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 animate-pulse bg-red-50 px-2 py-1 rounded border border-red-200">
                                                    <AlertCircle size={10} /> DELAYED
                                                </span>
                                            );
                                        }
                                        return null;
                                    })()
                                )}
                            </div>

                            {/* Quick Action Toggles */}
                            <div className="flex items-center gap-1.5 bg-gray-50 border p-1 rounded-lg">
                                {status === 'Not Ordered' && (
                                    <button
                                        onClick={() => onUpdate(m.id, { 
                                            orderStatus: 'Ordered',
                                            orderDate: new Date().toISOString().split('T')[0]
                                        })}
                                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-blue-600 text-white rounded hover:bg-blue-700 transition-all active:scale-95"
                                        title="Quick mark as Ordered"
                                    >
                                        <Package size={12} /> Mark Ordered
                                    </button>
                                )}
                                
                                {status !== 'Received' && (
                                    <button
                                        onClick={() => onUpdate(m.id, { 
                                            orderStatus: 'Received',
                                            actualDelivery: new Date().toISOString().split('T')[0]
                                        })}
                                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-green-600 text-white rounded hover:bg-green-700 transition-all active:scale-95"
                                        title="Quick mark as Received"
                                    >
                                        <CheckCircle size={12} /> Mark Received
                                    </button>
                                )}

                                {status === 'Received' && (
                                    <button
                                        onClick={() => onUpdate(m.id, { 
                                            orderStatus: 'Not Ordered',
                                            actualDelivery: null
                                        })}
                                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-white text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-all"
                                        title="Reset status"
                                    >
                                        <Clock size={12} /> Reset
                                    </button>
                                )}

                                {status !== 'N/A' && (
                                    <button
                                        onClick={() => onUpdate(m.id, { 
                                            orderStatus: 'N/A'
                                        })}
                                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-white text-orange-600 border border-orange-100 rounded hover:bg-orange-50 transition-all font-mono"
                                        title="Mark as Not Applicable"
                                    >
                                        <X size={12} /> N/A
                                    </button>
                                )}
                            </div>

                            {/* Date Overlays */}
                            <div className="flex items-center gap-3">
                                {m.orderDate && (
                                    <span className="text-[10px] text-gray-500 font-medium">
                                        📅 {new Date(m.orderDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                    </span>
                                )}
                                {m.actualDelivery && (
                                    <span className="text-[10px] text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded">
                                        📦 {new Date(m.actualDelivery).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        {m.orderNotes && (
                            <div className="mt-2 text-xs text-gray-600 bg-white bg-opacity-50 rounded p-2">
                                📝 {m.orderNotes}
                            </div>
                        )}
                    </div>

                            {/* Tracking Actions */}
                            <div className="flex-shrink-0 flex items-center gap-1">
                                {!isEditing && (
                                    <>
                                        <button
                                            onClick={() => {
                                                if (window.confirm('Are you sure you want to delete this item?')) {
                                                    onRemove(m.id);
                                                }
                                            }}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete item"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => startEdit(m)}
                                            className="p-2 text-blue-600 hover:bg-white rounded-lg transition-colors"
                                            title="Edit tracking"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                    </>
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
                                    value={editForm.orderStatus || 'Not Ordered'}
                                    onChange={e => setEditForm({ ...editForm, orderStatus: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                >
                                    <option value="Not Ordered">Not Ordered</option>
                                    <option value="Ordered">Ordered</option>
                                    <option value="Received">Received</option>
                                    <option value="N/A">Not Applicable (N/A)</option>
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
            'Received': { count: 0, total: 0 },
            'N/A': { count: 0, total: 0 }
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            {groupedBySupplier.assignedArray.length > 0 && (
                <div className="space-y-6">
                    {groupedBySupplier.assignedArray.map(({ supplier, materials: groupMaterials }) => (
                        <div key={supplier.id} className="space-y-3">
                            <div className="flex items-center gap-3 pb-2 border-b-2 border-blue-200">
                                <Package size={20} className="text-blue-600" />
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800">{supplier.name}</h3>
                                    <p className="text-sm text-gray-600">
                                        {supplier.location} • {supplier.contact}
                                    </p>
                                </div>
                                <div className="ml-auto flex items-center gap-4">
                                    {/* Progress stats for group */}
                                    <div className="hidden sm:flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400">
                                            <TrendingUp size={10} />
                                            PROGRESS: {Math.round((groupMaterials.filter(m => m.orderStatus === 'Received').length / groupMaterials.length) * 100)}%
                                        </div>
                                        <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                                            <div 
                                                className="h-full bg-green-500 transition-all duration-500"
                                                style={{ width: `${(groupMaterials.filter(m => m.orderStatus === 'Received').length / groupMaterials.length) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {groupedBySupplier.unassigned.length > 0 && (
                                            <button
                                                onClick={() => bulkAssign(supplier)}
                                                className="text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors font-bold flex items-center gap-1"
                                                title={`Assign matching unassigned materials to ${supplier.name}`}
                                            >
                                                <Zap size={10} /> Bulk Assign
                                            </button>
                                        )}
                                        
                                        {groupMaterials.some(m => !m.orderStatus || m.orderStatus === 'Not Ordered') && (
                                            <button
                                                onClick={() => bulkMarkOrdered(groupMaterials)}
                                                className="text-[10px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors font-bold flex items-center gap-1"
                                                title={`Mark all un-ordered items from ${supplier.name} as Ordered`}
                                            >
                                                <Package size={10} /> Mark Group Ordered
                                            </button>
                                        )}

                                        {groupMaterials.some(m => m.orderStatus !== 'Received') && (
                                            <button
                                                onClick={() => bulkMarkReceived(groupMaterials)}
                                                className="text-[10px] bg-green-50 text-green-600 hover:bg-green-100 px-2.5 py-1.5 rounded-lg transition-colors font-bold flex items-center gap-1"
                                                title={`Mark all items from ${supplier.name} as Received`}
                                            >
                                                <CheckCircle size={10} /> Mark Group Received
                                            </button>
                                        )}
                                    </div>

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

            {/* Unassigned materials with Intelligence */}
            {groupedBySupplier.unassigned.length > 0 && (
                <div className="space-y-4 pt-6 border-t-2 border-dashed border-gray-200">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <AlertCircle size={20} className="text-amber-500" />
                                <div>
                                    <h3 className="font-bold text-gray-800">Unassigned Materials</h3>
                                    <p className="text-xs text-gray-500">{groupedBySupplier.unassigned.length} items waiting for supplier assignment</p>
                                </div>
                            </div>

                            {(() => {
                                const matchable = groupedBySupplier.unassigned.filter(m => getSuggestedSuppliers(m).length === 1);
                                if (matchable.length > 0) {
                                    return (
                                        <button 
                                            onClick={autoMatchUnassigned}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95 animate-in fade-in slide-in-from-right-2"
                                        >
                                            <Zap size={14} fill="currentColor" />
                                            Smart Match {matchable.length} Items
                                        </button>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        <div className="p-5 space-y-3">
                            {groupedBySupplier.unassigned.map(renderMaterialRow)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupplierTrackedBOM;

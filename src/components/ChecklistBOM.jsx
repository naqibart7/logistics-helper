import React, { useMemo } from 'react';
import { Package, CheckCircle, Circle, AlertCircle, Check } from 'lucide-react';
import { formatCurrency } from '../utils/pdfParser';

const ChecklistBOM = ({ materials, suppliers, onUpdate, showPrices = true }) => {
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

    // Calculate completion statistics
    const stats = useMemo(() => {
        const total = materials.length;
        const checked = materials.filter(m => m.deliveryChecked).length;
        const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;

        return { total, checked, unchecked: total - checked, percentage };
    }, [materials]);

    const toggleCheck = (materialId) => {
        const material = materials.find(m => m.id === materialId);
        onUpdate(materialId, {
            deliveryChecked: !material.deliveryChecked,
            checkedDate: !material.deliveryChecked ? new Date().toISOString() : null
        });
    };

    const renderMaterialRow = (m) => {
        const isChecked = m.deliveryChecked || false;

        return (
            <div
                key={m.id}
                className={`border-l-4 rounded-lg p-4 transition-all ${isChecked
                    ? 'bg-green-50 border-green-500 opacity-70'
                    : 'bg-white border-gray-300 hover:border-blue-400'
                    }`}
            >
                <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <button
                        onClick={() => toggleCheck(m.id)}
                        className="flex-shrink-0 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                    >
                        {isChecked ? (
                            <CheckCircle size={28} className="text-green-600" />
                        ) : (
                            <Circle size={28} className="text-gray-400 hover:text-blue-500" />
                        )}
                    </button>

                    {/* Material Details */}
                    <div className="flex-1">
                        <div className="flex items-start justify-between">
                            <div className={isChecked ? 'line-through text-gray-500' : ''}>
                                <div className="font-semibold text-gray-900">{m.item}</div>
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
                                <div className={`text-right ${isChecked ? 'line-through text-gray-500' : ''}`}>
                                    <div className="font-bold text-lg text-gray-900">
                                        {formatCurrency(m.price)}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Checked timestamp */}
                        {isChecked && m.checkedDate && (
                            <div className="mt-2 text-xs text-green-700 bg-green-100 bg-opacity-50 rounded px-2 py-1 inline-block">
                                ✓ Verified: {new Date(m.checkedDate).toLocaleString()}
                            </div>
                        )}

                        {/* Delivery info */}
                        {m.actualDelivery && (
                            <div className="mt-2 text-xs text-gray-600">
                                Delivered: {new Date(m.actualDelivery).toLocaleDateString()}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (materials.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                No materials in this project
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Progress Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-2xl font-bold">Delivery Checklist</h3>
                        <p className="text-blue-100 mt-1">Verify items as they arrive on-site</p>
                    </div>
                    <div className="text-right">
                        <div className="text-4xl font-bold">{stats.percentage}%</div>
                        <div className="text-sm text-blue-100">Complete</div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="bg-blue-800 bg-opacity-50 rounded-full h-3 overflow-hidden">
                    <div
                        className="bg-green-400 h-full transition-all duration-500"
                        style={{ width: `${stats.percentage}%` }}
                    />
                </div>

                <div className="flex justify-between mt-3 text-sm">
                    <span>{stats.checked} of {stats.total} items verified</span>
                    {stats.unchecked > 0 && (
                        <span className="text-yellow-300">{stats.unchecked} remaining</span>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <Package size={18} />
                        <span className="text-sm font-medium">Total Items</span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-green-700 mb-1">
                        <CheckCircle size={18} />
                        <span className="text-sm font-medium">Verified</span>
                    </div>
                    <div className="text-3xl font-bold text-green-700">{stats.checked}</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-amber-700 mb-1">
                        <AlertCircle size={18} />
                        <span className="text-sm font-medium">Pending</span>
                    </div>
                    <div className="text-3xl font-bold text-amber-700">{stats.unchecked}</div>
                </div>
            </div>

            {/* Materials grouped by supplier */}
            {Object.keys(groupedBySupplier.assigned).length > 0 && (
                <div className="space-y-6">
                    {Object.values(groupedBySupplier.assigned).map(({ supplier, materials }) => {
                        const supplierChecked = materials.filter(m => m.deliveryChecked).length;
                        const supplierTotal = materials.length;
                        const supplierPercent = Math.round((supplierChecked / supplierTotal) * 100);

                        return (
                            <div key={supplier.id} className="space-y-3">
                                <div className="flex items-center gap-3 pb-2 border-b-2 border-blue-200">
                                    <Package size={20} className="text-blue-600" />
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg text-gray-800">{supplier.name}</h3>
                                        <p className="text-sm text-gray-600">
                                            {supplier.location} • {supplier.contact}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-gray-500">
                                            {supplierChecked}/{supplierTotal} verified
                                        </div>
                                        <div className="font-semibold text-lg text-gray-900">
                                            {supplierPercent}%
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {materials.map(renderMaterialRow)}
                                </div>
                            </div>
                        );
                    })}
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

            {/* Completion Message */}
            {stats.percentage === 100 && (
                <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6 text-center">
                    <CheckCircle size={64} className="text-green-600 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-green-900 mb-2">
                        All Items Verified! 🎉
                    </h3>
                    <p className="text-green-700">
                        Complete delivery checklist. Ready to mark project as completed.
                    </p>
                </div>
            )}
        </div>
    );
};

export default ChecklistBOM;

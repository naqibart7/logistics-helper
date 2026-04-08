import React, { useState, useMemo, useCallback } from 'react';
import { Package, CheckCircle, Circle, AlertCircle, Check, Copy, ChevronDown, ChevronUp, ClipboardCheck, Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils/pdfParser';

const ChecklistBOM = ({ materials, suppliers, onUpdate, onRemove, showPrices = true, projectName = '' }) => {
    const [showPendingPanel, setShowPendingPanel] = useState(true);
    const [selectedForCopy, setSelectedForCopy] = useState(new Set());
    const [copyMode, setCopyMode] = useState('pending'); // 'pending' | 'verified' | 'all'
    const [copied, setCopied] = useState(false);

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

    // Pending (not verified) items grouped by supplier
    const pendingItemsGrouped = useMemo(() => {
        const pending = materials.filter(m => !m.deliveryChecked);
        const groups = {};

        pending.forEach(m => {
            const key = m.assignedSupplier ? m.assignedSupplier.name : 'Unassigned';
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        });

        return groups;
    }, [materials]);

    // Verified items grouped by supplier
    const verifiedItemsGrouped = useMemo(() => {
        const verified = materials.filter(m => m.deliveryChecked);
        const groups = {};

        verified.forEach(m => {
            const key = m.assignedSupplier ? m.assignedSupplier.name : 'Unassigned';
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        });

        return groups;
    }, [materials]);

    // Current items based on copy mode
    const currentItemsGrouped = useMemo(() => {
        if (copyMode === 'pending') return pendingItemsGrouped;
        if (copyMode === 'verified') return verifiedItemsGrouped;
        // 'all'
        const groups = {};
        materials.forEach(m => {
            const key = m.assignedSupplier ? m.assignedSupplier.name : 'Unassigned';
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        });
        return groups;
    }, [copyMode, pendingItemsGrouped, verifiedItemsGrouped, materials]);

    const currentItemsFlat = useMemo(() => {
        return Object.values(currentItemsGrouped).flat();
    }, [currentItemsGrouped]);

    // Auto-select all items when mode changes
    const switchMode = useCallback((mode) => {
        setCopyMode(mode);
        const items = mode === 'pending'
            ? materials.filter(m => !m.deliveryChecked)
            : mode === 'verified'
                ? materials.filter(m => m.deliveryChecked)
                : materials;
        setSelectedForCopy(new Set(items.map(m => m.id)));
    }, [materials]);

    // Initialize selection on mount & when pending items change
    React.useEffect(() => {
        const pendingIds = materials.filter(m => !m.deliveryChecked).map(m => m.id);
        setSelectedForCopy(new Set(pendingIds));
    }, [materials]);

    const toggleSelectItem = (id) => {
        setSelectedForCopy(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        const allIds = currentItemsFlat.map(m => m.id);
        const allSelected = allIds.every(id => selectedForCopy.has(id));
        if (allSelected) {
            setSelectedForCopy(new Set());
        } else {
            setSelectedForCopy(new Set(allIds));
        }
    };

    const toggleSelectGroup = (groupItems) => {
        const groupIds = groupItems.map(m => m.id);
        const allSelected = groupIds.every(id => selectedForCopy.has(id));
        setSelectedForCopy(prev => {
            const next = new Set(prev);
            groupIds.forEach(id => {
                if (allSelected) next.delete(id);
                else next.add(id);
            });
            return next;
        });
    };

    // Generate WhatsApp-formatted message for selected items
    const generateWhatsAppMessage = useCallback(() => {
        const selected = materials.filter(m => selectedForCopy.has(m.id));
        if (selected.length === 0) return '';

        const modeLabel = copyMode === 'pending' ? 'Pending Delivery' : copyMode === 'verified' ? 'On Site ✅' : 'Item List';
        const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

        let msg = `📋 *${modeLabel}*\n`;
        msg += `📅 ${today}\n`;
        if (projectName) msg += `🏗️ *${projectName}*\n`;
        msg += `\n`;

        // Group selected items by supplier
        const grouped = {};
        selected.forEach(m => {
            const key = m.assignedSupplier ? m.assignedSupplier.name : 'Others';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(m);
        });

        let counter = 1;
        Object.entries(grouped).forEach(([supplier, items]) => {
            if (Object.keys(grouped).length > 1 || supplier !== 'Others') {
                msg += `*${supplier}:*\n`;
            }
            items.forEach(item => {
                msg += `${counter}. ${item.item}`;
                if (item.quantity && item.quantity !== '?') {
                    msg += ` — ${item.quantity} ${item.unit || ''}`.trimEnd();
                }
                if (copyMode === 'verified' && item.checkedDate) {
                    msg += ` ✅`;
                }
                msg += '\n';
                counter++;
            });
            msg += '\n';
        });

        msg += `Total: ${selected.length} item(s)`;

        return msg;
    }, [selectedForCopy, materials, copyMode, projectName]);

    const copyToClipboard = () => {
        const msg = generateWhatsAppMessage();
        if (!msg) return;
        navigator.clipboard.writeText(msg).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

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
                    {/* Delete Item Button */}
                    <div className="flex-shrink-0 self-center">
                        <button
                            onClick={() => {
                                if (window.confirm('Delete this item?')) {
                                    onRemove(m.id);
                                }
                            }}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-gray-100 rounded-lg transition-all"
                            title="Delete item"
                        >
                            <Trash2 size={18} />
                        </button>
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

            {/* ===== Pending / Copy-for-WhatsApp Panel ===== */}
            {materials.length > 0 && (
                <div className="border-2 border-amber-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    {/* Panel Header – clickable to expand/collapse */}
                    <button
                        onClick={() => setShowPendingPanel(p => !p)}
                        className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <ClipboardCheck size={20} className="text-amber-600" />
                            <span className="font-bold text-gray-800">
                                WhatsApp Item List
                            </span>
                            <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
                                {selectedForCopy.size} selected
                            </span>
                        </div>
                        {showPendingPanel ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
                    </button>

                    {showPendingPanel && (
                        <div className="px-5 py-4 space-y-4">
                            {/* Mode Tabs + Actions */}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                {/* Mode Tabs */}
                                <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                                    {[
                                        { key: 'pending', label: 'Pending', count: stats.unchecked, color: 'amber' },
                                        { key: 'verified', label: 'On Site ✅', count: stats.checked, color: 'green' },
                                        { key: 'all', label: 'All Items', count: stats.total, color: 'blue' }
                                    ].map(tab => (
                                        <button
                                            key={tab.key}
                                            onClick={() => switchMode(tab.key)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${copyMode === tab.key
                                                ? `bg-white shadow text-${tab.color}-700`
                                                : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                        >
                                            {tab.label} ({tab.count})
                                        </button>
                                    ))}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={toggleSelectAll}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                    >
                                        {currentItemsFlat.every(m => selectedForCopy.has(m.id)) ? 'Deselect All' : 'Select All'}
                                    </button>
                                    <button
                                        onClick={copyToClipboard}
                                        disabled={selectedForCopy.size === 0}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all active:scale-95 shadow-sm ${copied
                                            ? 'bg-green-600 text-white'
                                            : selectedForCopy.size === 0
                                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                : 'bg-green-600 text-white hover:bg-green-700'
                                            }`}
                                    >
                                        {copied ? (
                                            <><CheckCircle size={16} /> Copied!</>
                                        ) : (
                                            <><Copy size={16} /> Copy for WhatsApp</>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Item List */}
                            {currentItemsFlat.length === 0 ? (
                                <div className="text-center py-6 text-gray-400 text-sm">
                                    {copyMode === 'pending' ? 'No pending items — all verified! 🎉' : copyMode === 'verified' ? 'No verified items yet.' : 'No items.'}
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                    {Object.entries(currentItemsGrouped).map(([supplierName, items]) => (
                                        <div key={supplierName}>
                                            {/* Supplier Group Header */}
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <button
                                                    onClick={() => toggleSelectGroup(items)}
                                                    className="flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-blue-700 transition-colors"
                                                >
                                                    <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${items.every(m => selectedForCopy.has(m.id))
                                                        ? 'bg-blue-600 border-blue-600'
                                                        : items.some(m => selectedForCopy.has(m.id))
                                                            ? 'bg-blue-200 border-blue-400'
                                                            : 'border-gray-300'
                                                        }`}
                                                    >
                                                        {items.every(m => selectedForCopy.has(m.id)) && (
                                                            <Check size={10} className="text-white" />
                                                        )}
                                                    </div>
                                                    <Package size={12} className="text-blue-500" />
                                                    {supplierName}
                                                </button>
                                                <span className="text-[10px] text-gray-400">{items.length} items</span>
                                            </div>

                                            {/* Items */}
                                            <div className="ml-4 space-y-1">
                                                {items.map(m => {
                                                    const isSelected = selectedForCopy.has(m.id);
                                                    return (
                                                        <button
                                                            key={m.id}
                                                            onClick={() => toggleSelectItem(m.id)}
                                                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm ${isSelected
                                                                ? 'bg-blue-50 border border-blue-200'
                                                                : 'bg-gray-50 border border-transparent hover:border-gray-200'
                                                                }`}
                                                        >
                                                            <div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                                                {isSelected && <Check size={10} className="text-white" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="font-medium text-gray-900 truncate block">{m.item}</span>
                                                            </div>
                                                            <span className="flex-shrink-0 text-xs text-gray-500 font-mono">
                                                                {m.quantity} {m.unit || ''}
                                                            </span>
                                                            {m.deliveryChecked && (
                                                                <CheckCircle size={14} className="flex-shrink-0 text-green-500" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Preview */}
                            {selectedForCopy.size > 0 && (
                                <details className="group">
                                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 font-medium select-none">
                                        Preview message ({selectedForCopy.size} items)
                                    </summary>
                                    <pre className="mt-2 bg-gray-50 border rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                                        {generateWhatsAppMessage()}
                                    </pre>
                                </details>
                            )}
                        </div>
                    )}
                </div>
            )}

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

import React, { useState, useMemo } from 'react';
import { Save, AlertCircle, CheckCircle, Edit2, FileText, ChevronDown, ChevronRight, X, Plus } from 'lucide-react';
import EditableBOMTable from './EditableBOMTable';
import { formatCurrency } from '../utils/pdfParser';

const ImportPreview = ({ data, onConfirm, onCancel }) => {
    const [metadata, setMetadata] = useState(data.metadata);
    const [materials, setMaterials] = useState(data.materials);
    const [showRawText, setShowRawText] = useState(false);
    const format = data.format || 'UNKNOWN';

    const handleMetadataChange = (field, value) => {
        setMetadata(prev => ({ ...prev, [field]: value }));
    };

    const updateMaterial = (id, updates) => {
        setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    };

    const removeMaterial = (id) => {
        setMaterials(prev => prev.filter(m => m.id !== id));
    };

    const newMaterial = (item) => {
        setMaterials(prev => [...prev, item]);
    };

    const handleSave = () => {
        onConfirm({
            metadata,
            materials,
            format
        });
    };

    // Group materials by category
    const groupedMaterials = useMemo(() => {
        const groups = {};
        const order = ['MATERIALS', 'SUPPORTING MATERIAL', 'CEILING', 'WALL', 'FLOORING', 'ELECTRICAL', 'PAINT', 'OTHERS']; // Preferred order

        // Group them
        materials.forEach(m => {
            const cat = (m.category || 'Uncategorized').toUpperCase();
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(m);
        });

        // Sort keys based on preferred order + alpha for others
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const idxA = order.indexOf(a);
            const idxB = order.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        return sortedKeys.map(key => ({
            category: key,
            items: groups[key]
        }));
    }, [materials]);

    // Calculate totals for preview
    const totalCost = materials.reduce((sum, m) => sum + (m.price || 0), 0);
    const itemsWithPrice = materials.filter(m => m.price).length;
    const lowConfidenceItems = materials.filter(m => m.confidence !== undefined && m.confidence < 0.6);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">

            {/* Header & Metadata Section */}
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800">Import Preview</h3>
                            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">
                                Detected Format: <span className="text-blue-600">{format.replace(/_/g, ' ')}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-gray-400 hover:text-gray-600 p-1"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Project Name</label>
                        <input
                            value={metadata.projectName || ''}
                            onChange={e => handleMetadataChange('projectName', e.target.value)}
                            className="w-full border-b focus:border-blue-500 outline-none py-1 text-gray-800 font-medium placeholder-gray-300"
                            placeholder="Enter Project Name"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Client</label>
                        <input
                            value={metadata.client || ''}
                            onChange={e => handleMetadataChange('client', e.target.value)}
                            className="w-full border-b focus:border-blue-500 outline-none py-1 text-gray-800 font-medium placeholder-gray-300"
                            placeholder="Client Name"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Project #</label>
                        <input
                            value={metadata.projectNumber || ''}
                            onChange={e => handleMetadataChange('projectNumber', e.target.value)}
                            className="w-full border-b focus:border-blue-500 outline-none py-1 text-gray-800 font-mono text-sm placeholder-gray-300"
                            placeholder="Project Number"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Quotation #</label>
                        <input
                            value={metadata.quotationNumber || ''}
                            onChange={e => handleMetadataChange('quotationNumber', e.target.value)}
                            className="w-full border-b focus:border-blue-500 outline-none py-1 text-gray-800 font-mono text-sm placeholder-gray-300"
                            placeholder="Q-XXXXX"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Date</label>
                        <input
                            value={metadata.date || ''}
                            onChange={e => handleMetadataChange('date', e.target.value)}
                            className="w-full border-b focus:border-blue-500 outline-none py-1 text-gray-800 font-mono text-sm placeholder-gray-300"
                            placeholder="DD/MM/YYYY"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Total Estimated Value</label>
                        <div className="text-lg font-bold text-gray-800">
                            {formatCurrency(totalCost)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Materials Tables Section */}
            <div className="space-y-6">
                {lowConfidenceItems.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                        <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-amber-900 text-sm">
                                {lowConfidenceItems.length} low-confidence line(s) detected
                            </p>
                            <p className="text-xs text-amber-800 mt-1">
                                These rows were likely affected by OCR noise. They are highlighted in the table below —
                                review the item names, quantities and prices before confirming the import.
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-end">
                    <h4 className="font-bold text-gray-800 text-lg">Extracted Materials</h4>
                    <div className="text-sm text-gray-500">
                        {materials.length} total items found
                    </div>
                </div>

                {groupedMaterials.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        <p className="text-gray-500 mb-2">No materials found in extraction.</p>
                        <button onClick={() => newMaterial({ category: 'General', item: 'New Item', quantity: 1, unit: 'pcs', price: 0 })} className="text-blue-600 font-medium hover:underline">
                            + Add First Item manually
                        </button>
                    </div>
                ) : (
                    groupedMaterials.map((group) => (
                        <div key={group.category} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                            <div className="px-5 py-3 bg-gray-50 border-b flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-700">{group.category}</span>
                                    <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                                        {group.items.length}
                                    </span>
                                </div>
                                <div className="text-sm font-medium text-gray-600">
                                    Total: {formatCurrency(group.items.reduce((s, m) => s + (m.price || 0), 0))}
                                </div>
                            </div>
                            <div className="p-4">
                                <EditableBOMTable
                                    materials={group.items}
                                    onUpdate={updateMaterial}
                                    onRemove={removeMaterial}
                                    onAdd={newMaterial}
                                    showPrices={true}
                                    defaultCategory={group.category}
                                />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Raw Text Debug Section */}
            {data.rawText && (
                <div className="border rounded-xl bg-gray-900 overflow-hidden mt-8">
                    <button
                        onClick={() => setShowRawText(!showRawText)}
                        className="w-full px-4 py-3 bg-gray-800 text-gray-300 hover:text-white flex items-center justify-between transition-colors"
                    >
                        <span className="font-mono text-sm flex items-center gap-2">
                            {showRawText ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            View Raw Extracted Text (Debug)
                        </span>
                        <span className="text-xs text-gray-500">
                            {data.rawText.length} chars
                        </span>
                    </button>

                    {showRawText && (
                        <div className="p-4 overflow-auto max-h-64 scrollbar-thin scrollbar-thumb-gray-600">
                            <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap leading-relaxed select-text">
                                {data.rawText}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-6 border-t mt-8">
                <button
                    onClick={onCancel}
                    className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium transition-colors"
                >
                    Cancel Import
                </button>
                <button
                    onClick={handleSave}
                    className="bg-blue-600 text-white px-8 py-2.5 rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-sm font-medium transition-transform active:scale-95"
                >
                    <CheckCircle size={18} /> Confirm & Import Project
                </button>
            </div>
        </div>
    );
};

export default ImportPreview;

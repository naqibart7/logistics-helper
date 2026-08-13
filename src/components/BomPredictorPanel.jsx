/**
 * BomPredictorPanel — live "Predictive BOM Compiler" strip for a draft.
 *
 * Runs the inference pass on every draft change and renders the resulting
 * JSON contract {auto_injections, proactive_suggestions, conflicts} as
 * one-tap affordances. Every SKU shown exists in the Canonical Catalog —
 * suggestions are never invented. Manual typing drops toward zero.
 */
import React, { useMemo } from 'react';
import { Sparkles, Plus, AlertTriangle, Check } from 'lucide-react';
import { buildCooccurrence, predictBOM } from '../utils/bomPredictor';
import { formatCurrency } from '../utils/pdfParser';

const catalogItem = (catalog, sku) =>
    (catalog || []).find(c => c.name === sku) || null;

const fmt = (price) => (Number(price) > 0 ? formatCurrency(Number(price)) : '—');

const makeMaterial = (catalog, sku, qty, categoryHint) => {
    const item = catalogItem(catalog, sku) || { name: sku, price: 0, unit: 'pcs', category: categoryHint };
    const quantity = Math.max(1, Math.round(Number(qty) || 1));
    const price = Number(item.price) || 0;
    return {
        id: 'predict-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        item: item.name,
        category: item.category || categoryHint || 'Materials',
        quantity,
        unit: item.unit || 'pcs',
        pricePerUnit: price,
        price: quantity * price,
        total: quantity * price,
        fromPrediction: true,
    };
};

const BomPredictorPanel = ({ draft = [], catalog = [], history = [], onAdd, projectCategory }) => {
    const matrix = useMemo(() => buildCooccurrence({ projects: history, catalog }), [history, catalog]);
    const prediction = useMemo(
        () => predictBOM(draft, catalog, matrix),
        [draft, catalog, matrix]
    );

    if (!prediction.proactive_suggestions.length && !prediction.conflicts.length) {
        return null;
    }

    return (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                    Predictive BOM Compiler
                </span>
                <span className="text-[11px] text-indigo-400">
                    {prediction.proactive_suggestions.length} suggestion{prediction.proactive_suggestions.length === 1 ? '' : 's'}
                    {prediction.conflicts.length > 0 && ` · ${prediction.conflicts.length} conflict${prediction.conflicts.length === 1 ? '' : 's'}`}
                </span>
            </div>

            {prediction.conflicts.length > 0 && (
                <div className="space-y-2">
                    {prediction.conflicts.map((c, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                            <p className="text-sm text-amber-800 flex items-center gap-1.5 min-w-0">
                                <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                                <span className="truncate">{c.reason}</span>
                            </p>
                            <button
                                onClick={() => {
                                    const item = catalogItem(catalog, c.resolution_sku);
                                    if (item) onAdd(makeMaterial(catalog, c.resolution_sku, 1, projectCategory));
                                }}
                                className="shrink-0 px-2.5 py-1 rounded-md bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 flex items-center gap-1"
                            >
                                <Plus size={12} /> Use {c.resolution_sku.split(' ').slice(0, 3).join(' ')}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {prediction.proactive_suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {prediction.proactive_suggestions.map((s, i) => {
                        const item = catalogItem(catalog, s.sku);
                        return (
                            <div key={i} className="flex items-center gap-2 bg-white border border-indigo-100 rounded-lg pl-3 pr-1.5 py-1.5">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-800 leading-tight">{s.sku}</p>
                                    <p className="text-[11px] text-gray-400">
                                        {fmt(item?.price)} / {item?.unit || 'pcs'}
                                        {' · '}qty {s.suggested_qty}
                                        {' · '}{s.reason}
                                    </p>
                                </div>
                                <button
                                    onClick={() => onAdd(makeMaterial(catalog, s.sku, s.suggested_qty, projectCategory))}
                                    className="shrink-0 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                    title={`Add ${s.suggested_qty} × ${s.sku}`}
                                >
                                    <Check size={15} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default BomPredictorPanel;
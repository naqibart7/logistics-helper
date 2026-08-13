/**
 * BomPredictorPanel — live "Predictive BOM Compiler" strip for a draft.
 *
 * Runs the inference pass on every draft change and renders the resulting
 * JSON contract {auto_injections, proactive_suggestions, conflicts} as
 * one-tap affordances. Every SKU shown exists in the Canonical Catalog —
 * suggestions are never invented. Manual typing drops toward zero.
 */
import React, { useMemo } from 'react';
import { Sparkles, Plus, AlertTriangle, Check, AlertOctagon, Ruler, Layers } from 'lucide-react';
import { buildCooccurrence, predictBOM } from '../utils/bomPredictor';
import { validateDraft } from '../utils/bomValidator';
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
    const validation = useMemo(() => validateDraft(draft, catalog), [draft, catalog]);

    const hasContent = prediction.proactive_suggestions.length || prediction.conflicts.length ||
        validation.critical_dependencies.length || validation.quantized_adjustments.length ||
        validation.unit_conflicts.length;
    const criticals = validation.critical_dependencies;
    if (!hasContent) {
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
                    {criticals.length > 0 && ` · ${criticals.length} critical`}
                    {validation.quantized_adjustments.length > 0 && ` · ${validation.quantized_adjustments.length} quantized`}
                </span>
            </div>

            {/* Pass 2 — Pre-flight gate: CRITICAL missing dependencies */}
            {criticals.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-red-700 flex items-center gap-1.5">
                        <AlertOctagon size={13} /> Pre-flight gate — {criticals.length} critical omission{criticals.length === 1 ? '' : 's'} (resolve before Generate PO)
                    </p>
                    <div className="mt-2 space-y-1.5">
                        {criticals.map((d, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 bg-white border border-red-100 rounded-lg px-3 py-2">
                                <p className="text-sm text-red-800 min-w-0">
                                    <span className="truncate inline-block max-w-[16rem] align-bottom">{d.parent_sku}</span>
                                    <span className="mx-1.5 text-red-300">→</span>
                                    <span className="font-semibold">{d.missing_sku}</span>
                                </p>
                                <button
                                    onClick={() => onAdd(makeMaterial(catalog, d.missing_sku, 1, projectCategory))}
                                    className="shrink-0 px-2.5 py-1 rounded-md bg-red-500 text-white text-xs font-semibold hover:bg-red-600 flex items-center gap-1"
                                >
                                    <Plus size={12} /> Add missing
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pass 2 — pack-size quantization (no fractional / short orders) */}
            {validation.quantized_adjustments.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                        <Layers size={13} /> Pack-size quantization ({validation.quantized_adjustments.length})
                    </p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {validation.quantized_adjustments.map((q, i) => (
                            <div key={i} className="text-xs text-slate-600 truncate">
                                <span className="text-slate-400">{q.raw_qty} → </span>
                                <span className="font-mono font-bold text-slate-800">{q.final_qty}</span>
                                <span className="text-slate-400"> · {q.reason}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pass 2 — unit homogeneity conflicts */}
            {validation.unit_conflicts.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
                        <Ruler size={13} /> Unit homogeneity ({validation.unit_conflicts.length})
                    </p>
                    <div className="mt-1.5 space-y-1">
                        {validation.unit_conflicts.map((u, i) => (
                            <p key={i} className="text-xs text-amber-800 truncate">
                                {u.item_a} <span className="text-amber-400">vs</span> {u.item_b} — {u.reason}
                            </p>
                        ))}
                    </div>
                </div>
            )}

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
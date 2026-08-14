/**
 * BomPredictorPanel — live "Predictive BOM Compiler" strip for a draft.
 *
 * Runs the inference pass on every draft change and renders the resulting
 * JSON contract {auto_injections, proactive_suggestions, conflicts} as
 * one-tap affordances. Every SKU shown exists in the Canonical Catalog —
 * suggestions are never invented. Manual typing drops toward zero.
 */
import React, { useMemo } from 'react';
import { Sparkles, Plus, AlertTriangle, Check, AlertOctagon, Ruler, Layers, Boxes, PackagePlus, Shield, Hash, ThumbsUp } from 'lucide-react';
import { buildCooccurrence, predictBOM } from '../utils/bomPredictor';
import { validateDraft, satisfyDraft } from '../utils/bomValidator';
import { runKitEngine, discoverLearnedKits, approveLearnedKit, retractKitInjections } from '../utils/quickKitEngine';
import { formatCurrency } from '../utils/pdfParser';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const catalogItem = (catalog, sku) =>
    (catalog || []).find(c => c.name === sku) || null;

const fmt = (price) => (Number(price) > 0 ? formatCurrency(Number(price)) : '—');

const makeMaterial = (catalog, sku, qty, categoryHint, kitDriver) => {
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
        ...(kitDriver ? { fromKit: kitDriver } : {}),
    };
};

const BomPredictorPanel = ({ draft = [], catalog = [], history = [], onAdd, onRemove, projectCategory, area }) => {
    // Debounce the inputs to the compiled inference passes so rapid typing in
    // the BOM table doesn't re-run every expensive pass on each keystroke.
    const dDraft = useDebouncedValue(draft, 300);
    const dCatalog = useDebouncedValue(catalog, 300);
    const dHistory = useDebouncedValue(history, 300);
    const dArea = useDebouncedValue(area, 300);

    const matrix = useMemo(() => buildCooccurrence({ projects: dHistory, catalog: dCatalog }), [dHistory, dCatalog]);
    const prediction = useMemo(
        () => predictBOM(dDraft, dCatalog, matrix),
        [dDraft, dCatalog, matrix]
    );
    const validation = useMemo(() => validateDraft(dDraft, dCatalog, { area: dArea }), [dDraft, dCatalog, dArea]);
    const csp = useMemo(() => satisfyDraft(dDraft, dCatalog, { area: dArea }), [dDraft, dCatalog, dArea]);
    const [, forceRerender] = React.useReducer((x) => x + 1, 0);
    useMemo(() => { try { discoverLearnedKits(matrix, 0.85); } catch { /* noop */ } return null; }, [matrix]);
    const kitDelta = useMemo(() => runKitEngine(dDraft, dCatalog, { area: dArea }, { kits: [] }), [dDraft, dCatalog, dArea]);
    const staleRows = useMemo(() => retractKitInjections(dDraft, dDraft), [dDraft]);

    const hasKitContent = kitDelta.injections.length > 0 || kitDelta.suggestions.length > 0 || kitDelta.blocked.length > 0 || staleRows.length > 0;

    const approveAndRefresh = (kitId) => { approveLearnedKit(kitId); forceRerender(); };

    const hasContent = prediction.proactive_suggestions.length || prediction.conflicts.length ||
        validation.critical_dependencies.length || validation.quantized_adjustments.length ||
        validation.unit_conflicts.length || csp.coverage_shortages.length ||
        csp.dimensional_conflicts.length || hasKitContent;
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
                    {csp.coverage_shortages.length > 0 && ` · ${csp.coverage_shortages.length} shortage${csp.coverage_shortages.length === 1 ? '' : 's'}`}
                </span>
            </div>

            {/* Quick-Kit Curation & Injection Engine */}
            {hasKitContent && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2.5 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-violet-700 flex items-center gap-1.5">
                        <PackagePlus size={13} /> Quick-Kit engine — {kitDelta.injections.length} required · {kitDelta.suggestions.length} suggested · {kitDelta.blocked.length} blocked
                    </p>

                    {/* RETRACTION — injected rows whose kit driver left the draft */}
                    {staleRows.length > 0 && onRemove && (
                        <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-rose-700 flex items-center gap-1.5 mb-1.5">
                                <AlertTriangle size={12} /> Driver removed — retract {staleRows.length} kit-injected row{staleRows.length === 1 ? '' : 's'}
                            </p>
                            {staleRows.map((r, i) => (
                                <div key={r.id || i} className="flex items-center justify-between gap-2 py-0.5">
                                    <p className="text-xs text-rose-800 truncate">{r.item}</p>
                                    <button
                                        onClick={() => onRemove(r.id)}
                                        className="shrink-0 px-2 py-0.5 rounded-md bg-rose-500 text-white text-[11px] font-semibold hover:bg-rose-600"
                                    >
                                        Retract
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* AUTO_INJECT (required, source manual|learned) */}
                    {kitDelta.injections.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {kitDelta.injections.map((inj, i) => {
                                const item = catalogItem(catalog, inj.sku);
                                return (
                                    <div key={i} className="flex items-center gap-2 bg-white border border-violet-100 rounded-lg pl-3 pr-1.5 py-1.5">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-800 leading-tight">{inj.sku}</p>
                                            <p className="text-[11px] text-gray-400">
                                                <Shield size={10} className="inline text-violet-400" /> {inj.source === 'manual' ? 'structural' : 'learned'} · qty {inj.qty}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onAdd(makeMaterial(catalog, inj.sku, inj.qty, projectCategory, inj.driver))}
                                            className="shrink-0 p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                                            title={`Inject ${inj.qty} × ${inj.sku}`}
                                        >
                                            <Plus size={15} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* blocked / unresolvable — never invented */}
                    {kitDelta.blocked.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            {kitDelta.blocked.map((b, i) => (
                                <p key={i} className="text-xs text-amber-800 flex items-center gap-1.5 py-0.5">
                                    <AlertTriangle size={12} className="shrink-0 text-amber-500" />
                                    <span className="truncate">{b.sku}</span>
                                    <span className="text-amber-500 shrink-0">({b.reason})</span>
                                    {b.resolution_sku && (
                                        <button
                                            onClick={() => onAdd(makeMaterial(catalog, b.resolution_sku, 1, projectCategory))}
                                            className="shrink-0 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[11px] font-semibold hover:bg-amber-600"
                                        >
                                            Use {b.resolution_sku.split(' ').slice(0, 3).join(' ')}
                                        </button>
                                    )}
                                </p>
                            ))}
                        </div>
                    )}

                    {/* optional / learned_candidate suggestions */}
                    {kitDelta.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {kitDelta.suggestions.map((s, i) => {
                                const item = catalogItem(catalog, s.sku);
                                return (
                                    <div key={i} className="flex items-center gap-2 bg-white border border-violet-100 rounded-lg pl-3 pr-1.5 py-1.5">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-800 leading-tight">{s.sku}</p>
                                            <p className="text-[11px] text-gray-400">
                                                {s.reason === 'learned_candidate' ? (
                                                    <span className="text-violet-500 flex items-center gap-1">
                                                        <Hash size={9} /> learned candidate · conf {Math.round((s.confidence || 0) * 100)}%
                                                    </span>
                                                ) : (
                                                    <span>{fmt(item?.price)} / {item?.unit || 'pcs'} · optional</span>
                                                )}
                                            </p>
                                        </div>
                                        {s.reason === 'learned_candidate' ? (
                                            <button
                                                onClick={() => approveAndRefresh(s.kitId)}
                                                className="shrink-0 p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                                title="Approve this learned kit (promotes it to an auto-injection for this driver)"
                                            >
                                                <ThumbsUp size={15} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => onAdd(makeMaterial(catalog, s.sku, 1, projectCategory))}
                                                className="shrink-0 p-2 rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-colors"
                                                title={`Add ${s.sku}`}
                                            >
                                                <Check size={15} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Pass 2 — coverage math (CRITICAL_SHORTAGE) */}
            {csp.coverage_shortages.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-red-700 flex items-center gap-1.5">
                        <Boxes size={13} /> Coverage deficit — {csp.coverage_shortages.length} shortage{csp.coverage_shortages.length === 1 ? '' : 's'}
                    </p>
                    <div className="mt-2 space-y-1.5">
                        {csp.coverage_shortages.map((s, i) => {
                            const inj = csp.auto_injections.find(a => a.sku === s.sku);
                            const injQty = inj ? inj.qty : Math.ceil(s.required_qty - s.current_qty);
                            return (
                                <div key={i} className="flex items-center justify-between gap-2 bg-white border border-red-100 rounded-lg px-3 py-2">
                                    <p className="text-sm text-red-800 min-w-0 truncate">
                                        {s.sku}: <span className="font-mono">{s.current_qty}</span> have,
                                        <span className="font-mono font-semibold"> {s.required_qty}</span> needed
                                        <span className="text-red-400"> (area {Math.round(area || 0)} m², incl. waste)</span>
                                    </p>
                                    <button
                                        onClick={() => onAdd(makeMaterial(catalog, s.sku, injQty, projectCategory))}
                                        className="shrink-0 px-2.5 py-1 rounded-md bg-red-500 text-white text-xs font-semibold hover:bg-red-600 flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Add {injQty}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

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
                            <div key={i} className="flex items-center justify-between gap-2">
                                <p className="text-xs text-amber-800 truncate">
                                    {u.item_a} <span className="text-amber-400">vs</span> {u.item_b} — {u.reason}
                                </p>
                                {u.resolution_sku && (
                                    <button
                                        onClick={() => onAdd(makeMaterial(catalog, u.resolution_sku, 1, projectCategory))}
                                        className="shrink-0 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[11px] font-semibold hover:bg-amber-600 flex items-center gap-1"
                                    >
                                        <Plus size={11} /> Use {u.resolution_sku.split(' ').slice(0, 3).join(' ')}
                                    </button>
                                )}
                            </div>
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
/**
 * CatalogTab — the dedicated Catalog tab.
 *
 * Composes the Item Database editor with "learned" intelligence mined from the
 * Suppliers & Projects data (best/last prices, who sells it, how often used).
 * Learning is manual-first: refreshing scans the existing data; applying a best
 * price is an explicit per-item action so the catalog never surprises you.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { RefreshCw, TrendingUp, Check, Sparkles } from 'lucide-react';
import ItemDatabase from './ItemDatabase';
import { getCatalogInsights, observeProjects, observeSupplierImport } from '../utils/catalogLearning';
import { applyBestPrice } from '../utils/catalogLearning';
import { formatCurrency } from '../utils/pdfParser';

const CatalogTab = ({ catalog, setCatalog, projects, suppliers }) => {
    const [insights, setInsights] = useState(() => getCatalogInsights());
    const [applied, setApplied] = useState({});

    const refresh = useCallback(() => {
        let added = observeProjects({ catalog, projects });
        setInsights(getCatalogInsights());
        return added;
    }, [catalog, projects]);

    // Keep learning hot-but-light: auto-scan once when the tab mounts.
    const autoScanned = useMemo(() => {
        const n = observeProjects({ catalog, projects });
        if (n > 0) setInsights(getCatalogInsights());
        return n;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const apply = (ins) => {
        const best = applyBestPrice(catalog, ins.name);
        if (!Number.isFinite(best)) return;
        setCatalog(prev => prev.map(i =>
            i.name.toLowerCase() === ins.name.toLowerCase() ? { ...i, price: best } : i
        ));
        setApplied(prev => ({ ...prev, [ins.key]: best }));
        setTimeout(() => setApplied(prev => ({ ...prev, [ins.key]: undefined })), 1800);
    };

    const sortedInsights = insights
        .filter(i => Number.isFinite(i.best))
        .sort((a, b) => b.count - a.count || (b.last - a.last))
        .slice(0, 60);

    return (
        <div className="space-y-6">
            {/* Learning header */}
            <div className="bg-gradient-to-r from-blue-50 to-teal-50 border border-blue-100 rounded-xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-start gap-3">
                    <div className="bg-blue-600 text-white p-2.5 rounded-lg flex-shrink-0"><Sparkles size={20} /></div>
                    <div>
                        <h3 className="font-bold text-gray-800">Catalog Learning</h3>
                        <p className="text-sm text-gray-600 mt-0.5 max-w-xl">
                            The catalog learns from how each item is used — supplier quotations (imported Excel) and every
                            project BOM that carries a price. Items below show what the market has been quoting.
                        </p>
                    </div>
                </div>
                <button
                    onClick={refresh}
                    className="flex items-center gap-2 bg-white border border-blue-200 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-50 text-sm font-semibold"
                >
                    <RefreshCw size={16} /> Rescan projects & suppliers
                </button>
            </div>

            {/* Learned price intelligence */}
            {sortedInsights.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <TrendingUp size={16} className="text-teal-600" />
                            <h4 className="font-semibold text-gray-800">Learned pricing ({sortedInsights.length})</h4>
                        </div>
                        <span className="text-xs text-gray-500">Lowest price seen across projects & supplier quotes</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-gray-50/60">
                                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Item</th>
                                    <th className="text-right px-4 py-2 font-semibold text-gray-600">Seen</th>
                                    <th className="text-right px-4 py-2 font-semibold text-gray-600">Best</th>
                                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Range</th>
                                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Supplier(s)</th>
                                    <th className="text-center px-4 py-2 font-semibold text-gray-600 w-28">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedInsights.map(ins => (
                                    <tr key={ins.key} className="border-b last:border-b-0 hover:bg-gray-50">
                                        <td className="px-4 py-2 font-medium text-gray-800 max-w-[22rem] truncate">{ins.name}</td>
                                        <td className="px-4 py-2 text-right text-gray-600">{ins.count}</td>
                                        <td className="px-4 py-2 text-right font-mono text-teal-700 font-semibold">
                                            {formatCurrency(ins.best)}{ins.unit ? ` / ${ins.unit}` : ''}
                                        </td>
                                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                                            {ins.range ? `${formatCurrency(ins.range[0])} – ${formatCurrency(ins.range[1])}` : '—'}
                                        </td>
                                        <td className="px-4 py-2 text-gray-500 text-xs">
                                            {ins.suppliers.length
                                                ? ins.suppliers.map(s => s.name).slice(0, 2).join(', ') + (ins.suppliers.length > 2 ? ` +${ins.suppliers.length - 2}` : '')
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <button
                                                onClick={() => apply(ins)}
                                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                                    applied[ins.key]
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'
                                                }`}
                                            >
                                                {applied[ins.key] ? <Check size={14} /> : <Check size={14} />}
                                                {applied[ins.key] ? `Applied ${formatCurrency(applied[ins.key])}` : 'Apply best price'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* The classic editor */}
            <ItemDatabase catalog={catalog} setCatalog={setCatalog} />
        </div>
    );
};

export default CatalogTab;
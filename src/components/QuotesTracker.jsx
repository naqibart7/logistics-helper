/**
 * QuotesTracker — per-project supplier quotation tracker.
 *
 * Stores a list of quote requests against suppliers:
 *     { id, supplierId, status, price, notes, requestedAt }
 * Status pipeline: Requested → Received → Accepted / Rejected.
 * Pure presentational component — all state lives in the parent project.
 */
import React from 'react';
import { Plus, Trash2, FileText, CheckCircle, Clock, XCircle } from 'lucide-react';
import { generateId } from '../utils/helpers';
import { formatCurrency } from '../utils/pdfParser';

const STATUSES = ['Requested', 'Received', 'Accepted', 'Rejected'];

const statusStyles = {
    Requested: 'bg-amber-100 text-amber-800 border-amber-200',
    Received: 'bg-blue-100 text-blue-800 border-blue-200',
    Accepted: 'bg-green-100 text-green-800 border-green-200',
    Rejected: 'bg-red-100 text-red-800 border-red-200',
};

const statusIcons = {
    Requested: Clock,
    Received: FileText,
    Accepted: CheckCircle,
    Rejected: XCircle,
};

const QuotesTracker = ({ quotes = [], suppliers = [], onChange }) => {
    const addQuote = () => {
        onChange([
            ...quotes,
            {
                id: generateId(),
                supplierId: suppliers[0]?.id || '',
                status: 'Requested',
                price: '',
                notes: '',
                requestedAt: new Date().toISOString().split('T')[0],
            },
        ]);
    };

    const updateQuote = (id, patch) => {
        onChange(quotes.map(q => (q.id === id ? { ...q, ...patch } : q)));
    };

    const removeQuote = (id) => {
        if (window.confirm('Remove this quote request?')) {
            onChange(quotes.filter(q => q.id !== id));
        }
    };

    const supplierName = (id) => {
        const s = suppliers.find(sup => String(sup.id) === String(id));
        return s ? s.name : '—';
    };

    const acceptedTotal = quotes
        .filter(q => q.status === 'Accepted' && parseFloat(q.price) > 0)
        .reduce((sum, q) => sum + parseFloat(q.price), 0);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="font-semibold text-lg">Quotes</h4>
                    <p className="text-xs text-gray-500">
                        Track supplier quotations for this project
                        {quotes.length > 0 && ` • Accepted total: ${formatCurrency(acceptedTotal)}`}
                    </p>
                </div>
                <button
                    onClick={addQuote}
                    disabled={suppliers.length === 0}
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1.5 text-sm font-semibold"
                >
                    <Plus size={16} /> Request Quote
                </button>
            </div>

            {quotes.length === 0 ? (
                <p className="text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                    No quotes yet. Click "Request Quote" to ask a supplier for pricing.
                </p>
            ) : (
                <div className="space-y-2">
                    {quotes.map(quote => {
                        const StatusIcon = statusIcons[quote.status] || Clock;
                        return (
                            <div key={quote.id} className="border border-gray-200 rounded-xl p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-white">
                                <div className="md:col-span-3">
                                    <select
                                        value={quote.supplierId}
                                        onChange={e => updateQuote(quote.id, { supplierId: e.target.value })}
                                        className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
                                    >
                                        <option value="">Select supplier...</option>
                                        {suppliers.map(sup => (
                                            <option key={sup.id} value={sup.id}>{sup.name}</option>
                                        ))}
                                    </select>
                                    <div className="text-xs text-gray-400 mt-1 truncate">{supplierName(quote.supplierId)}</div>
                                </div>
                                <div className="md:col-span-2">
                                    <select
                                        value={quote.status}
                                        onChange={e => updateQuote(quote.id, { status: e.target.value })}
                                        className={`w-full border rounded-lg px-2 py-1.5 text-xs font-semibold ${statusStyles[quote.status] || 'bg-white'}`}
                                    >
                                        {STATUSES.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={quote.price}
                                        onChange={e => updateQuote(quote.id, { price: e.target.value })}
                                        placeholder="Price (RM)"
                                        className="w-full border rounded-lg px-2 py-1.5 text-sm font-mono"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <input
                                        type="date"
                                        value={quote.requestedAt || ''}
                                        onChange={e => updateQuote(quote.id, { requestedAt: e.target.value })}
                                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <input
                                        value={quote.notes || ''}
                                        onChange={e => updateQuote(quote.id, { notes: e.target.value })}
                                        placeholder="Notes"
                                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                                    />
                                </div>
                                <div className="md:col-span-1 flex justify-end">
                                    <button
                                        onClick={() => removeQuote(quote.id)}
                                        className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                                        title="Remove quote"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default QuotesTracker;

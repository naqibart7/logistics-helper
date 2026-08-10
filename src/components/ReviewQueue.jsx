/**
 * ReviewQueue — the human-in-the-loop "Needs Review" panel.
 *
 * Lists every out-of-distribution row the parser refused to guess. Each row
 * has an inline "corrected name" input; Resolve &. Learn records the KB
 * correction (so the same supplier+text never needs review again) and audits
 * with a live ✓ toast. Discard drops noise rows with one tap.
 */
import React, { useState } from 'react';
import { AlertTriangle, Check, Trash2, XCircle, BookOpen } from 'lucide-react';
import {
    getReviewQueue,
    reviewQueueCount,
    resolveReviewRow,
    discardReviewRow,
    clearReviewQueue,
} from '../utils/reviewQueue';

const ReviewQueue = ({ onChange }) => {
    const [rows, setRows] = useState(getReviewQueue());
    const [drafts, setDrafts] = useState({});
    const [flash, setFlash] = useState('');
    const [cleared, setCleared] = useState(false);

    const refresh = (next) => {
        setRows(next);
        if (onChange) onChange();
    };

    const flashMsg = (msg) => {
        setFlash(msg);
        setTimeout(() => setFlash(''), 1600);
    };

    const resolve = (row) => {
        const corrected = (drafts[row.key] || '').trim() ||
            (row.item === 'Unknown Item' ? '' : row.item);
        if (!corrected) {
            flashMsg('Enter a corrected item name first');
            return;
        }
        resolveReviewRow(row.key, corrected);
        flashMsg(`✓ Learned "${corrected}" — future imports skip review`);
        refresh(getReviewQueue());
        setDrafts(prev => {
            const n = { ...prev };
            delete n[row.key];
            return n;
        });
    };

    const discard = (row) => {
        discardReviewRow(row.key);
        refresh(getReviewQueue());
    };

    const clearAll = () => {
        clearReviewQueue();
        setCleared(true);
        refresh(getReviewQueue());
        setTimeout(() => setCleared(false), 1500);
    };

    return (
        <div className="max-w-4xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <AlertTriangle size={22} className="text-amber-500" /> Needs Review
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Rows below the parser's confidence threshold — nothing is dropped silently and no price is invented.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-semibold">
                        {rows.length} item{rows.length === 1 ? '' : 's'} in review
                    </span>
                    {rows.length > 0 && (
                        <button
                            onClick={clearAll}
                            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium"
                        >
                            <Trash2 size={15} className="inline mr-1 -mt-0.5" /> Clear all
                        </button>
                    )}
                </div>
            </div>

            {flash && (
                <div className="mb-4 px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium animate-in fade-in">
                    {flash}
                </div>
            )}

            {rows.length === 0 ? (
                <div className="text-center py-14 px-6 border-2 border-dashed border-gray-200 rounded-2xl">
                    <div className="mx-auto w-14 h-14 rounded-full bg-green-50 text-green-500 flex items-center justify-center mb-3">
                        <Check size={26} />
                    </div>
                    <p className="font-semibold text-gray-700">Queue is clear</p>
                    <p className="text-sm text-gray-400 mt-1">
                        {cleared ? 'Reviewed everything — well done!' : 'No out-of-distribution rows waiting. Invoices that parse confidently never land here.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map(row => (
                        <div key={row.key} className="border border-amber-200 bg-amber-50/40 rounded-xl p-4 flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-mono text-sm text-gray-800 break-words">{row.original}</p>
                                    <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span className="font-medium text-amber-700">conf {Math.round((row.confidence || 0) * 100)}%</span>
                                        {row.supplier && <span>{row.supplier}</span>}
                                        <span>{row.source}</span>
                                    </p>
                                </div>
                                <button
                                    onClick={() => discard(row)}
                                    className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                                    title="Discard as noise"
                                >
                                    <XCircle size={18} />
                                </button>
                            </div>

                            <div className="flex gap-2">
                                <input
                                    value={drafts[row.key] ?? ''}
                                    onChange={e => setDrafts(prev => ({ ...prev, [row.key]: e.target.value }))}
                                    placeholder={row.item === 'Unknown Item' ? 'Corrected item name…' : `As catalog: ${row.item} (edit to override)`}
                                    className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                />
                                <button
                                    onClick={() => resolve(row)}
                                    className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 flex items-center gap-1.5"
                                >
                                    <BookOpen size={15} /> Resolve &. Learn
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ReviewQueue;
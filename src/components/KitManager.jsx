/**
 * KitManager — create / edit / duplicate / hide quick kits.
 *
 * Rendered inside the CatalogPicker modal. Two views:
 *   • list  — every effective kit (defaults + custom) with edit / duplicate /
 *             reset / hide actions and a "New kit" button.
 *   • edit  — a single kit editor: name, emoji, main category, and its item
 *             rows. Items are added by searching the current catalog (so kit
 *             items always resolve) or by free-typed custom rows.
 */
import React, { useState, useMemo } from 'react';
import {
    ArrowLeft, Plus, Trash2, X, Save, Copy, RotateCcw,
    Pencil, EyeOff, Search, Package,
} from 'lucide-react';
import { CATEGORY_TREE, buildCatalogHierarchy, flattenHierarchy } from '../data/catalogHierarchy';

const EMOJIS = ['🧱', '🎨', '💡', '🔌', '🛡️', '📦', '🪚', '🧰', '🏗️', '🪑'];

const emptyDraft = (id) => ({
    id: id || null,
    name: '',
    emoji: '📦',
    main: 'drywall',
    items: [],
    fromDefault: false,
    customized: false,
});

const KitManager = ({ catalog, kits, onClose, addKit, updateKit, removeKit, resetKit }) => {
    const flatItems = useMemo(() => flattenHierarchy(buildCatalogHierarchy(catalog)), [catalog]);

    const [view, setView] = useState('list');
    const [draft, setDraft] = useState(null);
    const [addQuery, setAddQuery] = useState('');

    const mainOptions = CATEGORY_TREE.map(m => ({ id: m.id, label: m.label }));

    const patch = (part) => setDraft(d => ({ ...d, ...part }));
    const patchItem = (index, part) =>
        setDraft(d => ({
            ...d,
            items: d.items.map((it, i) => (i === index ? { ...it, ...part } : it)),
        }));

    const matched = useMemo(() => {
        const q = addQuery.trim().toLowerCase();
        if (!q) return [];
        return flatItems.filter(i => i.name.toLowerCase().includes(q)).slice(0, 12);
    }, [addQuery, flatItems]);

    const addByName = (name) => {
        if (!name.trim()) return;
        const exists = draft.items.some(it => it.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (exists) return;
        patch({ items: [...draft.items, { name: name.trim(), qty: 1 }] });
        setAddQuery('');
    };

    const startCreate = () => { setDraft(emptyDraft(null)); setView('edit'); };
    const startEdit = (kit) => { setDraft({ ...kit }); setView('edit'); };

    const saveDraft = () => {
        if (!draft || !draft.name.trim()) return;
        const clean = {
            id: draft.id,
            name: draft.name.trim(),
            emoji: draft.emoji || '📦',
            main: draft.main,
            items: draft.items.filter(it => it.name.trim() && Number(it.qty) > 0)
                .map(it => ({ name: it.name.trim(), qty: Number(it.qty) || 0 })),
        };
        if (clean.items.length === 0) {
            alert('Add at least one item with a quantity.');
            return;
        }
        if (clean.id) updateKit(clean);
        else addKit(clean);
        setView('list');
        setDraft(null);
    };

    const duplicate = (kit) => {
        addKit({
            name: `${kit.name} (copy)`,
            emoji: kit.emoji || '📦',
            main: kit.main || 'drywall',
            items: kit.items.map(it => ({ ...it })),
        });
    };

    return (
        <div className="flex flex-col gap-4 max-h-[75vh]">
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 shrink-0">
                {view === 'edit' ? (
                    <button
                        onClick={() => { setView('list'); setDraft(null); setAddQuery(''); }}
                        className="shrink-0 w-10 h-10 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600"
                        aria-label="Back to kit list"
                    >
                        <ArrowLeft size={20} />
                    </button>
                ) : null}
                <div className="flex-1">
                    <p className="font-bold text-gray-800">
                        {view === 'list' ? 'Manage Quick Kits' : draft?.id ? 'Edit Kit' : 'New Kit'}
                    </p>
                    <p className="text-xs text-gray-400">
                        {view === 'list'
                            ? `${kits.length} kit${kits.length === 1 ? '' : 's'} · saved on this device`
                            : 'These items & quantities are added in one tap'}
                    </p>
                </div>
                {view === 'list' && (
                    <button
                        onClick={onClose}
                        className="shrink-0 w-10 h-10 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* ── Body ───────────────────────────────────────────────── */}
            <div className="overflow-y-auto flex-1 pr-1 -mr-1">
                {view === 'edit' && draft ? (
                    <div className="space-y-4">
                        {/* Identity */}
                        <div className="grid grid-cols-3 gap-2">
                            <input
                                value={draft.emoji}
                                onChange={e => patch({ emoji: e.target.value })}
                                className="col-span-1 border rounded-lg px-3 py-2 text-center text-lg font-bold"
                                aria-label="Kit emoji"
                            />
                            <input
                                value={draft.name}
                                onChange={e => patch({ name: e.target.value })}
                                placeholder="Kit name"
                                className="col-span-2 border rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {EMOJIS.map(e => (
                                <button
                                    key={e}
                                    onClick={() => patch({ emoji: e })}
                                    className={`w-9 h-9 rounded-lg text-lg border ${draft.emoji === e ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                >
                                    {e}
                                </button>
                            ))}
                        </div>
                        <select
                            value={draft.main}
                            onChange={e => patch({ main: e.target.value })}
                            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                        >
                            {mainOptions.map(m => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                        </select>

                        {/* Items */}
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                                Kit items ({draft.items.length})
                            </p>
                            {draft.items.length === 0 ? (
                                <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl px-3 py-4 text-center">
                                    No items yet — search the catalog below or type a name.
                                </p>
                            ) : (
                                <div className="space-y-2 mb-3">
                                    {draft.items.map((it, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <input
                                                value={it.name}
                                                onChange={e => patchItem(i, { name: e.target.value })}
                                                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                                                aria-label={`Item ${i + 1} name`}
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                value={it.qty}
                                                onChange={e => patchItem(i, { qty: e.target.value })}
                                                className="w-20 border rounded-lg px-2 py-2 text-sm text-right font-mono"
                                                aria-label={`Item ${i + 1} quantity`}
                                            />
                                            <button
                                                onClick={() => patch({ items: draft.items.filter((_, x) => x !== i) })}
                                                className="w-9 h-9 rounded-lg border border-gray-200 hover:bg-red-50 hover:text-red-600 text-gray-500 flex items-center justify-center"
                                                aria-label="Remove item"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add-item search */}
                            <div className="relative">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={addQuery}
                                    onChange={e => setAddQuery(e.target.value)}
                                    placeholder="Search catalog to add an item…"
                                    className="w-full border rounded-lg pl-9 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            {addQuery.trim() ? (
                                <div className="mt-2 border rounded-xl bg-white shadow-sm overflow-hidden">
                                    {matched.length === 0 && (
                                        <button
                                            onClick={() => addByName(addQuery)}
                                            className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                                        >
                                            <Plus size={16} className="text-blue-600" />
                                            Add “{addQuery.trim()}” as a custom item
                                        </button>
                                    )}
                                    {matched.map(m => (
                                        <button
                                            key={m.key}
                                            onClick={() => addByName(m.name)}
                                            className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2 border-t border-gray-100"
                                        >
                                            <Package size={15} className="text-gray-400 shrink-0" />
                                            <span className="flex-1 truncate">{m.name}</span>
                                            <span className="text-xs text-gray-400 shrink-0">{m.subLabel}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <button
                            onClick={startCreate}
                            className="w-full p-4 rounded-xl border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2 font-semibold transition-colors"
                        >
                            <Plus size={18} /> New kit
                        </button>
                        {kits.map(kit => {
                            const resolved = (kit.items || []).length;
                            return (
                                <div
                                    key={kit.id}
                                    className="border border-gray-200 rounded-xl p-3 flex items-center gap-3"
                                >
                                    <span className="text-2xl shrink-0">{kit.emoji || '📦'}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{kit.name}</p>
                                        <p className="text-xs text-gray-400">
                                            {resolved} item{resolved === 1 ? '' : 's'}
                                            {kit.fromDefault
                                                ? kit.customized
                                                    ? ' · edited'
                                                    : ' · default'
                                                : ' · custom'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => startEdit(kit)}
                                            className="w-9 h-9 rounded-lg border border-gray-200 hover:bg-blue-50 text-gray-600 flex items-center justify-center"
                                            aria-label="Edit kit"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            onClick={() => duplicate(kit)}
                                            className="w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 flex items-center justify-center"
                                            aria-label="Duplicate kit"
                                        >
                                            <Copy size={16} />
                                        </button>
                                        {kit.fromDefault && kit.customized && (
                                            <button
                                                onClick={() => resetKit(kit.id)}
                                                className="w-9 h-9 rounded-lg border border-gray-200 hover:bg-amber-50 text-amber-600 flex items-center justify-center"
                                                aria-label="Reset to default"
                                            >
                                                <RotateCcw size={16} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => removeKit(kit.id)}
                                            className={`w-9 h-9 rounded-lg border flex items-center justify-center ${kit.fromDefault && !kit.customized
                                                ? 'border-gray-200 hover:bg-gray-50 text-gray-400'
                                                : 'border-gray-200 hover:bg-red-50 hover:text-red-600 text-gray-500'}`}
                                            aria-label={kit.fromDefault ? 'Hide kit' : 'Delete kit'}
                                        >
                                            {kit.fromDefault && !kit.customized ? <EyeOff size={16} /> : <Trash2 size={16} />}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Footer ─────────────────────────────────────────────── */}
            {view === 'edit' && (
                <div className="shrink-0 border-t bg-white pt-3 flex items-center gap-3">
                    <button
                        onClick={() => { setView('list'); setDraft(null); setAddQuery(''); }}
                        className="px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={saveDraft}
                        className="flex-1 bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 font-semibold shadow-sm active:scale-95 transition-transform"
                    >
                        <Save size={18} /> Save Kit
                    </button>
                </div>
            )}

            {view === 'list' && (
                <div className="shrink-0 border-t bg-white pt-3">
                    <button
                        onClick={onClose}
                        className="w-full bg-gray-100 text-gray-700 px-6 py-2.5 rounded-lg hover:bg-gray-200 font-semibold"
                    >
                        Done
                    </button>
                </div>
            )}
        </div>
    );
};

export default KitManager;
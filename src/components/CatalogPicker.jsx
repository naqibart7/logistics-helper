/**
 * CatalogPicker — click-first, hierarchical "Add from Catalog" picker.
 *
 * A site supervisor builds a BOM almost entirely by tapping:
 *   Main category → Sub-category → [+qty / presets] → Add to BOM
 *
 * It derives the hierarchy from the pressed flat catalog (so user-added items
 * and prices always appear), supports one-tap Quick Kits, and shows a live
 * running total of the queue in a sticky bottom bar before a single commit.
 */
import React, { useState, useMemo } from 'react';
import {
    Layers, Package, LayoutGrid, PaintRoller, Hammer, Lightbulb, Droplets,
    HardHat, Wrench, Shield, Truck, Sofa, Gift, Users,
    Search, Plus, Minus, ChevronRight, ArrowLeft, ShoppingCart,
    Trash2, Sparkles,
} from 'lucide-react';
import { generateId } from '../utils/helpers';
import { formatCurrency } from '../utils/pdfParser';
import { buildCatalogHierarchy, flattenHierarchy, resolveKit, QUICK_KITS } from '../data/catalogHierarchy';
import { getCatalogInsights } from '../utils/catalogLearning';

const learnKey = (s) => String(s || '').toLowerCase();

const ICONS = {
    Layers, Package, LayoutGrid, PaintRoller, Hammer, Lightbulb, Droplets,
    HardHat, Wrench, Shield, Truck, Sofa, Gift, Users,
};

const PRESETS = [5, 10, 20, 50];

const makeMaterial = (item, qty) => ({
    id: generateId(),
    category: item.mainLabel || item.category || 'Materials',
    item: item.name,
    quantity: qty,
    unit: item.unit || 'pcs',
    pricePerUnit: Number(item.price) || 0,
    price: qty * (Number(item.price) || 0),
    total: qty * (Number(item.price) || 0),
    fromCatalog: true,
    catalogSub: item.subLabel || '',
    brand: item.brand || '',
    code: item.code || '',
    size: item.size || '',
    colour: item.colour || '',
});

/**
 * One catalog item card (hoisted to module scope so the picker never remounts
 * it — defining components inside render creates a new type each render).
 */
const ItemCard = ({ item, qty, learn, onMinus, onPlus, onSetOne, onPreset }) => {
    const price = Number(item.price) || 0;
    const cheaper = learn && learn.best && learn.best > 0 && (price === 0 || learn.best < price);
    return (
        <div className={`border rounded-xl p-3 flex flex-col gap-2 bg-white transition-colors ${qty > 0 ? 'border-green-400 ring-2 ring-green-100' : 'border-gray-200'}`}>
            <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2 min-h-[2.5rem]">{item.name}</p>
            {item.brand || item.code ? (
                <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">
                    {[item.brand, item.code].filter(Boolean).join(' · ')}
                </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    {price ? `${formatCurrency(price)} / ${item.unit || 'pcs'}` : 'No price'}
                </span>
                {learn && learn.best > 0 && (
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${cheaper ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                        Best seen {formatCurrency(learn.best)}{cheaper ? ' ↓' : ''} · {learn.count}×
                    </span>
                )}
            </div>

            <div className="flex items-center gap-1.5 mt-auto pt-1">
                <button
                    onClick={onMinus}
                    disabled={qty === 0}
                    className="w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Decrease quantity"
                >
                    <Minus size={16} />
                </button>
                <button
                    onClick={onSetOne}
                    className="h-9 min-w-[2.5rem] px-2 rounded-lg bg-gray-100 hover:bg-gray-200 font-mono text-sm font-bold flex items-center justify-center"
                    aria-label={qty === 0 ? 'Add one' : `Set quantity ${qty + 1}`}
                >
                    {qty || '+'}
                </button>
                <button
                    onClick={onPlus}
                    className="w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 flex items-center justify-center"
                    aria-label="Increase quantity"
                >
                    <Plus size={16} />
                </button>
                <div className="ml-auto flex gap-1">
                    {PRESETS.map(p => (
                        <button
                            key={p}
                            onClick={() => onPreset(p)}
                            className={`px-2 py-1 rounded-md text-xs font-semibold border ${
                                qty === p ? 'bg-green-600 text-white border-green-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                            }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

/**
 * Quick-add form shown when a sub-category has no set items yet.
 */
const CustomItemForm = ({ mainLabel, subLabel, onAdd }) => {
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const add = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const p = parseFloat(price) || 0;
        const item = { key: `custom::${trimmed}`, name: trimmed, price: p, mainLabel, subLabel, category: mainLabel };
        const material = { ...makeMaterial(item, 1), category: mainLabel };
        onAdd(material);
        setName('');
        setPrice('');
    };
    return (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">No set items here yet — add one quickly</p>
            <div className="flex gap-2">
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Item name"
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                />
                <input
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="RM"
                    inputMode="decimal"
                    className="w-20 border rounded-lg px-3 py-2 text-sm"
                />
                <button onClick={add} className="bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700 text-sm font-semibold">
                    Add
                </button>
            </div>
        </div>
    );
};

const CatalogPicker = ({ catalog, onAdd }) => {
    const hierarchy = useMemo(() => buildCatalogHierarchy(catalog), [catalog]);
    const flatItems = useMemo(() => flattenHierarchy(hierarchy), [hierarchy]);
    const learns = useMemo(() => {
        const map = {};
        getCatalogInsights().forEach(i => { map[learnKey(i.name)] = i; });
        return map;
    }, []);

    const [search, setSearch] = useState('');
    const [mainId, setMainId] = useState(null);
    const [subId, setSubId] = useState(null);
    const [cart, setCart] = useState({});
    const [addedKits, setAddedKits] = useState({});

    const activeMain = mainId ? hierarchy.find(m => m.id === mainId) : null;
    const activeSub = activeMain ? activeMain.subs.find(s => s.id === subId) : null;

    // ─── Cart ops ─────────────────────────────────────────────────────────────
    const bump = (item, delta) => {
        setCart(prev => {
            const next = { ...prev };
            const cur = next[item.key] || { item, qty: 0 };
            const qty = cur.qty + delta;
            if (qty <= 0) delete next[item.key];
            else next[item.key] = { item, qty };
            return next;
        });
    };
    const setPreset = (item, qty) => {
        setCart(prev => ({ ...prev, [item.key]: { item, qty } }));
    };

    const commitCart = () => {
        Object.values(cart).forEach(({ item, qty }) => onAdd(makeMaterial(item, qty)));
        setCart({});
    };

    const applyKit = (kit) => {
        resolveKit(kit, catalog || []).forEach(({ item, qty }) => onAdd(makeMaterial(item, qty)));
        setAddedKits(prev => ({ ...prev, [kit.id]: true }));
        setTimeout(() => setAddedKits(prev => ({ ...prev, [kit.id]: false })), 1400);
    };

    // ─── Derived ──────────────────────────────────────────────────────────────
    const cartItems = Object.values(cart);
    const cartCount = cartItems.reduce((n, c) => n + c.qty, 0);
    const cartTotal = cartItems.reduce((s, c) => s + c.qty * (Number(c.item.price) || 0), 0);
    const searching = !!search.trim();

    const searchGroups = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return null;
        const groups = {};
        flatItems
            .filter(i =>
                i.name.toLowerCase().includes(q) ||
                i.mainLabel.toLowerCase().includes(q) ||
                i.subLabel.toLowerCase().includes(q) ||
                String(i.price).toLowerCase().includes(q)
            )
            .slice(0, 300)
            .forEach(item => (groups[item.mainId] = groups[item.mainId] || []).push(item));
        return groups;
    }, [search, flatItems]);

    return (
        <div className="flex flex-col gap-4 max-h-[75vh]">
            {/* ── Sticky top: back + search + close ─────────────────────────── */}
            <div className="flex items-center gap-3 shrink-0">
                {activeMain && !searching && (
                    <button
                        onClick={() => { setMainId(null); setSubId(null); }}
                        className="shrink-0 w-10 h-10 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600"
                        aria-label="Back to categories"
                    >
                        <ArrowLeft size={20} />
                    </button>
                )}
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search}
                        onChange={e => { setSearch(e.target.value); if (e.target.value) { setMainId(null); setSubId(null); } }}
                        placeholder="Search items, categories, prices…"
                        className="w-full border rounded-lg pl-9 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 pr-1 -mr-1">
                {searching ? (
                    Object.keys(searchGroups || {}).length === 0 ? (
                        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                            <p className="font-medium">No matches for “{search}”</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {Object.entries(searchGroups).map(([mainIdKey, items]) => {
                                const main = hierarchy.find(m => m.id === mainIdKey);
                                return (
                                    <div key={mainIdKey}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{main?.label || mainIdKey}</span>
                                            <span className="text-[11px] text-gray-400">{items.length}</span>
                                        </div>
                                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                                            {items.map(i => (
                                                <ItemCard key={i.key} item={i} qty={cart[i.key]?.qty || 0}
                                                    learn={learns[learnKey(i.name)]}
                                                    onMinus={() => bump(i, -1)} onPlus={() => bump(i, 1)}
                                                    onSetOne={() => setPreset(i, (cart[i.key]?.qty || 0) + 1)} onPreset={(p) => setPreset(i, p)} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : activeMain ? (
                    activeSub ? (
                        activeSub.items.length === 0 ? (
                            <CustomItemForm mainLabel={activeMain.label} subLabel={activeSub.label} onAdd={onAdd} />
                        ) : (
                            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                                {activeSub.items.map(item => (
                                    <ItemCard key={item.key} item={item} qty={cart[item.key]?.qty || 0}
                                        learn={learns[learnKey(item.name)]}
                                        onMinus={() => bump(item, -1)} onPlus={() => bump(item, 1)}
                                        onSetOne={() => setPreset(item, (cart[item.key]?.qty || 0) + 1)} onPreset={(p) => setPreset(item, p)} />
                                ))}
                            </div>
                        )
                    ) : (
                        <>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{activeMain.label}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {activeMain.subs.map(sub => (
                                    <button
                                        key={sub.id}
                                        onClick={() => setSubId(sub.id)}
                                        className="p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-left transition-colors"
                                    >
                                        <p className="text-sm font-semibold text-gray-800">{sub.label}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{sub.items.length} item{sub.items.length === 1 ? '' : 's'}</p>
                                    </button>
                                ))}
                            </div>
                        </>
                    )
                ) : (
                    <>
                        {/* Quick Kits */}
                        {QUICK_KITS.length > 0 && (
                            <div className="mb-5">
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles size={15} className="text-amber-500" />
                                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Quick Kits</span>
                                </div>
                                <div className="flex gap-3 overflow-x-auto pb-1">
                                    {QUICK_KITS.map(kit => {
                                        const resolved = Math.max(0, resolveKit(kit, catalog || []).length);
                                        const done = addedKits[kit.id];
                                        return (
                                            <button
                                                key={kit.id}
                                                onClick={() => applyKit(kit)}
                                                disabled={resolved === 0 || done}
                                                className={`shrink-0 w-40 rounded-xl border p-3 text-left transition-colors flex flex-col gap-1.5 ${
                                                    done ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-green-400 hover:bg-green-50'
                                                }`}
                                            >
                                                <span className="text-xl">{kit.emoji}</span>
                                                <span className="text-sm font-semibold text-gray-800 leading-tight">{kit.name}</span>
                                                <span className="text-xs text-gray-400">{done ? '✓ Added' : `${resolved} items · one tap`}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Main categories */}
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Browse by category</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {hierarchy.map(main => {
                                const count = main.subs.reduce((s, sub) => s + sub.items.length, 0);
                                const Icon = ICONS[main.icon] || Package;
                                return (
                                    <button
                                        key={main.id}
                                        onClick={() => { setMainId(main.id); setSubId(null); }}
                                        disabled={count === 0}
                                        className={`p-4 rounded-xl border flex flex-col items-start gap-2 text-left transition-colors ${count === 0
                                            ? 'border-gray-100 bg-gray-50 opacity-60 cursor-default'
                                            : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50 hover:shadow-sm'}`}
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                                            <Icon size={20} />
                                        </div>
                                        <p className="text-sm font-semibold text-gray-800 leading-tight">{main.label}</p>
                                        <p className="text-xs text-gray-400">{count} item{count === 1 ? '' : 's'}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* ── Sticky cart bar ────────────────────────────────────────────── */}
            {cartCount > 0 && (
                <div className="shrink-0 border-t bg-white pt-3 flex items-center gap-3">
                    <div className="flex-1">
                        <p className="font-bold text-gray-800">{cartCount} item{cartCount === 1 ? '' : 's'}</p>
                        <p className="text-sm text-gray-500">{formatCurrency(cartTotal)} est.</p>
                    </div>
                    <button
                        onClick={() => setCart({})}
                        className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
                        aria-label="Clear cart"
                    >
                        <Trash2 size={18} />
                    </button>
                    <button
                        onClick={commitCart}
                        className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 flex items-center gap-2 font-semibold shadow-sm active:scale-95 transition-transform"
                    >
                        <ShoppingCart size={18} /> Add {cartCount} items
                    </button>
                </div>
            )}
        </div>
    );
};

export default CatalogPicker;
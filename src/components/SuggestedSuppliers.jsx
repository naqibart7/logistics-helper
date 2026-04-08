import React, { useState, useMemo, useCallback } from 'react';
import {
    MessageCircle, Copy, CheckCircle, ChevronDown, ChevronUp,
    Package, ExternalLink, AlertCircle, Star, Zap, Edit3,
    RotateCcw, Phone, MapPin, Hash, Eye, EyeOff
} from 'lucide-react';
import { CATEGORY_KEYWORDS } from '../data/initialData';

// ─── WhatsApp message templates per category ──────────────────────────────────
const WHATSAPP_TEMPLATES = {
    'Gypsum Board': {
        icon: '🏗️',
        intro: 'Hi, nak tanya stok & order barang partition/gypsum ni ya:',
        requests: ['Ada stock board & metal stud?', 'Boleh hantar lori hantu/site?', 'Minta Best Price/Quotation ya 🙏']
    },
    'Paint': {
        icon: '🎨',
        intro: 'Hi, nak order cat/paint items ni ya:',
        requests: ['Ada stock code ni?', 'Boleh mix/bancuh harini?', 'Minta Quotation/Invoice ya 🙏']
    },
    'Lighting': {
        icon: '💡',
        intro: 'Hi, nak tanya quotation untuk lighting items ni:',
        requests: ['Ada stock item ni?', 'Item ni ada warranty?', 'Minta Quo/Best Price ya 🙏']
    },
    'LED Strip': {
        icon: '✨',
        intro: 'Hi, nak order LED strip items ni ya:',
        requests: ['Ada stock warna/spec ni?', 'Boleh potong custom length?', 'Minta Quotation ya 🙏']
    },
    'PVC Panel': {
        icon: '🪵',
        intro: 'Hi, nak order PVC/Fluted panel ni ya:',
        requests: ['Ada stock code & warna ni?', 'Boleh hantar ke site?', 'Minta Quotation ya 🙏']
    },
    'Acrylic Panel': {
        icon: '🔲',
        intro: 'Hi, nak order acrylic panel items ni:',
        requests: ['Ada stock thickness & warna ni?', 'Boleh laser cut/fabricate?', 'Minta Quotation ya 🙏']
    },
    'Hardware Tools': {
        icon: '🛠️',
        intro: 'Hi, nak order hardware items ni ya:',
        requests: ['Ada stock item ni?', 'Boleh hantar urgent/grab?', 'Minta Quotation/Invoice ya 🙏']
    },
    'Electrical': {
        icon: '🔌',
        intro: 'Hi, nak tanya quotation untuk barang elektrik ni:',
        requests: ['Ada stock item ni?', 'Item ni SIRIM approve?', 'Minta Quotation ya 🙏']
    },
    'Banner': {
        icon: '🖼️',
        intro: 'Hi, nak order banner/printing items ni ya:',
        requests: ['Ada slot print harini/esok?', 'Minta spec file (bleed, DPI)?', 'Minta Quotation ya 🙏']
    },
    '_default': {
        icon: '🟦',
        intro: 'Hi, nak order item-item ni ya:',
        requests: ['Ada stock item?', 'Boleh hantar ke site?', 'Minta bil harga / Quotation (PDF) ya 🙏']
    }
};

// ─── Score + match items for a supplier ──────────────────────────────────────
function scoreSupplier(supplier, materials) {
    const matchedItems = [];
    const matchedIds = new Set();

    materials.forEach(m => {
        const text = (m.item + ' ' + m.category).toLowerCase();
        const hit = supplier.categories.some(cat => {
            const keywords = CATEGORY_KEYWORDS[cat] || [cat.toLowerCase()];
            return keywords.some(k => text.includes(k));
        });
        if (hit && !matchedIds.has(m.id)) {
            matchedIds.add(m.id);
            matchedItems.push(m);
        }
    });

    const score = materials.length > 0
        ? Math.round((matchedItems.length / materials.length) * 100)
        : 0;

    return { matchedItems, score };
}

// ─── Generate WA message text ─────────────────────────────────────────────────
function buildMessage(project, supplier, matchedItems) {
    if (matchedItems.length === 0) return '';

    const matchedCat = supplier.categories.find(c => WHATSAPP_TEMPLATES[c]) || '_default';
    const template = WHATSAPP_TEMPLATES[matchedCat] || WHATSAPP_TEMPLATES['_default'];

    const grouped = {};
    matchedItems.forEach(m => {
        const cat = m.category || 'Items';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(m);
    });

    const projectRef = project.projectNumber || project.quotationNumber || project.name || 'PROJECT';
    let msg = `${template.icon} *${projectRef}*\n`;
    msg += `${template.intro}\n\n`;

    Object.entries(grouped).forEach(([cat, items]) => {
        msg += `*${cat.toUpperCase()}:*\n`;
        items.forEach((item, i) => {
            msg += `${i + 1}. ${item.item}`;
            if (item.quantity && item.quantity !== '?') msg += ` - *${item.quantity} ${item.unit || ''}*`.trimEnd();
            msg += '\n';
        });
        msg += '\n';
    });

    if (project.deliveryAddress) msg += `📍 *Delivery:* ${project.deliveryAddress}\n`;
    if (project.needByDate) msg += `📅 *Need by:* ${project.needByDate}\n`;
    if (project.contactPerson) {
        msg += `👤 *Contact:* ${project.contactPerson}`;
        if (project.contactPhone) msg += ` (${project.contactPhone})`;
        msg += '\n';
    }

    msg += '\n*REQUEST:*\n';
    template.requests.forEach(req => { msg += `✅ ${req}\n`; });
    msg += 'Terima kasih 👍🏻';

    return msg;
}

// ─── Score badge ──────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
    const { bg, text, label } = score >= 70
        ? { bg: 'bg-green-100', text: 'text-green-700', label: 'Strong' }
        : score >= 40
            ? { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Partial' }
            : { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Low' };

    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${bg} ${text}`}>
            <Star size={11} />
            {score}% &middot; {label}
        </span>
    );
}

// ─── Category chip color ──────────────────────────────────────────────────────
function chipColor(cat) {
    if (['Gypsum Board', 'Cornice', 'Plaster'].includes(cat)) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (['Paint'].includes(cat)) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    if (['Lighting', 'LED Strip'].includes(cat)) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (['Electrical'].includes(cat)) return 'bg-red-50 text-red-700 border-red-200';
    if (['PVC Panel', 'Acrylic Panel'].includes(cat)) return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    if (['Hardware Tools', 'Fasteners'].includes(cat)) return 'bg-teal-50 text-teal-700 border-teal-200';
    if (['Banner', 'Bunting'].includes(cat)) return 'bg-pink-50 text-pink-700 border-pink-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
}

// ─── Single Supplier Card ─────────────────────────────────────────────────────
function SupplierResultCard({ supplier, matchedItems, score, project, rank }) {
    const [expanded, setExpanded] = useState(rank === 0);
    const [showPreview, setShowPreview] = useState(false);
    const [editedMsg, setEditedMsg] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [copied, setCopied] = useState(false);

    const rawMsg = useMemo(
        () => buildMessage(project, supplier, matchedItems),
        [project, supplier, matchedItems]
    );

    const handleOpenPreview = () => {
        setEditedMsg(rawMsg);
        setShowPreview(true);
        setEditMode(false);
    };

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(editedMsg || rawMsg);
            setCopied(true);
            setTimeout(() => setCopied(false), 2200);
        } catch { }
    }, [editedMsg, rawMsg]);

    const waNumber = supplier.whatsapp?.replace(/\D/g, '');
    const waLink = waNumber
        ? `https://wa.me/${waNumber}?text=${encodeURIComponent(rawMsg)}`
        : null;

    return (
        <div className={`rounded-xl border-2 transition-all duration-200 overflow-hidden ${expanded ? 'border-blue-300 shadow-md' : 'border-gray-200 hover:border-blue-200 hover:shadow-sm'}`}>

            {/* Header */}
            <button
                onClick={() => setExpanded(e => !e)}
                className={`w-full text-left px-5 py-4 flex items-start gap-4 transition-colors ${expanded ? 'bg-gradient-to-r from-blue-50 to-indigo-50' : 'bg-white hover:bg-gray-50'}`}
            >
                {/* Rank badge */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mt-0.5 ${rank === 0 ? 'bg-amber-400 text-white' : rank === 1 ? 'bg-gray-400 text-white' : rank === 2 ? 'bg-orange-300 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {rank + 1}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h5 className="font-bold text-gray-900 text-base leading-tight">{supplier.name}</h5>
                        {rank === 0 && (
                            <span className="text-[10px] bg-amber-400 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Best Match</span>
                        )}
                        <ScoreBadge score={score} />
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-gray-500">
                        <span className="flex items-center gap-1"><MapPin size={11} />{supplier.location}</span>
                        <span className="flex items-center gap-1"><Phone size={11} />{supplier.contact}</span>
                        {supplier.whatsapp && (
                            <span className="flex items-center gap-1 text-green-600 font-medium">
                                <MessageCircle size={11} /> WA Available
                            </span>
                        )}
                    </div>

                    {/* Coverage bar */}
                    <div className="mt-2.5 flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ${score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-400' : 'bg-gray-400'}`}
                                style={{ width: `${score}%` }}
                            />
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">
                            {matchedItems.length}/{project.materials.length} items
                        </span>
                    </div>
                </div>

                <div className="flex-shrink-0 text-gray-400 mt-1">
                    {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
            </button>

            {/* Expanded body */}
            {expanded && (
                <div className="px-5 pb-5 pt-3 bg-white border-t border-gray-100 space-y-4">

                    {/* Category chips */}
                    <div className="flex flex-wrap gap-1.5">
                        {supplier.categories.map((cat, idx) => (
                            <span key={idx} className={`px-2.5 py-1 text-xs font-medium rounded-full border ${chipColor(cat)}`}>
                                {cat}
                            </span>
                        ))}
                    </div>

                    {/* Matched items */}
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <CheckCircle size={12} className="text-green-500" />
                            Matched Items ({matchedItems.length})
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {matchedItems.map(m => (
                                <div key={m.id} className="flex items-center gap-2 text-sm bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
                                    <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                                    <span className="text-gray-800 truncate flex-1">{m.item}</span>
                                    <span className="text-xs text-gray-400 font-mono flex-shrink-0">
                                        {m.quantity} {m.unit || ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Message Preview */}
                    {showPreview && (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-100">
                                <span className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                                    <MessageCircle size={13} /> WhatsApp Message Preview
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => { setEditMode(e => !e); }}
                                        className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded font-semibold transition-colors ${editMode ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-50'}`}
                                    >
                                        <Edit3 size={10} /> {editMode ? 'Editing' : 'Edit'}
                                    </button>
                                    <button
                                        onClick={() => { setEditedMsg(rawMsg); setEditMode(false); }}
                                        className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1 rounded"
                                        title="Reset to original"
                                    >
                                        <RotateCcw size={10} /> Reset
                                    </button>
                                    <button
                                        onClick={() => setShowPreview(false)}
                                        className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-1 rounded hover:bg-gray-200"
                                    >✕</button>
                                </div>
                            </div>

                            {editMode ? (
                                <textarea
                                    value={editedMsg}
                                    onChange={e => setEditedMsg(e.target.value)}
                                    className="w-full text-xs font-mono p-4 bg-white resize-y min-h-[200px] focus:outline-none focus:ring-1 focus:ring-blue-300 border-0"
                                    rows={12}
                                />
                            ) : (
                                <pre className="text-xs text-gray-700 p-4 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                                    {editedMsg || rawMsg}
                                </pre>
                            )}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                            onClick={showPreview ? () => setShowPreview(false) : handleOpenPreview}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                            {showPreview ? 'Hide' : 'Preview'} Message
                        </button>

                        <button
                            onClick={handleCopy}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg transition-all active:scale-95 shadow-sm ${copied ? 'bg-green-600 text-white' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                        >
                            {copied ? <CheckCircle size={15} /> : <Copy size={15} />}
                            {copied ? 'Copied!' : 'Copy Message'}
                        </button>

                        {waLink && (
                            <a
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all active:scale-95 shadow-sm"
                            >
                                <MessageCircle size={15} />
                                Open WhatsApp
                                <ExternalLink size={11} className="opacity-70" />
                            </a>
                        )}

                        {(supplier.accountNumber || supplier.bankName) && (
                            <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                                <Hash size={11} />
                                {supplier.bankName} {supplier.accountNumber}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const SuggestedSuppliers = ({ project, suppliers }) => {
    const [showUnmatched, setShowUnmatched] = useState(false);

    const { ranked, unmatchedMaterials } = useMemo(() => {
        const matchedIds = new Set();

        const ranked = suppliers
            .map(sup => {
                const { matchedItems, score } = scoreSupplier(sup, project.materials);
                matchedItems.forEach(m => matchedIds.add(m.id));
                return { supplier: sup, matchedItems, score };
            })
            .filter(r => r.matchedItems.length > 0)
            .sort((a, b) => b.score - a.score || b.matchedItems.length - a.matchedItems.length);

        const unmatchedMaterials = project.materials.filter(m => !matchedIds.has(m.id));
        return { ranked, unmatchedMaterials };
    }, [project.materials, suppliers]);

    if (project.materials.length === 0) return null;

    return (
        <div className="space-y-4">
            {/* Section header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h4 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                        <Zap size={20} className="text-amber-500" />
                        Suggested Suppliers &amp; Messages
                    </h4>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {ranked.length} supplier{ranked.length !== 1 ? 's' : ''} matched &middot; ranked by item coverage
                    </p>
                </div>

                {unmatchedMaterials.length > 0 && (
                    <button
                        onClick={() => setShowUnmatched(u => !u)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors"
                    >
                        <AlertCircle size={13} />
                        {unmatchedMaterials.length} unmatched item{unmatchedMaterials.length > 1 ? 's' : ''}
                        {showUnmatched ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                )}
            </div>

            {/* Unmatched alert */}
            {showUnmatched && unmatchedMaterials.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-xs font-bold text-red-700 mb-2 uppercase tracking-wide">
                        Items with no supplier match — may need manual sourcing:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {unmatchedMaterials.map(m => (
                            <div key={m.id} className="flex items-center gap-2 text-sm text-red-800 bg-white rounded-lg border border-red-100 px-3 py-1.5">
                                <AlertCircle size={12} className="text-red-400 flex-shrink-0" />
                                <span className="truncate flex-1">{m.item}</span>
                                <span className="text-xs text-red-400 font-mono flex-shrink-0">{m.quantity} {m.unit || ''}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Supplier result cards */}
            {ranked.length > 0 ? (
                <div className="space-y-3">
                    {ranked.map(({ supplier, matchedItems, score }, idx) => (
                        <SupplierResultCard
                            key={supplier.id}
                            supplier={supplier}
                            matchedItems={matchedItems}
                            score={score}
                            project={project}
                            rank={idx}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                    <Package size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No matching suppliers found</p>
                    <p className="text-sm mt-1">Add suppliers with matching categories to see suggestions here.</p>
                </div>
            )}
        </div>
    );
};

export default SuggestedSuppliers;

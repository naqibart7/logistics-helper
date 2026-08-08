/**
 * Hierarchical catalog definition + matcher.
 *
 * The app's persisted catalog (`logisticsItemCatalog`) is a flat list of
 * `{ name, price, category }`. This module derives a 3-level structure
 * (Main → Sub → Items) from that flat list using the exact hierarchy below, so
 * every existing item (and any user-added item) is preserved, priced, and
 * discoverable without hand-maintaining a second catalog.
 *
 * Matching is keyword-based (case-insensitive substring over the item name plus
 * the legacy `category` field). Items that match nothing fall back into a
 * sensible sub-category of their legacy category so nothing is ever stranded.
 */
import { enrichItem } from '../utils/catalogEnrich.js';

// ─── Icon names (lucide-react) per main category ─────────────────────────────
// Imported by the picker, keyed by `icon`.
export const CATEGORY_ICONS = {
    drywall: 'Layers',
    paint: 'PaintRoller',
    finishing: 'LayoutGrid',
    carpentry: 'Hammer',
    lighting: 'Lightbulb',
    adhesives: 'Droplets',
    scaffold: 'HardHat',
    tools: 'Wrench',
    civil: 'Shield',
    logistics: 'Truck',
    furniture: 'Sofa',
    promo: 'Gift',
    services: 'Users',
};

// ─── The 13 main categories and their sub-categories ─────────────────────────
// Each sub has `keywords` (substrings matched against the item name) and each
// main has `legacy` (old `category` values that map to it) with a `defaultSub`.
export const CATEGORY_TREE = [
    {
        id: 'drywall',
        label: 'Drywall & Structural',
        icon: 'Layers',
        legacy: ['hardware', 'fastener'],
        defaultSub: 'fixing',
        subs: [
            { id: 'gypsum', label: 'Gypsum Board', keywords: ['gypsum', 'cement board'] },
            { id: 'framing', label: 'Metal Framing', keywords: ['metal stud', 'furring', 'batten', 'c channel', 'channel'] },
            { id: 'plaster', label: 'Plaster & Cornice', keywords: ['corner bead', 'stopping', 'plaster', 'knead', 'joint compound'] },
            { id: 'fixing', label: 'Fixing Materials', keywords: ['screw', 'wall plug', 'plug', 'tapping'] },
        ],
    },
    {
        id: 'paint',
        label: 'Paints & Coatings',
        icon: 'PaintRoller',
        legacy: ['paint'],
        defaultSub: 'special',
        subs: [
            { id: 'primer', label: 'Primers & Sealers', keywords: ['primer', 'undercoat', 'sealer', 'seal'] },
            { id: 'site', label: 'Emulsion (Site / 20L)', keywords: ['18l', '20l', '10l', 'site'] },
            { id: 'panel', label: 'Emulsion (Panel / 5L)', keywords: ['5l', '7l', 'panel'] },
            { id: 'special', label: 'Specialty Coatings', keywords: [] },
        ],
    },
    {
        id: 'finishing',
        label: 'Finishing Materials',
        icon: 'LayoutGrid',
        legacy: ['wainscotting', 'pvc panel', 'fluted'],
        defaultSub: 'wainscot',
        subs: [
            { id: 'hpl', label: 'HPL Laminate', keywords: ['hpl', 'laminate'] },
            { id: 'pvc', label: 'PVC Foam Board', keywords: ['pvc foam', 'foam board', 'pvc'] },
            { id: 'acrylic', label: 'Acrylic Panels', keywords: ['acrylic'] },
            { id: 'wainscot', label: 'Wainscotting & Skirting', keywords: ['wct', 'skirting', 'wainscot'] },
        ],
    },
    {
        id: 'carpentry',
        label: 'Carpentry & Woodwork',
        icon: 'Hammer',
        legacy: [],
        defaultSub: 'fabrication',
        subs: [
            { id: 'plywood', label: 'Plywood & MDF', keywords: ['plywood', 'mdf'] },
            { id: 'doorset', label: 'Door Sets', keywords: ['door'] },
            { id: 'hardware', label: 'Hardware', keywords: ['door closer', 'hinge', 'latch', 'handle', 'lock'] },
            { id: 'fabrication', label: 'Custom Fabrication', keywords: ['kayu', 'timber', 'meranti', 'ketam', 'kocai', 'masak'] },
        ],
    },
    {
        id: 'lighting',
        label: 'Lighting & Electrical',
        icon: 'Lightbulb',
        legacy: ['lighting', 'led strip', 'electrical'],
        defaultSub: 'fixtures',
        subs: [
            { id: 'led', label: 'LED Strip Lighting', keywords: ['led strip', 'led cob', 'cob strip', 'led'] },
            { id: 'fixtures', label: 'Light Fixtures', keywords: ['wall light', 'crystal', 'diamond', 'lightroom', 'al anwar', 'downlight', 'spotlight', 'bulb'] },
            { id: 'cables', label: 'Cables & Wires', keywords: ['cable', 'wire', 'flexible hose', '1.5mm', '2.5mm'] },
            { id: 'switches', label: 'Switches & Sockets', keywords: ['switch', 'socket', 'dimmer'] },
            { id: 'conduit', label: 'Conduit & Accessories', keywords: ['conduit', 'elbow', 'tee'] },
        ],
    },
    {
        id: 'adhesives',
        label: 'Adhesives & Sealants',
        icon: 'Droplets',
        legacy: [],
        defaultSub: 'bonding',
        subs: [
            { id: 'bonding', label: 'Bonding Agents', keywords: ['adhesive', 'xbond', 'x bond', 'glue', 'bonding'] },
            { id: 'sealant', label: 'Sealants', keywords: ['silicon', 'silicone', 'sealant'] },
            { id: 'tapes', label: 'Tapes', keywords: ['tape'] },
            { id: 'patching', label: 'Patching Compounds', keywords: ['patching', 'skim', 'scritch'] },
        ],
    },
    {
        id: 'scaffold',
        label: 'Scaffolding & Safety',
        icon: 'HardHat',
        legacy: [],
        defaultSub: 'protection',
        subs: [
            { id: 'frames', label: 'Frames & Bracing', keywords: ['scaffold', 'frame', 'brace', 'ledger', 'transom'] },
            { id: 'casters', label: 'Casters & Wheels', keywords: ['caster', 'wheel', 'swivel'] },
            { id: 'catwalk', label: 'Catwalk', keywords: ['catwalk', 'walk board', 'deck'] },
            { id: 'protection', label: 'Protection Materials', keywords: ['canvas', 'tarpaulin', 'tarp', 'floorgard', 'mat', 'harness', 'safety'] },
        ],
    },
    {
        id: 'tools',
        label: 'Tools & Consumables',
        icon: 'Wrench',
        legacy: ['tools'],
        defaultSub: 'cutting',
        subs: [
            { id: 'cutting', label: 'Cutting Tools', keywords: ['blade', 'saw', 'cutter', 'disc', 'grinder', 'drill', 'bit'] },
            { id: 'abrasives', label: 'Abrasives', keywords: ['sandpaper', 'abrasive', 'grit', 'sand paper'] },
            { id: 'rollers', label: 'Rollers & Brushes', keywords: ['roller', 'brush', 'tray'] },
        ],
    },
    {
        id: 'civil',
        label: 'Civil & Structural',
        icon: 'Shield',
        legacy: [],
        defaultSub: 'cement',
        subs: [
            { id: 'cement', label: 'Cement & Sand', keywords: ['cement', 'sand', 'brick', 'block', 'sika'] },
            { id: 'rebar', label: 'Steel Reinforcement', keywords: ['rebar', 'steel bar', 'steel rod', 'iron'] },
            { id: 'formwork', label: 'Formwork Materials', keywords: ['formwork', 'form work', 'shutter', 'form'] },
        ],
    },
    {
        id: 'logistics',
        label: 'Logistics',
        icon: 'Truck',
        legacy: [],
        defaultSub: 'transport',
        subs: [
            { id: 'transport', label: 'Transportation', keywords: ['transport', 'delivery', 'lorry', 'truck', 'haul', 'freight', 'crane'] },
            { id: 'waste', label: 'Waste Management', keywords: ['waste', 'debris', 'rubbish', 'skip', 'dump', 'dumping'] },
        ],
    },
    {
        id: 'furniture',
        label: 'Furniture & Equipment',
        icon: 'Sofa',
        legacy: [],
        defaultSub: 'furniture',
        subs: [
            { id: 'appliances', label: 'Appliances', keywords: ['fridge', 'stove', 'oven', 'washing', 'machine'] },
            { id: 'electronics', label: 'Electronics', keywords: ['tv', 'monitor', 'aircon', 'air-con', 'fan', 'projector', 'speaker'] },
            { id: 'furniture', label: 'Furniture', keywords: ['table', 'chair', 'desk', 'sofa', 'bed', 'cabinet', 'shelf'] },
        ],
    },
    {
        id: 'promo',
        label: 'Promotional / Gifts',
        icon: 'Gift',
        legacy: [],
        defaultSub: 'free',
        subs: [
            { id: 'free', label: 'Free Items', keywords: ['free', 'gift', 'promotion', 'sample', 'foc'] },
        ],
    },
    {
        id: 'services',
        label: 'Services',
        icon: 'Users',
        legacy: [],
        defaultSub: 'labour',
        subs: [
            { id: 'labour', label: 'Labour', keywords: ['labour', 'labor', 'manpower', 'worker', 'installation'] },
            { id: 'contingency', label: 'Contingency', keywords: ['contingency', 'allowance', 'misc'] },
        ],
    },
];

// ─── Reusable kits: name → items to add in one tap ───────────────────────────
// Each kit is applied only for items that exist in the current catalog.
export const QUICK_KITS = [
    {
        id: 'partition',
        name: 'Standard Partition Kit',
        main: 'drywall',
        emoji: '🧱',
        items: [
            { name: 'Gypsum board Premium 4x8ft x 9mm (UAC/Elephant)', qty: 4 },
            { name: 'Metal Stud 75mm x 25mm x 8ft', qty: 10 },
            { name: '1.5" Partition Screw (box)', qty: 2 },
            { name: 'Joint Wall Tape 50mmx25m', qty: 2 },
            { name: '18kg Flaxi Stopping (1 bag)', qty: 1 },
        ],
    },
    {
        id: 'paint-site',
        name: 'Paint Site Kit',
        main: 'paint',
        emoji: '🎨',
        items: [
            { name: 'ICI Maxilite Emulsion Paint (18L) White', qty: 2 },
            { name: 'ICI Maxilite Emulsion Paint (7L) White', qty: 1 },
            { name: 'SVL-418 Oat Beige set 10L', qty: 1 },
            { name: 'Masking Tape 2" (single)', qty: 2 },
        ],
    },
    {
        id: 'led-strip',
        name: 'Basic Lighting Kit',
        main: 'lighting',
        emoji: '💡',
        items: [
            { name: 'LED Strip Natural White 24V DC 10m', qty: 2 },
            { name: '1.5mm Cable Wire Red', qty: 20 },
            { name: '1.5mm Cable Wire Black', qty: 20 },
            { name: '13A socket type A', qty: 4 },
            { name: '1G1W switch type A', qty: 4 },
        ],
    },
    {
        id: 'switchboard',
        name: 'Switchboard Kit',
        main: 'lighting',
        emoji: '🔌',
        items: [
            { name: 'White 1G1W Switch', qty: 4 },
            { name: 'White 2G1W Switch', qty: 4 },
            { name: 'White Socket Switch A', qty: 6 },
            { name: 'White 2G2W Socket A', qty: 2 },
            { name: 'Switchbox partition 3x3', qty: 2 },
        ],
    },
    {
        id: 'protection',
        name: 'Protection Day Kit',
        main: 'scaffold',
        emoji: '🛡️',
        items: [
            { name: "6'x 80' Canvas Blue White", qty: 1 },
            { name: 'FloorGard Mat 1.2Mx12Mx1.5mm', qty: 1 },
            { name: 'Masking Tape 1" (single)', qty: 2 },
        ],
    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toKey = (name) => String(name || '').toLowerCase();

export const getCategoryById = (id) => CATEGORY_TREE.find(c => c.id === id);

export const getSubById = (main, subId) => {
    const category = getCategoryById(main);
    return category ? category.subs.find(s => s.id === subId) : null;
};

/**
 * Classify one flat catalog item into { mainId, subId } using keyword + legacy
 * matching. Also scores the item's `aliases` and `subLabel`-style synonyms so a
 * user-added "Papan Gypsum" still lands in the Gypsum sub. Falls back to the
 * legacy category's default sub so nothing is ever stranded.
 */
const classifyItem = (item) => {
    const name = toKey(item.name);
    const legacy = toKey(item.category);
    const aliases = (Array.isArray(item.aliases) ? item.aliases : [])
        .concat(item.keyword ? [item.keyword] : [])
        .map(toKey)
        .filter(Boolean);

    const searchable = [name, ...aliases];

    // Pass 1 — strongest signal: keyword match on name OR aliases against any
    // sub-category, scanned across all mains in category order.
    for (const main of CATEGORY_TREE) {
        for (const sub of main.subs) {
            if (sub.keywords.some(k => searchable.some(s => s.includes(toKey(k))))) {
                return { mainId: main.id, subId: sub.id };
            }
        }
    }

    // Pass 2 — fall back to the legacy `category` field.
    for (const main of CATEGORY_TREE) {
        if (main.legacy.some(k => toKey(k) === legacy)) {
            return { mainId: main.id, subId: main.defaultSub };
        }
    }

    // Pass 3 — absolute fallback so nothing is ever stranded.
    return { mainId: 'drywall', subId: 'fixing' };
};

/**
 * Build the full hierarchy from a flat catalog.
 * @returns {Array} of main categories → subs → items (sorted alphabetically).
 */
export const buildCatalogHierarchy = (flatCatalog) => {
    const items = Array.isArray(flatCatalog) ? flatCatalog : [];

    // Enrich once up-front (unit/colour/size/brand + learned aliases) so both
    // classification and the picker benefit from catalog "learning".
    const enriched = items.map(item => enrichItem(item));

    return CATEGORY_TREE.map(main => {
        const subs = main.subs.map(sub => ({ ...sub, items: [] }));
        const subIndex = Object.fromEntries(subs.map(s => [s.id, s]));

        enriched.forEach(eItem => {
            const { mainId, subId } = classifyItem(eItem);
            if (mainId !== main.id) return;
            const target = subIndex[subId] || subs[subs.length - 1];
            target.items.push({
                key: `${eItem.name}::${eItem.price}`,
                name: eItem.name,
                price: Number(eItem.price) || 0,
                category: eItem.category || main.label,
                mainLabel: main.label,
                subLabel: target.label,
                unit: eItem.unit || 'pcs',
                brand: eItem.brand || '',
                code: eItem.code || '',
                size: eItem.size || '',
                colour: eItem.colour || '',
                aliases: Array.isArray(eItem.aliases) ? eItem.aliases : [],
            });
        });

        subs.forEach(sub => sub.items.sort((a, b) => a.name.localeCompare(b.name)));
        return { ...main, subs };
    });
};

/**
 * Flatten a built hierarchy back into a searchable list, tagging each item with
 * its main + sub labels.
 */
export const flattenHierarchy = (hierarchy) => {
    const out = [];
    (hierarchy || []).forEach(main => {
        main.subs.forEach(sub => {
            sub.items.forEach(item => {
                out.push({ ...item, mainLabel: main.label, mainId: main.id, subLabel: sub.label });
            });
        });
    });
    return out;
};

/** Count total items across the whole hierarchy. */
export const countItems = (hierarchy) =>
    (hierarchy || []).reduce((n, main) => n + main.subs.reduce((m, s) => m + s.items.length, 0), 0);

/**
 * Resolve a kit against a flat catalog → list of {item, qty} that exist.
 * Items not in the catalog are skipped so kits never add phantom rows.
 */
export const resolveKit = (kit, flatCatalog) => {
    const byName = new Map((flatCatalog || []).map(i => [toKey(i.name), i]));
    const resolved = [];
    for (const entry of kit.items) {
        const item = byName.get(toKey(entry.name));
        if (item) resolved.push({ item, qty: entry.qty });
    }
    return resolved;
};

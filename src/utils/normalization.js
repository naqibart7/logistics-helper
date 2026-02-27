
/**
 * Master Item Normalization Data
 * Derived from project specifications and standard construction material naming.
 */
export const ITEM_MAPPING = {
    // 1. Gypsum & Ceiling
    'GYPSUM BOARD': ['gypsum board', 'plaster board', 'papan gypsum', 'drywall board'],
    'METAL STUD 2"': ['metal stud', 'besi stud', 'c-stud', 'stud 2 inch'],
    'METAL TRACK 2"': ['metal track', 'besi track', 'u-track', 'track 2 inch'],
    'CORNICE ADHESIVE': ['cornice adhesive', 'gam cornice', 'compound', 'stopping compound'],
    'JOINT TAPE': ['joint tape', 'fiber tape', 'mesh tape', 'paper tape'],

    // 2. Boards & Panels
    'PVC FOAM BOARD 9MM': ['pvc foam board 9mm', 'pvc board 9mm', 'pvc board light'],
    'PVC FOAM BOARD 12MM': ['pvc foam board 12mm', 'pvc board 12mm'],
    'PLYWOOD 4MM': ['plywood 4mm', 'papan 4mm', 'kayu lapis 4mm'],
    'PLYWOOD 9MM': ['plywood 9mm', 'papan 9mm', 'kayu lapis 9mm'],
    'PLYWOOD 12MM': ['plywood 12mm', 'papan 12mm', 'kayu lapis 12mm'],
    'PLYWOOD 18MM': ['plywood 18mm', 'papan 18mm', 'kayu lapis 18mm'],

    // 3. Electrical & Lighting
    'LED STRIP 5M (6000K)': ['led strip white', 'led strip 6000k', 'led light white'],
    'LED STRIP 5M (4000K)': ['led strip cool white', 'led strip 4000k', 'led light cool'],
    'LED STRIP 5M (3000K)': ['led strip warm white', 'led strip 3000k', 'led light warm'],
    'LED DRIVER 12V 100W': ['power supply 12v', 'transformer 12v', 'led driver'],
    'DOWNLIGHT 12W': ['downlight 12w', 'eyeball 12w', 'led downlight'],
    'PVC CONDUIT 20MM': ['pvc conduit', 'pvc pipe 20mm', 'conduit cable'],

    // 4. Paint & Finishes
    'MANTEX EMULSION 7L': ['mantex', 'matex', 'undercoat paint', 'kapur white'],
    'JOTUN MAJESTIC 5L': ['jotun majestic', 'majestic shine', 'cat jotun'],
    'NIPPON VINILEX 5L': ['vinilex', 'vinilex 5000', 'cat nippon'],
    'THINNER 2KG': ['thinner', 'minyak tinar', 'thinner tnc'],

    // 5. Hardware & Adhesives
    'SILICONE SEALANT': ['silicon', 'silicone', 'gam silicon', 'gap filler'],
    'X-BOND ADHESIVE': ['x-bond', 'x bond', 'max bond', 'gam kayu'],
    'SUPER GLUE': ['super glue', 'gam gajah', 'instant glue'],
    'MASKING TAPE 1"': ['masking tape', 'tape kertas', 'paper tape 1'],
    'DRYWALL SCREW 1"': ['drywall screw', 'skru gypsum', 'black screw'],

    // 6. Furniture Hardware
    'SOFT CLOSE HINGE': ['soft close hinge', 'hinge cabinet', 'engsel cabinet'],
    'DRAWER SLIDE 14"': ['drawer slide', 'rail laci', 'drawer runner']
};

export const CATEGORY_MAP = {
    'GYPSUM': ['gypsum', 'cornice', 'joint', 'stud', 'track', 'fiber tape'],
    'PAINT': ['paint', 'emulsion', 'mantex', 'jotun', 'nippon', 'matex', 'thinner', 'roller', 'brush'],
    'ELECTRICAL': ['led', 'light', 'downlight', 'cable', 'conduit', 'socket', 'plug', 'switch', 'transformer', 'driver'],
    'PVC PANEL': ['pvc foam', 'pvc board'],
    'WOOD & BOARDS': ['plywood', 'blockboard', 'mdf', 'board'],
    'HARDWARE': ['screw', 'nail', 'hinge', 'slide', 'glue', 'adhesive', 'silicone', 'tape', 'xbond', 'x-bond']
};

/**
 * Normalize an item name based on master keywords
 */
export const normalizeItemName = (rawName) => {
    if (!rawName) return 'Unknown Item';
    const lower = rawName.toLowerCase();

    for (const [standard, keywords] of Object.entries(ITEM_MAPPING)) {
        if (keywords.some(k => lower.includes(k))) {
            return standard;
        }
    }

    // Capitalize first letter of each word if no match
    return rawName.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
};

/**
 * Detect category based on item name
 */
export const detectCategory = (itemName) => {
    if (!itemName) return 'OTHERS';
    const lower = itemName.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
        if (keywords.some(k => lower.includes(k))) {
            return category;
        }
    }

    return 'OTHERS';
};

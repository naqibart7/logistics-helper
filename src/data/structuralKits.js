/**
 * structuralKits.js — Manual / authoritative Structural Kits (the "physics").
 *
 * These kits encode engineering ratios, NOT learned patterns. Each kit:
 *   - `driver`  — a regex over the canonical catalog name that, when it matches
 *     a draft row, activates the kit and provides the driver quantity.
 *   - `required` — components that MUST be present when the driver appears.
 *     Each carries a `qtyFormula` descriptor evaluated against live draft state:
 *       { per: 'driver', factor: N }  → Q_raw = driverQty × N
 *       { per: 'area',   factor: N }  → Q_raw = area(m²) × N
 *       { fixed: N }                  → Q_raw = N
 *   - `optional` — nice-to-have components emitted as suggestions only.
 *   - `dimensionFamily` — optional regex; when set, the dimensional-homogeneity
 *     check requires every resolved family member to share the driver's size
 *     token or the match is demoted to a CONFLICT_WARNING with a resolving SKU.
 *
 * Every `sku` below is verified to exist in the seed catalog; resolveKitSku
 * refuses to fabricate a SKU that is not live in the Canonical Catalog.
 */
export const STRUCTURAL_KITS = [
    {
        id: 'partition',
        name: 'Standard Partition Kit',
        source: 'manual',
        driver: /gypsum|plaster board/i,
        required: [
            { sku: 'Metal Stud 75mm x 25mm x 8ft', qtyFormula: { per: 'driver', factor: 2.5 } },
            { sku: '1.5" Partition Screw (box)', qtyFormula: { per: 'driver', factor: 0.5 } },
            { sku: 'Joint Wall Tape 50mmx25m', qtyFormula: { per: 'driver', factor: 0.5 } },
            { sku: '18kg Flaxi Stopping (1 bag)', qtyFormula: { per: 'driver', factor: 0.25 } },
        ],
        optional: [
            { sku: 'C Channel 3x1.5in x 10ft', qtyFormula: { per: 'driver', factor: 1 } },
        ],
    },
    {
        id: 'conduit',
        name: 'PVC Conduit Kit',
        source: 'manual',
        driver: /pvc conduit pipe/i,
        dimensionFamily: /(pvc|conduit).*(pipe|elbow|tee|fitting|socket|bend)/i,
        required: [
            { sku: '3/4" PVC Elbow conduit', qtyFormula: { per: 'driver', factor: 0.5 } },
            { sku: '3/4" PVC Tee conduit', qtyFormula: { per: 'driver', factor: 0.25 } },
        ],
        optional: [],
    },
    {
        id: 'paint-site',
        name: 'Paint Site Kit',
        source: 'manual',
        driver: /maxilite emulsion paint/i,
        required: [
            { sku: 'Masking Tape 2" (single)', qtyFormula: { per: 'driver', factor: 1 } },
        ],
        optional: [
            { sku: 'ICI Maxilite Emulsion Paint (7L) White', qtyFormula: { per: 'driver', factor: 0.5 } },
        ],
    },
    {
        id: 'led-strip',
        name: 'Basic Lighting Kit',
        source: 'manual',
        driver: /led strip.*24v/i,
        required: [
            { sku: '1.5mm Cable Wire Red', qtyFormula: { per: 'driver', factor: 10 } },
            { sku: '1.5mm Cable Wire Black', qtyFormula: { per: 'driver', factor: 10 } },
            { sku: '13A socket type A', qtyFormula: { per: 'driver', factor: 0.5 } },
        ],
        optional: [
            { sku: '1G1W switch type A', qtyFormula: { per: 'driver', factor: 0.5 } },
        ],
    },
];
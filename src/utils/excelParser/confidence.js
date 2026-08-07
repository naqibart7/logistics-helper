/**
 * confidence.js — Confidence Scoring (stage 12).
 *
 * Every extracted field is scored 0–1 and an OVERALL confidence is produced.
 * We never pretend certainty: mapped columns score higher than heuristic
 * guesswork, recognized materials beat free text, and invalid values drag the
 * score down. Rows below the confidence threshold are flagged (never dropped) so
 * tooling can route them to the AI fallback or exclude them from auto-import.
 */

export const MIN_CONFIDENCE = 0.6;

const KNOWN_UNITS = ['pcs', 'm', 'm2', 'm3', 'cm', 'mm', 'kg', 'g', 'l', 'ml', 'roll', 'box', 'bag', 'pail', 'ft', 'sqft'];

/**
 * Score one candidate row.
 * @param {object} ent entity + recognition + specs
 * @returns {{fields:object, overall:number, warnings:Array<string>}}
 */
export const scoreCandidate = (ent) => {
    const warnings = [];

    // ── item ─────────────────────────────────────────────
    let itemConf = 0;
    if (ent.item) {
        if (ent.rec && ent.rec.hit === 'catalog') itemConf = Math.max(0.5, ent.rec.confidence);
        else itemConf = ent.specs && ent.specs.material ? 0.55 : 0.42;
    }

    // ── quantity ─────────────────────────────────────────
    const qtyNum = Number.isFinite(Number(ent.quantity)) ? Number(ent.quantity) : NaN;
    const hasQty = Number.isFinite(qtyNum) && qtyNum > 0;
    const qtyConf = hasQty ? (Number.isInteger(qtyNum) ? 1 : 0.9) : 0;

    // ── unit ─────────────────────────────────────────────
    const unitKnown = ent.unit && KNOWN_UNITS.includes(ent.unit);
    const unitConf = ent.unit ? (unitKnown ? 0.95 : 0.7) : 0;

    // ── price (line total OR unit price) ────────────────
    const hasPrice = Number.isFinite(Number(ent.price)) && Number(ent.price) > 0;
    const hasUnitPrice = Number.isFinite(Number(ent.unitPrice)) && Number(ent.unitPrice) > 0;
    const priceConf = hasPrice || hasUnitPrice ? 1 : 0;

    // structural edge for mapped columns
    const structuralEdge = ent.source === 'mapped' ? 0.08 : 0;

    // ── validate (warn, never silently discard) ─────────
    if (!hasQty) warnings.push('quantity missing or invalid');
    if (!ent.item) warnings.push('missing item description');
    else if (ent.item.length < 3) warnings.push('item description very short');
    if (!ent.unit) warnings.push('missing unit');
    if (!hasPrice && !hasUnitPrice) warnings.push('missing price');
    if (hasPrice && Number(ent.price) < 0) warnings.push(`negative price ${ent.price}`);

    const fields = {
        item: itemConf,
        quantity: qtyConf,
        unit: unitConf,
        price: priceConf,
    };

    const overall = Math.max(0, Math.min(1,
        itemConf * 0.34 + qtyConf * 0.26 + unitConf * 0.14 + priceConf * 0.26 + structuralEdge
    ));

    return { fields, overall, warnings };
};
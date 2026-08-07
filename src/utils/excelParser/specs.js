/**
 * specs.js — Specification Extraction (stage 9).
 *
 * Splits free-text material descriptions into structured fields. Pure regex +
 * dictionary logic tuned for construction materials, e.g.
 *   "PVC White Board 5mm 4x8" → {material:…, colour:'White', thickness:'5mm', size:'4x8'}.
 * The original description is always preserved by the caller (`original`).
 */

const THICKNESS_RE = /(\d+(?:\.\d+)?)\s*(mm|mil|㎜)/i;
const SIZE_RE = /(\d+(?:\.\d+)?)\s*[x×X*]\s*(\d+(?:\.\d+)?)(\s*(ft|cm))?/;
const COLOURS = ['white', 'black', 'grey', 'gray', 'green', 'red', 'blue', 'brown', 'beige', 'walnut', 'oak', 'cream', 'natural', 'gold', 'silver', 'clear', 'galv'];
const BRANDS = ['uac', 'elephant', 'knauf', 'boral', 'jotun', 'nippon', 'maxilite', 'sika', 'bostik', 'sikaflex', 'davco', 'gekolit', 'sigma'];

/**
 * Extract structured specs from an item description.
 * @param {string} text cleaned item text
 * @returns {{material:string, colour?:string, thickness?:string, size?:string, brand?:string}}
 */
export const extractSpecs = (text) => {
    const original = String(text || '').trim();
    const specs = { material: '', colour: undefined, thickness: undefined, size: undefined, brand: undefined };
    if (!original) return specs;

    const lower = original.toLowerCase();

    // brand (whole word)
    for (const b of BRANDS) {
        if (new RegExp(`\\b${b}\\b`).test(lower)) { specs.brand = b.toUpperCase(); break; }
    }

    // thickness
    const th = original.match(THICKNESS_RE);
    if (th) specs.thickness = `${th[1]}${th[2].toLowerCase()}`;

    // size "4x8" / "1.2x2.4" / "4x8ft"
    const sz = original.match(SIZE_RE);
    if (sz) {
        const unit = (sz[4] || '').toLowerCase();
        specs.size = `${sz[1]}x${sz[2]}${unit ? ' ' + unit : ''}`;
    }

    // colour (longest whole-word match)
    let colour = '';
    for (const c of COLOURS) {
        if (new RegExp(`\\b${c}\\b`, 'i').test(original) && c.length > colour.length) colour = c;
    }
    if (colour) specs.colour = colour[0].toUpperCase() + colour.slice(1);

    // material class: strip specs/colour/brand from the description
    let material = original;
    material = material.replace(THICKNESS_RE, ' ');
    material = material.replace(SIZE_RE, ' ');
    if (colour) material = material.replace(new RegExp(`\\b${colour}\\b`, 'i'), ' ');
    if (specs.brand) material = material.replace(new RegExp(`\\b${specs.brand}\\b`, 'i'), ' ');
    specs.material = material.replace(/\s{2,}/g, ' ').trim();

    return specs;
};
/**
 * AddItemScreen.jsx — Lane 1B.
 *
 * Phone-first, single-screen manual add-item. Fill:
 *   (required) item, spec, purchaseQty, unit
 *   (one-tap) reasonTag: site | missing | correction
 *   (optional) category, notes
 *
 * Automatic: addedAt = now. isManual=true, source="manual".
 * Confirms immediately — never queued into Confirm.
 *
 * Thin UI: all business logic in bomRepo.addManualItem (which writes the
 * supervisor changelog entry too). No logic here beyond form state + wiring.
 */
import React, { useState } from 'react';
import * as bomRepo from '../data/bomRepo.js';
import { appendChangeLog } from '../data/changeLogRepo.js';
import { MANUAL_REASON_TAGS } from '../data/schema.js';

const REASON_LABELS = {
  site: 'Requested on site',
  missing: 'Missing from import',
  correction: 'Correction',
};

const REASON_DESCRIPTIONS = {
  site: 'Item asked via WhatsApp/site group. Counts toward weekly late-request total.',
  missing: 'Forgotten in the BOM. Site needs it to proceed.',
  correction: 'The import had a wrong spec or omitted a line.',
};

const addDeps = {
  createBomItem: bomRepo.createBomItem,
  maxDisplayOrder: bomRepo.maxDisplayOrder,
  updateBomItem: bomRepo.updateBomItem,
  appendChangeLog,
};

export default function AddItemScreen({ projectId, onBack, onAdded }) {
  const [item, setItem] = useState('');
  const [spec, setSpec] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');
  const [unit, setUnit] = useState('');
  const [reasonTag, setReasonTag] = useState(null);
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const ready =
    String(item).trim() !== '' &&
    String(spec).trim() !== '' &&
    purchaseQty !== '' &&
    !Number.isNaN(Number(purchaseQty)) &&
    Number(purchaseQty) > 0 &&
    String(unit).trim() !== '';

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      const row = await bomRepo.addManualItem(
        {
          projectId,
          item: item.trim(),
          spec: spec.trim(),
          purchaseQty: Number(purchaseQty),
          unit: unit.trim(),
          reasonTag: REASON_LABELS[reasonTag] ? reasonTag : null,
          category: category.trim() || null,
          notes: notes.trim() || null,
        },
        addDeps,
      );
      onAdded?.(row);
      onBack?.();
    } catch (err) {
      setError(err.message || 'Could not add item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: '6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button className="secondary" onClick={onBack} aria-label="Back to BOM">
          ← Back
        </button>
        <h1 style={{ margin: 0 }}>Add item</h1>
      </div>

      {error && (
        <div className="card" role="alert" style={{ borderLeft: '3px solid var(--danger)' }}>
          {error}
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <label className="field">
          Item name *
          <input
            type="text"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="e.g. Gypsum board"
            autoFocus
          />
        </label>

        <label className="field">
          Spec / description *
          <input
            type="text"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="e.g. 12 mm, 1220×2440 mm"
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <label className="field">
            Quantity *
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={purchaseQty}
              onChange={(e) => setPurchaseQty(e.target.value)}
              placeholder="e.g. 20"
            />
          </label>
          <label className="field">
            Unit *
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="sheet / pcs / m / roll"
            />
          </label>
        </div>

        <div className="field" style={{ marginTop: '0.5rem' }}>
          <div className="small" style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            Reason (one tap — optional)
          </div>
          <div role="radiogroup" aria-label="Reason tag" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            {MANUAL_REASON_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                role="radio"
                aria-checked={reasonTag === tag}
                className={reasonTag === tag ? '' : 'secondary'}
                style={{ minHeight: 48 }}
                onClick={() => setReasonTag(reasonTag === tag ? null : tag)}
              >
                {REASON_LABELS[tag]}
              </button>
            ))}
          </div>
          {reasonTag && (
            <div className="small" style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              {REASON_DESCRIPTIONS[reasonTag]}
            </div>
          )}
        </div>

        <label className="field">
          Category (optional)
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Drywall, Paint, Electrical…"
          />
        </label>

        <label className="field">
          Notes (optional)
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. URGENT for site, needed by Friday"
          />
        </label>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="button" className="secondary" onClick={onBack} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            onClick={submit}
            disabled={!ready || saving}
            style={{ flex: 1, minHeight: 48 }}
          >
            {saving ? 'Adding…' : 'Add item'}
          </button>
        </div>

        <div className="small" style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
          Added items are marked manual and protected from being flagged as "removed" on the next
          re-import. A supervisor changelog entry is written with the reason and timestamp.
        </div>
      </form>
    </div>
  );
}

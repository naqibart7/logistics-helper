/**
 * SuppliersScreen.jsx — Agent 4: project supplier directory + global browser.
 * Wiring only: linking runs linkSupplierEntry (logic/supplierLinking.js), the
 * same dedupe-by-name rule the import path uses — tapping never duplicates a
 * GlobalSupplier record, it only adds a ProjectSupplierLink.
 *
 * Part B enhancements:
 * B1. Add / edit / delete in-app (dedupe on add, delete blocked when linked).
 * B2. One-tap WhatsApp & Call with phone normalisation and 'Fix number' fallback.
 * B3. Verified date badge per supplier ("Verified 14 Oct").
 *
 * H1: `projectId` is optional. Without one this is the top-level Supplier Hub —
 * the same component and the same directory, minus everything that only means
 * "linked to THIS project" (the split list, Link/Unlink, browse toggle). Delete
 * stays blocked by any project link because that rule is about the directory,
 * not the open project.
 */
import React, { useEffect, useState } from 'react';
import {
  listProjectSuppliers,
  listSuppliers,
  createSupplier,
  linkSupplierToProject,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  countSupplierProjectLinks,
  unlinkSupplier,
} from '../data/supplierRepo.js';
import { linkSupplierEntry } from '../logic/supplierLinking.js';
import { importSupplierRows } from '../logic/supplierCsvImport.js';
import { parseSupplierCsv, readUploadAsText } from '../utils/csvImport/index.js';
import { exportSupplierDirectory } from '../utils/csvImport/csvExport.js';
import { scoreSupplierCsv, scorecardLine } from '../logic/importScorecard.js';
import { createImportRun } from '../data/importRunRepo.js';
import { normalizePhoneForWhatsApp } from '../logic/quickOrder.js';
import { formatShortDate } from '../utils/helpers.js';

const linkDeps = { listSuppliers, createSupplier, linkSupplierToProject };

const csvImportDeps = {
  listSuppliers,
  createSupplier,
  updateSupplier,
};

const matchesQuery = (s, q) => {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  // Region filtering works through the address text (e.g. "Kuching", "Betong").
  return [s.businessName, s.specialty, s.address, s.contact, s.note, s.logisticsNote]
    .some((f) => String(f || '').toLowerCase().includes(query));
};

export default function SuppliersScreen({ projectId, onOpenDirectory }) {
  // Hub mode: no project open, so there are no project links to read or offer.
  const hubMode = !projectId;
  const [rows, setRows] = useState([]);
  const [browsing, setBrowsing] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [linkedIds, setLinkedIds] = useState(new Set());
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pendingCsv, setPendingCsv] = useState(null); // { validRows, rejectedRows, preview } — uncommitted
  const [overwrite, setOverwrite] = useState(false);

  // Modal / form states for Add, Edit, Delete-blocked
  const [modal, setModal] = useState(null); // null | 'add' | { type: 'edit', supplier } | { type: 'deleteBlocked', supplier, count }
  const [form, setForm] = useState({
    businessName: '',
    contact: '',
    address: '',
    specialty: '',
    tags: '',
    note: '',
  });

  const reloadLinks = async () => {
    if (hubMode) return; // no project open: nothing can be linked to it
    const links = await listProjectSuppliers(projectId);
    const joined = (
      await Promise.all(
        links.map(async (l) => ({
          link: l,
          supplier: await getSupplier(l.globalSupplierId),
        }))
      )
    ).filter((r) => r.supplier);
    setRows(joined);
    setLinkedIds(new Set(links.map((l) => l.globalSupplierId)));
  };

  useEffect(() => {
    reloadLinks();
    // In hub mode the directory IS the screen, so load it on mount instead of
    // waiting for the project-mode "Browse All Suppliers" tap.
    if (hubMode) listSuppliers().then(setDirectory);
  }, [projectId]);

  const openBrowser = async () => {
    setNotice(null);
    setDirectory(await listSuppliers());
    await reloadLinks();
    setBrowsing(true);
  };

  const linkRow = async (supplier) => {
    try {
      await linkSupplierEntry(projectId, supplier, linkDeps);
      await reloadLinks();
      setNotice(`Linked "${supplier.businessName}" to this project.`);
    } catch (err) {
      setNotice(`Link failed: ${err.message}`);
    }
  };

  const exportCsv = async () => {
    try {
      const csv = await exportSupplierDirectory();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'supplier-directory.csv';
      a.click();
      setNotice('Supplier directory exported.');
    } catch (err) {
      setNotice(`Export failed: ${err.message}`);
    }
  };

  const stageCsvFile = async (file) => {
    if (!file) return;
    setNotice(null);
    try {
      const { validRows, rejectedRows } = parseSupplierCsv(await readUploadAsText(file));
      // dryRun: identical counting, zero writes — the preview commits nothing.
      const preview = await importSupplierRows(validRows, { dryRun: true }, csvImportDeps);
      setPendingCsv({ validRows, rejectedRows, preview, fileName: file.name });
      setOverwrite(false);
    } catch (err) {
      setNotice(`Couldn't read that CSV — check it has a businessName column.`);
    }
  };

  const confirmCsvImport = async () => {
    if (!pendingCsv) return;
    const result = await importSupplierRows(pendingCsv.validRows, { overwriteExisting: overwrite }, csvImportDeps);
    // Lane 1A passive trust pass: duplicates, rejected rows, blank-field warnings.
    const score = scoreSupplierCsv({ validRows: pendingCsv.validRows, rejectedRows: pendingCsv.rejectedRows });
    try {
      await createImportRun({ ...score, fileName: pendingCsv.fileName ?? null, projectId });
    } catch (e) {
      // Scorecard recording must never block the import itself.
      console.error('ImportRun not recorded:', e);
    }
    const bits = [
      `${result.created} created`,
      `${result.skipped} already existed (skipped)`,
    ];
    if (result.updated > 0) bits.push(`${result.updated} updated`);
    if (pendingCsv.rejectedRows.length > 0) {
      bits.push(`${pendingCsv.rejectedRows.length} rejected (${pendingCsv.rejectedRows.map((r) => `row ${r.rowNumber}: ${r.reason}`).join('; ')})`);
    }
    setNotice(bits.join(' · ') + '. ' + scorecardLine(score));
    setPendingCsv(null);
    setOverwrite(false);
    await reloadLinks();
    if (hubMode || browsing) setDirectory(await listSuppliers());
  };

  // B1: In-app Add Supplier
  const openAdd = () => {
    setForm({
      businessName: '',
      contact: '',
      address: '',
      specialty: '',
      tags: '',
      note: '',
    });
    setModal('add');
  };

  // B1: In-app Edit Supplier
  const openEdit = (supplier) => {
    setForm({
      businessName: supplier.businessName || '',
      contact: supplier.contact || '',
      address: supplier.address || '',
      specialty: supplier.specialty || '',
      tags: Array.isArray(supplier.tags) ? supplier.tags.join(', ') : '',
      note: supplier.note || supplier.logisticsNote || '',
    });
    setModal({ type: 'edit', supplier });
  };

  const saveSupplier = async (e) => {
    e.preventDefault();
    if (!form.businessName.trim()) {
      setNotice('Business name is required.');
      return;
    }
    const tagsArr = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (modal === 'add') {
      try {
        const payload = {
          businessName: form.businessName.trim(),
          contact: form.contact.trim() || null,
          address: form.address.trim() || null,
          specialty: form.specialty.trim() || null,
          tags: tagsArr,
          note: form.note.trim() || null,
          logisticsNote: form.note.trim() || null,
        };
        // Hub mode has no project to link to, so add is a plain directory write;
        // project mode keeps the dedupe-and-link rule (supplierLinking.js).
        const s = hubMode
          ? await createSupplier(payload)
          : await linkSupplierEntry(projectId, payload, linkDeps);
        setNotice(
          hubMode
            ? `Supplier "${s.businessName}" saved to the directory.`
            : `Supplier "${s.businessName}" saved and linked.`
        );
        setModal(null);
        await reloadLinks();
        if (hubMode || browsing) setDirectory(await listSuppliers());
      } catch (err) {
        setNotice(`Add failed: ${err.message}`);
      }
    } else if (modal && modal.type === 'edit') {
      try {
        await updateSupplier(modal.supplier.id, {
          businessName: form.businessName.trim(),
          contact: form.contact.trim() || null,
          address: form.address.trim() || null,
          specialty: form.specialty.trim() || null,
          tags: tagsArr,
          note: form.note.trim() || null,
          logisticsNote: form.note.trim() || null,
        });
        setNotice(`Saved changes to "${form.businessName.trim()}".`);
        setModal(null);
        await reloadLinks();
        if (hubMode || browsing) setDirectory(await listSuppliers());
      } catch (err) {
        setNotice(`Update failed: ${err.message}`);
      }
    }
  };

  // B1: In-app Delete Supplier (blocked if linked to any project)
  const handleDelete = async (supplier) => {
    try {
      const count = await countSupplierProjectLinks(supplier.id);
      if (count > 0) {
        setModal({ type: 'deleteBlocked', supplier, count });
        return;
      }
      if (window.confirm(`Delete "${supplier.businessName}" from the global directory?`)) {
        await deleteSupplier(supplier.id);
        setNotice(`Deleted "${supplier.businessName}".`);
        await reloadLinks();
        if (hubMode || browsing) setDirectory(await listSuppliers());
      }
    } catch (err) {
      setNotice(`Delete failed: ${err.message}`);
    }
  };

  const handleUnlink = async (supplierId) => {
    await unlinkSupplier(projectId, supplierId);
    setNotice('Removed link to this project.');
    setModal(null);
    await reloadLinks();
    if (hubMode || browsing) setDirectory(await listSuppliers());
  };

  // B3: Verified date toggle
  const toggleVerified = async (supplier) => {
    const next = supplier.verifiedDate ? null : new Date().toISOString();
    await updateSupplier(supplier.id, { verifiedDate: next });
    setNotice(next ? `Marked "${supplier.businessName}" as verified.` : `Cleared verification for "${supplier.businessName}".`);
    await reloadLinks();
    if (hubMode || browsing) setDirectory(await listSuppliers());
  };

  // Tag chips are data-driven: only tags actually present in the directory appear.
  const allTags = [...new Set(directory.flatMap((s) => (Array.isArray(s.tags) ? s.tags : [])))];
  const visible = directory.filter(
    (s) => matchesQuery(s, query) && (activeTag === null || (s.tags || []).includes(activeTag))
  );

  /**
   * Helper to render one-tap action buttons (WhatsApp, Call, Verified, Edit, Delete).
   * Adheres strictly to touchTargets (min-height: 48px, min-width: 48px).
   */
  const renderActions = (s, isLinked = false) => {
    const contactVal = s.contact && !/^null$/i.test(String(s.contact).trim()) ? String(s.contact).trim() : null;
    const digits = contactVal ? normalizePhoneForWhatsApp(contactVal) : null;
    const callNumber = contactVal ? contactVal.split('/')[0].trim() : null;

    return (
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {contactVal && digits && (
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.125rem' }}>
            <a
              className="btn secondary"
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noreferrer"
              title="Opens WhatsApp. Nothing is sent."
              style={{ minHeight: '48px', minWidth: '48px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              WhatsApp
            </a>
            <span className="small muted" style={{ fontSize: '0.7rem' }}>Opens WhatsApp. Nothing is sent.</span>
          </div>
        )}
        {contactVal && !digits && (
          <button
            className="secondary"
            onClick={() => openEdit(s)}
            style={{ minHeight: '48px', minWidth: '48px' }}
            title="Phone number format needs correction"
          >
            Fix number
          </button>
        )}
        {contactVal && callNumber && (
          <a
            className="btn secondary"
            href={`tel:${callNumber}`}
            style={{ minHeight: '48px', minWidth: '48px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            Call
          </a>
        )}
        <button
          className="secondary"
          onClick={() => toggleVerified(s)}
          style={{ minHeight: '48px', minWidth: '48px' }}
        >
          {s.verifiedDate ? 'Unverify' : 'Verify'}
        </button>
        <button
          className="secondary"
          onClick={() => openEdit(s)}
          style={{ minHeight: '48px', minWidth: '48px' }}
        >
          Edit
        </button>
        <button
          className="secondary"
          onClick={() => handleDelete(s)}
          style={{ minHeight: '48px', minWidth: '48px' }}
        >
          Delete
        </button>
        {/* Project-link affordance: never in hub mode — there is no "this project". */}
        {!hubMode && browsing && (
          <button
            disabled={isLinked}
            onClick={() => linkRow(s)}
            style={{ minHeight: '48px', minWidth: '48px' }}
          >
            {isLinked ? 'Linked ✓' : 'Link to this project'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="container">
      {/* Hub mode counts the directory; project mode counts this project's links. */}
      <h1>{hubMode ? `Supplier Hub (${directory.length})` : `Suppliers (${rows.length})`}</h1>
      {notice && <div className="card" role="status" style={{ margin: '0.5rem 0' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={openAdd}>+ Add supplier</button>
        <button className="secondary" onClick={exportCsv}>Export CSV</button>
        <button className="secondary" onClick={() => document.getElementById('csv-file-input').click()}>
          Import CSV
        </button>
        {/* Project mode only: the hub is the same screen without a project. */}
        {!hubMode && onOpenDirectory && (
          <button className="secondary" onClick={onOpenDirectory}>Open supplier directory</button>
        )}
        <input
          id="csv-file-input"
          type="file"
          accept=".csv,.txt"
          style={{ display: 'none' }}
          onChange={(e) => { stageCsvFile(e.target.files[0]); e.target.value = ''; }}
        />
      </div>

      {/* B1: Add / Edit modal */}
      {(modal === 'add' || (modal && modal.type === 'edit')) && (
        <div className="card anim-panel" style={{ marginBottom: '1rem', border: '2px solid var(--primary)' }}>
          <h3>{modal === 'add' ? 'Add new supplier' : `Edit "${modal.supplier.businessName}"`}</h3>
          <form onSubmit={saveSupplier}>
            <div style={{ marginBottom: '0.5rem' }}>
              <label className="small" htmlFor="sup-name">Business Name *</label>
              <input
                id="sup-name"
                required
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder="e.g. Lian Phong Hardware"
              />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label className="small" htmlFor="sup-contact">Contact Number</label>
              <input
                id="sup-contact"
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder="e.g. 014-679 0770"
              />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label className="small" htmlFor="sup-address">Address / Town</label>
              <input
                id="sup-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder="e.g. Betong, Sarawak"
              />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label className="small" htmlFor="sup-specialty">Specialty</label>
              <input
                id="sup-specialty"
                value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder="e.g. Timber, Nails, Adhesives"
              />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label className="small" htmlFor="sup-tags">Tags (comma-separated)</label>
              <input
                id="sup-tags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder="e.g. hardware, local, quick"
              />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label className="small" htmlFor="sup-note">Note / Logistics</label>
              <input
                id="sup-note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder="e.g. Closes at 4pm on Saturdays"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="submit">Save supplier</button>
              <button type="button" className="secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* B1: Delete Blocked dialogue */}
      {modal && modal.type === 'deleteBlocked' && (
        <div className="card anim-panel banner blocked" style={{ marginBottom: '1rem' }} role="alert">
          <h3>Cannot delete "{modal.supplier.businessName}"</h3>
          <p>
            This supplier is currently used in {modal.count} {modal.count === 1 ? 'project' : 'projects'}.
            Suppliers linked to projects cannot be deleted from the directory to prevent orphan data.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            {/* Unlink needs an open project; the hub cannot remove another project's link. */}
            {!hubMode && (
              <button onClick={() => handleUnlink(modal.supplier.id)}>
                Remove link from this project instead
              </button>
            )}
            <button className="secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {pendingCsv && (
        <div className="card anim-panel" style={{ marginBottom: '0.5rem' }}>
          <h3>Confirm CSV import (nothing written yet)</h3>
          <p>
            {pendingCsv.preview.created} will be created, {pendingCsv.preview.skipped} already
            exist, will skip
            {pendingCsv.rejectedRows.length > 0 &&
              `, ${pendingCsv.rejectedRows.length} rejected (${pendingCsv.rejectedRows.map((r) => `row ${r.rowNumber}: ${r.reason}`).join('; ')})`}
            .
          </p>
          <label className="small" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.5rem 0' }}>
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            Overwrite existing suppliers with CSV values
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={confirmCsvImport}>Confirm import</button>
            <button className="secondary" onClick={() => { setPendingCsv(null); setOverwrite(false); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!hubMode && !browsing && (
        <button onClick={openBrowser} style={{ marginBottom: '0.5rem' }}>
          Browse All Suppliers
        </button>
      )}

      {/* Hub mode shows the directory as the screen itself; project mode reveals
          it on demand so the tab still leads with this project's links. */}
      {(hubMode || browsing) && (
        <div className="card anim-panel" style={{ marginBottom: '0.5rem' }}>
          <h3>Global Supplier Directory ({visible.length}/{directory.length})</h3>
          <label className="small" htmlFor="supplier-search">Search suppliers</label>
          <input
            id="supplier-search"
            type="search"
            placeholder="Search name, specialty, address (e.g. Kuching)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', marginTop: '0.25rem' }}
          />
          {allTags.length > 0 && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              <button
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                onClick={() => setActiveTag(null)}
              >
                All{activeTag === null ? ' ✓' : ''}
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                  onClick={() => setActiveTag(t === activeTag ? null : t)}
                >
                  {t}{t === activeTag ? ' ✓' : ''}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: '0.5rem' }}>
            {visible.map((s) => {
              const linked = linkedIds.has(s.id);
              const hasContact = s.contact && !/^null$/i.test(String(s.contact).trim());
              return (
                <div key={s.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <strong>{s.businessName}</strong>
                    {s.verifiedDate && (
                      <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>
                        Verified {formatShortDate(s.verifiedDate)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {[s.specialty, s.address].filter(Boolean).join(' · ')}
                  </div>
                  {hasContact ? (
                    <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Contact: {s.contact}</div>
                  ) : (
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Contact not listed
                    </div>
                  )}
                  {(s.note || s.logisticsNote) && (
                    <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>
                      Note: {s.note || s.logisticsNote}
                    </div>
                  )}
                  {renderActions(s, linked)}
                </div>
              );
            })}
            {visible.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>No suppliers match.</p>
            )}
          </div>
          {!hubMode && (
            <button onClick={() => setBrowsing(false)} style={{ marginTop: '0.75rem' }}>
              Back to project suppliers
            </button>
          )}
        </div>
      )}

      {!hubMode && rows.map(({ link, supplier }) => {
        const hasContact = supplier.contact && !/^null$/i.test(String(supplier.contact).trim());
        return (
          <div key={`${link.projectId}-${link.globalSupplierId}`} className="card" style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong>{supplier.businessName}</strong>
              {supplier.verifiedDate && (
                <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>
                  Verified {formatShortDate(supplier.verifiedDate)}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
              {hasContact ? (
                <div>Contact: {supplier.contact}</div>
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>Contact not listed</div>
              )}
              {supplier.address && <div>{supplier.address}</div>}
              {supplier.specialty && <div>Specialty: {supplier.specialty}</div>}
              {(supplier.note || supplier.logisticsNote) && (
                <div>Note: {supplier.note || supplier.logisticsNote}</div>
              )}
              {supplier.sourceUrl && (
                <div><a className="btn" href={supplier.sourceUrl} target="_blank" rel="noreferrer">Source</a></div>
              )}
            </div>
            {renderActions(supplier, true)}
          </div>
        );
      })}
      {!hubMode && rows.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No suppliers linked to this project.</p>
      )}
    </div>
  );
}

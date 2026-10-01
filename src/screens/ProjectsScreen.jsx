/**
 * ProjectsScreen.jsx — Agent 4 entry screen (outside any project).
 * Lists projects + imports .md/.xlsx into new or matched projects.
 * Wiring only: parse/match/seed decisions live in Agent 1/3 + repos.
 */
import React, { useEffect, useState } from 'react';
import { listProjects, createProject, deleteProject } from '../data/projectRepo.js';
import {
  parseImport,
  friendlyImportError,
  isEmptyImport,
  detectFormat,
  blobToText,
  blobToArrayBuffer,
} from '../utils/importParser/index.js';
import { matchProject } from '../logic/projectMatcher.js';
import { reimportProject } from '../logic/reimportProject.js';
import { seedProjectFromImport } from '../logic/seedProject.js';
import { scoreBomImport, scorecardLine } from '../logic/importScorecard.js';
import { createImportRun } from '../data/importRunRepo.js';
import * as bomRepo from '../data/bomRepo.js';
import * as shortageRepo from '../data/shortageRepo.js';
import * as supplierRepo from '../data/supplierRepo.js';
import * as changeLogRepo from '../data/changeLogRepo.js';
import * as presetRepo from '../data/presetRepo.js';

const mergeDeps = {
  listBomItems: bomRepo.listBomItems,
  getBomItem: bomRepo.getBomItem,
  updateBomItem: bomRepo.updateBomItem,
  lockField: bomRepo.lockField,
  appendChangeLog: changeLogRepo.appendChangeLog,
  createShortageItem: shortageRepo.createShortageItem,
  listShortageItems: shortageRepo.listShortageItems,
};

const seedDeps = {
  bulkCreateBomItems: bomRepo.bulkCreateBomItems,
  bulkCreateShortageItems: shortageRepo.bulkCreateShortageItems,
  createSupplier: supplierRepo.createSupplier,
  listSuppliers: supplierRepo.listSuppliers,
  linkSupplierToProject: supplierRepo.linkSupplierToProject,
  appendChangeLog: changeLogRepo.appendChangeLog,
  updateBomItem: bomRepo.updateBomItem,
  getPreset: presetRepo.getPreset,
  getSupplier: supplierRepo.getSupplier,
};

// Merge path needs the merge deps plus the supplier-linking deps.
const reimportDeps = {
  ...mergeDeps,
  listSuppliers: supplierRepo.listSuppliers,
  createSupplier: supplierRepo.createSupplier,
  linkSupplierToProject: supplierRepo.linkSupplierToProject,
  updateBomItem: bomRepo.updateBomItem,
  getPreset: presetRepo.getPreset,
  getSupplier: supplierRepo.getSupplier,
};

export default function ProjectsScreen({ onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const reload = async () => setProjects(await listProjects());
  useEffect(() => { reload(); }, []);

  // Two-tap delete: first tap arms, second tap cascades (project + its BOM,
  // confirmations, links, log). GlobalSupplier records are shared and survive.
  const handleDelete = async (id, name) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    await deleteProject(id);
    setStatus(`Deleted "${name}" and its project data. Shared suppliers kept.`);
    await reload();
  };

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      setProgress('Parsing import…');
      // Read the source once; parseImport short-circuits for string/ArrayBuffer,
      // and the same source feeds the Lane 1A scorecard verifier.
      const format = detectFormat(file.name);
      const source = format === 'md' ? await blobToText(file) : await blobToArrayBuffer(file);
      const { parsed } = await parseImport(source, file.name);
      if (isEmptyImport(parsed)) {
        setStatus(friendlyImportError(new Error('no recognizable BOM content')));
        return;
      }
      // Passive trust pass: independent recount + per-line compare vs the source.
      const score = scoreBomImport({ format, parsed, source });
      setProgress('Matching project…');
      const match = await matchProject(parsed.projectTitle);
      setProgress('Saving…');
      if (match.action === 'match') {
        const result = await reimportProject(match.project.id, parsed, reimportDeps);
        await createImportRun({ ...score, fileName: file.name, projectId: match.project.id });
        setStatus(
          `Merged ${format} into "${match.project.name}": ` +
          `${result.updatedCount} updated, ${result.newPendingIds.length} new-pending, ` +
          `${result.removedPendingIds.length} removed-pending, ${result.skippedLocked.length} locked-skipped, ` +
          `${result.supplierCount} suppliers linked. ${scorecardLine(score)}`
        );
        await reload();
        onOpenProject(match.project.id);
      } else {
        const project = await createProject({ name: parsed.projectTitle, location: parsed.location ?? null });
        const seed = await seedProjectFromImport(project.id, parsed, seedDeps);
        await createImportRun({ ...score, fileName: file.name, projectId: project.id });
        setStatus(
          `Created "${project.name}": ${seed.bomCount} BOM lines, ` +
          `${seed.shortageCount} confirmations, ${seed.supplierCount} suppliers. ${scorecardLine(score)}`
        );
        await reload();
        onOpenProject(project.id);
      }
    } catch (err) {
      console.error('Import failed:', err);
      setStatus(friendlyImportError(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="container">
      <header className="page-header">
        <p className="eyebrow">Material Logi</p>
        <h1>Projects</h1>
        <p className="page-intro">Import a bill of materials, resolve exceptions, and prepare supplier-ready orders.</p>
      </header>

      <div className="card import-card">
        <h2>Start with a BOM</h2>
        <p className="muted" style={{ margin: '0.5rem 0' }}>
          Accepts Agent-6 output: <code>.md</code> or <code>.xlsx</code>
        </p>
        <label className={`file-picker${busy ? ' is-busy' : ''}`}>
          <span>{busy ? 'Import in progress…' : 'Choose BOM file'}</span>
          <small>.md, .xlsx, or .xls</small>
          <input
          type="file"
          accept=".md,.markdown,.txt,.xlsx,.xls"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files[0])}
          />
        </label>
      </div>

      {progress && (
        <div className="banner notice" role="status" aria-live="polite">
          {progress}
        </div>
      )}

      {status && (
        <div className="banner notice" role="status">
          {status}
        </div>
      )}

      <div className="section-heading">
        <h2>Your projects</h2>
        <span className="badge">{projects.length}</span>
      </div>
      {projects.map((p) => (
        <div key={p.id} className="card project-card">
          <strong className="project-name">{p.name}</strong>
          <div className="action-row">
            <button onClick={() => onOpenProject(p.id)}>Open</button>
            <button className="secondary danger-ghost" onClick={() => handleDelete(p.id, p.name)}>
              {confirmDeleteId === p.id ? 'Tap again to confirm delete' : 'Delete'}
            </button>
          </div>
          {confirmDeleteId === p.id && (
            <p className="small" style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Deletes its BOM, confirmations and history. Shared suppliers stay.
            </p>
          )}
        </div>
      ))}
      {projects.length === 0 && (
        <div className="empty-state"><strong>No projects yet</strong><span>Import a file above to create your first project.</span></div>
      )}
    </div>
  );
}

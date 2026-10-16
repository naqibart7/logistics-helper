/**
 * syncStatus.js — Lane 2: visible sync state ("visible trust" principle).
 *
 * Safe to import and call in ANY state: returns { enabled: false } when the
 * cloud addon isn't registered (no VITE_DEXIE_CLOUD_URL at build time) — the
 * app honestly shows "Local only". When sync is configured, db.cloud exposes
 * a status observable; we map addon states to plain, non-technical labels:
 *
 *   offline   → "Offline — changes saved here, will sync"
 *   connecting→ "Connecting…"
 *   syncing   → "Syncing…"
 *   online    → "Synced" (+ last sync time when the addon reports one)
 *
 * The chip never blocks anything; it only reports.
 */
import { useEffect, useState } from 'react';
import db from './db.js';

/** Is cloud sync configured for this build? */
export const isSyncEnabled = () =>
  !!(db.cloud && db.cloud.options && db.cloud.options.databaseUrl);

/** Latest persisted sync info from the addon (null-safe). */
export const getSyncInfo = () => {
  if (!isSyncEnabled()) return null;
  let lastSync = null;
  try {
    const persisted = db.cloud.persistedSyncState && db.cloud.persistedSyncState.value;
    if (persisted && persisted.lastSync) lastSync = new Date(persisted.lastSync);
  } catch {
    lastSync = null;
  }
  const status = (db.cloud.status && typeof db.cloud.status.value === 'string')
    ? db.cloud.status.value
    : 'unknown';
  return { status, lastSync };
};

/** Map an addon status to the chip label. Unknown states pass through honestly. */
export const syncStatusLabel = (info) => {
  if (!info) return 'Local only';
  switch (info.status) {
    case 'offline':
      return 'Offline — changes saved here, will sync';
    case 'connecting':
      return 'Connecting…';
    case 'syncing':
      return 'Syncing…';
    case 'online':
      return 'Synced';
    default:
      return info.status;
  }
};

/** Subscribe to status changes. Returns an unsubscribe function (or null when inert). */
export const subscribeSyncStatus = (onChange) => {
  if (!isSyncEnabled() || !db.cloud.status || typeof db.cloud.status.subscribe !== 'function') {
    return null;
  }
  return db.cloud.status.subscribe(onChange);
};

/**
 * React hook for screens that must explain whether cloud-backed behaviour is
 * available. `canSync` is the gate the stock module asks for (it would drive the
 * Telegram low-stock ping); it is false on a local-only build, which is the
 * honest answer rather than an error.
 */
export const useSyncStatus = () => {
  const [info, setInfo] = useState(isSyncEnabled() ? getSyncInfo() : null);

  useEffect(() => {
    if (!isSyncEnabled()) return undefined;
    setInfo(getSyncInfo());
    const unsubscribe = subscribeSyncStatus(() => setInfo(getSyncInfo()));
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  return { canSync: isSyncEnabled(), info, label: syncStatusLabel(info) };
};

export default { isSyncEnabled, getSyncInfo, syncStatusLabel, subscribeSyncStatus, useSyncStatus };

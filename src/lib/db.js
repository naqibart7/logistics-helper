import Dexie from 'dexie'

// IndexedDB for offline-first checklist sync queue
export const db = new Dexie('SiteMaterialsDB')

db.version(1).stores({
  // Queue for offline changes to sync when online
  syncQueue: '++id, [type+entityId], createdAt',
  // Local cache of materials for offline viewing
  materialsCache: 'id, projectId',
  // Local cache of projects
  projectsCache: 'id'
})

// Queue operations
export async function addToSyncQueue(operation) {
  await db.syncQueue.add({
    ...operation,
    createdAt: new Date(),
    synced: false
  })
}

export async function getPendingSyncOperations() {
  return await db.syncQueue.where('synced').equals(false).sortBy('createdAt')
}

export async function markSynced(ids) {
  await db.syncQueue.bulkUpdate(ids.map(id => ({ id, synced: true })))
}

export async function clearSyncedOperations() {
  await db.syncQueue.where('synced').equals(true).delete()
}

// Cache operations
export async function cacheMaterials(materials) {
  await db.materialsCache.bulkPut(materials)
}

export async function getCachedMaterials(projectId) {
  if (projectId) {
    return await db.materialsCache.where('projectId').equals(projectId).toArray()
  }
  return await db.materialsCache.toArray()
}

export async function cacheProjects(projects) {
  await db.projectsCache.bulkPut(projects)
}

export async function getCachedProjects() {
  return await db.projectsCache.toArray()
}

/**
 * changeLogRepo.js — Agent 2: append-only log writer/reader.
 * Rows are never updated or deleted through this module.
 */
import db from './db.js';
import { generateId } from '../utils/helpers.js';

export const appendChangeLog = async ({ projectId, actor, field, oldValue = null, newValue = null, ...rest }) => {
  if (actor !== 'agent' && actor !== 'supervisor') {
    throw new Error(`Invalid ChangeLog actor: ${actor}`);
  }
  const row = {
    id: generateId(),
    projectId,
    timestamp: new Date().toISOString(),
    actor,
    field,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    ...rest,
  };
  await db.changeLog.add(row);
  return row;
};

export const listChangeLog = (projectId) =>
  db.changeLog.where('projectId').equals(projectId).sortBy('timestamp');

export default { appendChangeLog, listChangeLog };

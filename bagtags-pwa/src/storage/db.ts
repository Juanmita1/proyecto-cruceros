/**
 * Persistencia local en IndexedDB. Nada sale del dispositivo.
 *
 * Almacenes:
 *   shifts     turnos
 *   controls   controles (solo LPN, hora, resultado, vuelo)  — índice shiftId
 *   incidents  incidencias (con fotos y, opcionalmente, datos del pasajero) — índice shiftId
 *   kv         configuración y preferencias del dispositivo
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ControlRecord, Incident, Shift } from '../domain/types';
import { DEFAULT_CONFIG, sanitizeConfig, type AppConfig } from '../domain/config';
import { planPurge, type PurgePlan } from '../domain/retention';

/** Preferencias propias del dispositivo (no se exportan con la configuración). */
export interface DevicePrefs {
  lastGuardId: string;
  lastAirport: string;
  lastTerminal: string;
  lastPost: string;
  recentFlights: string[];
  activeShiftId?: string;
}

const DEFAULT_PREFS: DevicePrefs = { lastGuardId: '', lastAirport: '', lastTerminal: '', lastPost: '', recentFlights: [] };

interface BagtagsDB extends DBSchema {
  shifts: { key: string; value: Shift };
  controls: { key: string; value: ControlRecord; indexes: { shiftId: string; ts: number } };
  incidents: { key: string; value: Incident; indexes: { shiftId: string; ts: number } };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<BagtagsDB>> | null = null;

export function db(): Promise<IDBPDatabase<BagtagsDB>> {
  if (!dbp) {
    dbp = openDB<BagtagsDB>('bagtags', 1, {
      upgrade(d) {
        d.createObjectStore('shifts', { keyPath: 'id' });
        const c = d.createObjectStore('controls', { keyPath: 'id' });
        c.createIndex('shiftId', 'shiftId');
        c.createIndex('ts', 'ts');
        const i = d.createObjectStore('incidents', { keyPath: 'id' });
        i.createIndex('shiftId', 'shiftId');
        i.createIndex('ts', 'ts');
        d.createObjectStore('kv');
      },
    });
  }
  return dbp;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Pide al navegador almacenamiento persistente (evita que Safari/Chrome borren IndexedDB por falta de espacio). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// ---------- Configuración ----------

export async function loadConfig(): Promise<AppConfig> {
  const raw = await (await db()).get('kv', 'config');
  return sanitizeConfig(raw ?? {}, DEFAULT_CONFIG);
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await (await db()).put('kv', cfg, 'config');
}

export async function loadPrefs(): Promise<DevicePrefs> {
  const raw = (await (await db()).get('kv', 'prefs')) as Partial<DevicePrefs> | undefined;
  return { ...DEFAULT_PREFS, ...(raw ?? {}) };
}

export async function savePrefs(p: DevicePrefs): Promise<void> {
  await (await db()).put('kv', p, 'prefs');
}

// ---------- Turnos ----------

export async function putShift(s: Shift) {
  await (await db()).put('shifts', s);
}

export async function getShift(id: string) {
  return (await db()).get('shifts', id);
}

export async function listShifts() {
  return (await db()).getAll('shifts');
}

// ---------- Controles e incidencias ----------

export async function putControl(c: ControlRecord) {
  await (await db()).put('controls', c);
}

export async function controlsOf(shiftId: string) {
  return (await db()).getAllFromIndex('controls', 'shiftId', shiftId);
}

export async function putIncident(i: Incident) {
  await (await db()).put('incidents', i);
}

export async function getIncident(id: string) {
  return (await db()).get('incidents', id);
}

export async function incidentsOf(shiftId: string) {
  return (await db()).getAllFromIndex('incidents', 'shiftId', shiftId);
}

export async function deleteIncident(id: string) {
  await (await db()).delete('incidents', id);
}

/** Borra todos los datos de un turno (controles, incidencias y el propio turno). */
export async function deleteShiftData(shiftId: string) {
  const d = await db();
  const tx = d.transaction(['shifts', 'controls', 'incidents'], 'readwrite');
  for (const k of await tx.objectStore('controls').index('shiftId').getAllKeys(shiftId)) await tx.objectStore('controls').delete(k);
  for (const k of await tx.objectStore('incidents').index('shiftId').getAllKeys(shiftId)) await tx.objectStore('incidents').delete(k);
  await tx.objectStore('shifts').delete(shiftId);
  await tx.done;
}

/** Borra TODOS los registros operativos (conserva configuración). */
export async function wipeAllData() {
  const d = await db();
  const tx = d.transaction(['shifts', 'controls', 'incidents'], 'readwrite');
  await Promise.all([tx.objectStore('shifts').clear(), tx.objectStore('controls').clear(), tx.objectStore('incidents').clear()]);
  await tx.done;
}

/** Aplica la política de borrado automático. Devuelve lo borrado. */
export async function runRetention(cfg: AppConfig, activeShiftId?: string, now = Date.now()): Promise<PurgePlan> {
  const d = await db();
  const [shifts, controls, incidents] = await Promise.all([d.getAll('shifts'), d.getAll('controls'), d.getAll('incidents')]);
  const plan = planPurge(now, { controlsHours: cfg.retentionControlsHours, incidentsDays: cfg.retentionIncidentsDays }, shifts, controls, incidents, activeShiftId);
  if (plan.controls.length + plan.incidents.length + plan.shifts.length > 0) {
    const tx = d.transaction(['shifts', 'controls', 'incidents'], 'readwrite');
    for (const id of plan.controls) await tx.objectStore('controls').delete(id);
    for (const id of plan.incidents) await tx.objectStore('incidents').delete(id);
    for (const id of plan.shifts) await tx.objectStore('shifts').delete(id);
    await tx.done;
  }
  return plan;
}

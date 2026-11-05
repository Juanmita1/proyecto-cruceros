/**
 * Persistencia local en IndexedDB. Nada sale del dispositivo salvo el PDF que
 * se envía por correo.
 *
 *   tickets  tickets abiertos, cerrados y pendientes de envío (con fotos)
 *   kv       configuración y preferencias del dispositivo
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { GuardInfo, Ticket } from '../domain/types';
import { DEFAULT_CONFIG, sanitizeConfig, type AppConfig } from '../domain/config';
import { expiredTickets } from '../domain/ticket';

/** Preferencias propias del dispositivo (no se exportan con la configuración). */
export interface DevicePrefs {
  guard: GuardInfo | null;
  /** Fecha (AAAA-MM-DD) en que se introdujeron los datos del vigilante: se vuelven a pedir cada día. */
  guardDate: string;
  activeTicketId?: string;
}

const DEFAULT_PREFS: DevicePrefs = { guard: null, guardDate: '' };

interface BagtagsDB extends DBSchema {
  tickets: { key: string; value: Ticket; indexes: { createdAt: number } };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<BagtagsDB>> | null = null;

export function db(): Promise<IDBPDatabase<BagtagsDB>> {
  if (!dbp) {
    dbp = openDB<BagtagsDB>('bagtags', 2, {
      upgrade(d, oldVersion) {
        // v1 (control en salida por turnos) se sustituye por los tickets de cinta.
        if (oldVersion === 1) {
          for (const s of ['shifts', 'controls', 'incidents']) {
            if (d.objectStoreNames.contains(s as never)) d.deleteObjectStore(s as never);
          }
        }
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('tickets')) d.createObjectStore('tickets', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      },
    });
  }
  return dbp;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Pide al navegador almacenamiento persistente (evita que borre IndexedDB por falta de espacio). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function loadConfig(): Promise<AppConfig> {
  return sanitizeConfig((await (await db()).get('kv', 'config')) ?? {}, DEFAULT_CONFIG);
}

export async function saveConfig(cfg: AppConfig) {
  await (await db()).put('kv', cfg, 'config');
}

export async function loadPrefs(): Promise<DevicePrefs> {
  const raw = (await (await db()).get('kv', 'prefs')) as Partial<DevicePrefs> | undefined;
  return { ...DEFAULT_PREFS, ...(raw && 'guardDate' in raw ? raw : {}) };
}

export async function savePrefs(p: DevicePrefs) {
  await (await db()).put('kv', p, 'prefs');
}

export async function putTicket(t: Ticket) {
  await (await db()).put('tickets', t);
}

export async function getTicket(id: string) {
  return (await db()).get('tickets', id);
}

export async function listTickets(): Promise<Ticket[]> {
  return (await (await db()).getAll('tickets')).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteTicket(id: string) {
  await (await db()).delete('tickets', id);
}

export async function wipeTickets() {
  await (await db()).clear('tickets');
}

/** Borrado automático de los tickets ya enviados más antiguos que el plazo configurado. */
export async function runRetention(cfg: AppConfig, now = Date.now()): Promise<number> {
  const ids = expiredTickets(await (await db()).getAll('tickets'), now, cfg.retentionDays);
  const d = await db();
  for (const id of ids) await d.delete('tickets', id);
  return ids.length;
}

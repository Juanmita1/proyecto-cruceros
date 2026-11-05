/**
 * Punto de extensión para la sincronización OPCIONAL con SharePoint /
 * Power Automate. NO está implementada: la app funciona 100 % offline y no
 * envía nada a ningún servidor.
 *
 * Diseño previsto:
 *  - Un flujo de Power Automate con disparador "Cuando se recibe una solicitud
 *    HTTP" expone un endpoint HTTPS (configurable en Configuración → sync.endpoint).
 *  - Al cerrar el turno (o cuando haya red) se enviaría el mismo contenido que
 *    el CSV, como JSON, con una cola local de reintentos en IndexedDB.
 *  - Los datos personales de las incidencias solo se enviarían si la política
 *    de la organización lo permite (flag aparte).
 *
 * Para implementarla basta con crear una clase que cumpla `SyncAdapter` y
 * devolverla desde `getSyncAdapter` cuando `cfg.sync.enabled` sea true.
 */
import type { AppConfig } from '../domain/config';
import type { ControlRecord, Incident, Shift } from '../domain/types';

export interface SyncPayload {
  shift: Shift;
  controls: ControlRecord[];
  /** Incidencias sin fotos (las fotos irían en una segunda llamada). */
  incidents: Omit<Incident, 'photos'>[];
}

export interface SyncAdapter {
  readonly name: string;
  isAvailable(): boolean;
  push(payload: SyncPayload): Promise<{ ok: boolean; message: string }>;
}

/** Adaptador por defecto: no hace nada. */
export class NoopSync implements SyncAdapter {
  readonly name = 'Sin sincronización';
  isAvailable() {
    return false;
  }
  async push() {
    return { ok: false, message: 'Sincronización no disponible en esta versión' };
  }
}

export function getSyncAdapter(_cfg: AppConfig): SyncAdapter {
  return new NoopSync();
}

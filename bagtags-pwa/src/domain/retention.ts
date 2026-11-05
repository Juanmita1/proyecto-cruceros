/**
 * Borrado automático (RGPD, limitación del plazo de conservación).
 * Por defecto: controles 72 h, incidencias 30 días.
 */
import type { ControlRecord, Incident, Shift } from './types';

export interface RetentionPolicy {
  controlsHours: number;
  incidentsDays: number;
}

export interface PurgePlan {
  controls: string[];
  incidents: string[];
  shifts: string[];
}

const HOUR = 3600_000;

export function planPurge(
  now: number,
  policy: RetentionPolicy,
  shifts: Shift[],
  controls: ControlRecord[],
  incidents: Incident[],
  activeShiftId?: string,
): PurgePlan {
  const cLimit = now - policy.controlsHours * HOUR;
  const iLimit = now - policy.incidentsDays * 24 * HOUR;
  const delControls = controls.filter((c) => c.ts < cLimit);
  const delIncidents = incidents.filter((i) => i.ts < iLimit);
  const goneC = new Set(delControls.map((c) => c.id));
  const goneI = new Set(delIncidents.map((i) => i.id));
  // Un turno se borra cuando ha terminado, ya no tiene registros y es más antiguo que el plazo de controles.
  const delShifts = shifts.filter(
    (s) =>
      s.id !== activeShiftId &&
      s.endedAt !== undefined &&
      s.endedAt < cLimit &&
      !controls.some((c) => c.shiftId === s.id && !goneC.has(c.id)) &&
      !incidents.some((i) => i.shiftId === s.id && !goneI.has(i.id)),
  );
  return { controls: [...goneC], incidents: [...goneI], shifts: delShifts.map((s) => s.id) };
}

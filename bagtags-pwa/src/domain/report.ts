/** Resumen del turno y exportación CSV (UTF-8 con BOM, separador ";"). */
import type { ControlRecord, Incident, Shift } from './types';
import type { ControlResult } from './matcher';

export const RESULT_LABEL: Record<ControlResult, string> = {
  ok: 'CORRECTO',
  incomplete_confirmed: 'CORRECTO (incompleto confirmado)',
  mismatch: 'NO COINCIDE',
  incomplete: 'INCOMPLETO',
  already: 'YA CONTROLADA',
};

export interface ShiftSummary {
  total: number;
  correct: number;
  ok: number;
  incompleteConfirmed: number;
  incomplete: number;
  mismatch: number;
  already: number;
  bags: number;
  manualValidations: number;
  manualEntries: number;
  incidents: number;
  incidentsByType: [string, number][];
  incidentsByAction: [string, number][];
  perHour: [string, number][];
  perFlight: [string, number][];
  /** Mediana de duración de los controles CORRECTOS (ms). */
  medianDurationMs: number | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fmtTime(ts: number, seconds = true): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}${seconds ? ':' + pad2(d.getSeconds()) : ''}`;
}

/** ISO 8601 con desplazamiento local (útil para Power Automate / SharePoint). */
export function isoLocal(ts: number): string {
  const d = new Date(ts);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` +
    `${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`
  );
}

function countBy<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return [...m.entries()];
}

export function summarize(controls: ControlRecord[], incidents: Incident[]): ShiftSummary {
  const by = (r: ControlResult) => controls.filter((c) => c.result === r).length;
  const durations = controls
    .filter((c) => (c.result === 'ok' || c.result === 'incomplete_confirmed') && typeof c.durationMs === 'number')
    .map((c) => c.durationMs as number)
    .sort((a, b) => a - b);
  const median = durations.length
    ? durations.length % 2
      ? durations[(durations.length - 1) / 2]
      : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
    : null;
  return {
    total: controls.length,
    ok: by('ok'),
    incompleteConfirmed: by('incomplete_confirmed'),
    correct: by('ok') + by('incomplete_confirmed'),
    incomplete: by('incomplete'),
    mismatch: by('mismatch'),
    already: by('already'),
    bags: controls.reduce((n, c) => n + c.bags.length, 0),
    manualValidations: controls.filter((c) => c.manualValidation).length,
    manualEntries: controls.filter((c) => c.manualEntry).length,
    incidents: incidents.length,
    incidentsByType: countBy(incidents, (i) => i.type).sort((a, b) => b[1] - a[1]),
    incidentsByAction: countBy(incidents, (i) => i.action || '—').sort((a, b) => b[1] - a[1]),
    perHour: countBy(controls, (c) => pad2(new Date(c.ts).getHours()) + ':00').sort((a, b) => a[0].localeCompare(b[0])),
    perFlight: countBy(controls, (c) => c.flight || 'Sin vuelo').sort((a, b) => b[1] - a[1]),
    medianDurationMs: median,
  };
}

/**
 * Escapa un campo CSV. Además neutraliza la "inyección de fórmulas" en texto
 * libre (observaciones, nombres): si empieza por = + - @ se antepone un apóstrofo.
 */
export function csvField(v: unknown, freeText = false): string {
  let s = v == null ? '' : String(v);
  if (freeText && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[";\r\n]/.test(s) || s !== s.trim()) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Formatea una lista de LPN. En modo "excel" se usa ="..." para que Excel no quite los ceros iniciales. */
export function csvLpns(ids: string[], mode: 'excel' | 'plain'): string {
  const joined = ids.join(' | ');
  if (!joined) return '';
  return mode === 'excel' ? `="${joined}"` : joined;
}

export const CSV_COLUMNS = [
  'registro',
  'id',
  'fecha',
  'hora',
  'fecha_hora_iso',
  'aeropuerto',
  'terminal',
  'puesto',
  'vigilante',
  'vuelo',
  'resultado',
  'num_resguardos',
  'num_maletas',
  'resguardos',
  'maletas',
  'maletas_sin_coincidencia',
  'validacion_manual',
  'entrada_manual',
  'duracion_s',
  'incidencia_id',
  'incidencia_tipo',
  'incidencia_accion',
  'observaciones',
  'pasajero_nombre',
  'pasajero_pnr',
  'pasajero_ruta',
  'pasajero_fecha_vuelo',
  'fotos',
] as const;

/** Columnas con listas de LPN (no se tratan como texto libre). */
const LPN_COLS = new Set([13, 14, 15]);

/**
 * Genera el CSV del turno: una fila por control y una por incidencia.
 * Los datos de pasajero SOLO aparecen en las filas de incidencia.
 */
export function buildCsv(shift: Shift, controls: ControlRecord[], incidents: Incident[], mode: 'excel' | 'plain' = 'excel'): string {
  const rows: string[] = [CSV_COLUMNS.join(';')];
  const common = (ts: number) => [fmtDate(ts), fmtTime(ts), isoLocal(ts), shift.airport, shift.terminal, shift.post, shift.guardId];
  const yn = (b: boolean) => (b ? 'SI' : 'NO');

  for (const c of [...controls].sort((a, b) => a.ts - b.ts)) {
    const inc = c.incidentId ? incidents.find((i) => i.id === c.incidentId) : undefined;
    rows.push(
      [
        'CONTROL',
        c.id,
        ...common(c.ts),
        c.flight ?? '',
        RESULT_LABEL[c.result],
        c.claims.length,
        c.bags.length,
        csvLpns(c.claims, mode),
        csvLpns(c.bags.map((b) => b.id), mode),
        csvLpns(c.bags.filter((b) => b.status === 'nomatch').map((b) => b.id), mode),
        yn(c.manualValidation),
        yn(c.manualEntry),
        c.durationMs != null ? (c.durationMs / 1000).toFixed(1).replace('.', ',') : '',
        c.incidentId ?? '',
        inc?.type ?? '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]
        .map((v, i) => csvField(v, !LPN_COLS.has(i)))
        .join(';'),
    );
  }

  for (const i of [...incidents].sort((a, b) => a.ts - b.ts)) {
    const p = i.passenger;
    rows.push(
      [
        'INCIDENCIA',
        i.id,
        ...common(i.ts),
        i.flight ?? p?.flight ?? '',
        '',
        i.claims.length,
        i.bags.length,
        csvLpns(i.claims, mode),
        csvLpns(i.bags, mode),
        '',
        '',
        '',
        '',
        i.id,
        i.type,
        i.action,
        i.notes,
        p?.name ?? '',
        p?.pnr ?? '',
        p ? `${p.from}-${p.to}` : '',
        p?.date ?? '',
        i.photos.length,
      ]
        .map((v, i) => csvField(v, !LPN_COLS.has(i)))
        .join(';'),
    );
  }
  // BOM para que Excel detecte UTF-8; CRLF como fin de línea estándar CSV.
  return '﻿' + rows.join('\r\n') + '\r\n';
}

/** Nombre de fichero base para las exportaciones: informe_MAD_T4S_20261105_0700. */
export function reportBaseName(shift: Shift): string {
  const d = new Date(shift.startedAt);
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  const clean = (s: string) => s.normalize('NFD').replace(/[^\w]+/g, '').slice(0, 20);
  return ['informe', clean(shift.airport), clean(shift.post), stamp].filter(Boolean).join('_');
}

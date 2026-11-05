import { describe, expect, it } from 'vitest';
import { buildCsv, csvField, csvLpns, reportBaseName, summarize } from '../src/domain/report';
import { planPurge } from '../src/domain/retention';
import { sanitizeConfig, DEFAULT_CONFIG } from '../src/domain/config';
import type { ControlRecord, Incident, Shift } from '../src/domain/types';

const shift: Shift = { id: 's1', guardId: 'TIP123', airport: 'MAD', terminal: 'T4S', post: 'Salida cintas T4S', flights: [], startedAt: new Date(2026, 10, 5, 7, 0).getTime() };
const at = (h: number, m = 0) => new Date(2026, 10, 5, h, m).getTime();
const controls: ControlRecord[] = [
  { id: 'c1', shiftId: 's1', ts: at(7, 5), result: 'ok', claims: ['0075123456'], bags: [{ id: '0075123456', status: 'match' }], manualValidation: false, manualEntry: false, flight: 'IB3167', durationMs: 4000 },
  { id: 'c2', shiftId: 's1', ts: at(7, 30), result: 'mismatch', claims: ['0075123457'], bags: [{ id: '0030111222', status: 'nomatch' }], manualValidation: false, manualEntry: false, incidentId: 'i1' },
  { id: 'c3', shiftId: 's1', ts: at(8, 10), result: 'incomplete_confirmed', claims: ['0075000001', '0075000002'], bags: [{ id: '0075000001', status: 'manual' }], manualValidation: true, manualEntry: true, flight: 'IB3167', durationMs: 8000 },
];
const incidents: Incident[] = [
  { id: 'i1', shiftId: 's1', controlId: 'c2', ts: at(7, 31), type: 'Maleta no coincide', action: 'Retenida', notes: '=HYPERLINK("x"); "comillas"', claims: ['0075123457'], bags: ['0030111222'], passenger: { name: 'PEREZ ANA', pnr: 'XYZ789', flight: 'IB3167', from: 'LHR', to: 'MAD', date: '2026-11-05' }, photos: [] },
];

describe('summarize', () => {
  it('agrega totales, por hora y por vuelo', () => {
    const s = summarize(controls, incidents);
    expect(s).toMatchObject({ total: 3, correct: 2, ok: 1, incompleteConfirmed: 1, mismatch: 1, manualValidations: 1, manualEntries: 1, incidents: 1, bags: 3, medianDurationMs: 6000 });
    expect(s.perHour).toEqual([['07:00', 2], ['08:00', 1]]);
    expect(s.perFlight).toEqual([['IB3167', 2], ['Sin vuelo', 1]]);
    expect(s.incidentsByType).toEqual([['Maleta no coincide', 1]]);
  });
});

describe('CSV', () => {
  it('UTF-8 con BOM, separador ; y CRLF', () => {
    const csv = buildCsv(shift, controls, incidents);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0].split(';')[0]).toBe('registro');
    expect(lines).toHaveLength(1 + 3 + 1 + 1); // cabecera + 3 controles + 1 incidencia + línea final vacía
    expect(lines[1]).toContain('CONTROL;c1;05/11/2026;07:05:00');
    expect(lines[1]).toContain('"=""0075123456"""');
  });
  it('los datos personales solo aparecen en la fila de incidencia', () => {
    const lines = buildCsv(shift, controls, incidents).split('\r\n');
    const withName = lines.filter((l) => l.includes('PEREZ ANA'));
    expect(withName).toHaveLength(1);
    expect(withName[0].startsWith('INCIDENCIA')).toBe(true);
  });
  it('modo plano sin fórmulas', () => {
    const csv = buildCsv(shift, controls, incidents, 'plain');
    expect(csv).not.toContain('="');
    expect(csv).toContain(';0075123456;');
  });
  it('escapa y neutraliza fórmulas en texto libre', () => {
    expect(csvField('a;b')).toBe('"a;b"');
    expect(csvField('di "hola"')).toBe('"di ""hola"""');
    expect(csvField('=1+1', true)).toBe("'=1+1");
    expect(csvField('-x', false)).toBe('-x');
    expect(csvLpns(['1', '2'], 'plain')).toBe('1 | 2');
    expect(csvLpns([], 'excel')).toBe('');
  });
  it('nombre de fichero', () => {
    expect(reportBaseName(shift)).toBe('informe_MAD_SalidacintasT4S_20261105_0700');
  });
});

describe('retención', () => {
  it('borra controles > 72 h e incidencias > 30 días', () => {
    const now = at(7, 40) + 72 * 3600_000; // límite = 07:40 del día del turno
    const plan = planPurge(now, { controlsHours: 72, incidentsDays: 30 }, [{ ...shift, endedAt: at(9) }], controls, incidents);
    expect(plan.controls.sort()).toEqual(['c1', 'c2']);
    expect(plan.incidents).toEqual([]);
    expect(plan.shifts).toEqual([]);
    const later = at(8) + 31 * 24 * 3600_000;
    const plan2 = planPurge(later, { controlsHours: 72, incidentsDays: 30 }, [{ ...shift, endedAt: at(9) }], controls, incidents);
    expect(plan2.incidents).toEqual(['i1']);
    expect(plan2.shifts).toEqual(['s1']);
  });
  it('nunca borra el turno activo', () => {
    const plan = planPurge(at(8) + 365 * 24 * 3600_000, { controlsHours: 72, incidentsDays: 30 }, [{ ...shift, endedAt: at(9) }], [], [], 's1');
    expect(plan.shifts).toEqual([]);
  });
});

describe('sanitizeConfig', () => {
  it('rellena con valores por defecto y limita rangos', () => {
    const c = sanitizeConfig({ autoResetSec: 999, incidentTypes: ['A', '', 3], decoder: 'xx', airlines: [{ iata: 'ib', numeric: '075' }, { iata: 'bad', numeric: '1' }] });
    expect(c.autoResetSec).toBe(30);
    expect(c.incidentTypes).toEqual(['A']);
    expect(c.decoder).toBe(DEFAULT_CONFIG.decoder);
    expect(c.airlines).toEqual([{ iata: 'IB', numeric: '075', name: undefined }]);
    expect(sanitizeConfig(null)).toEqual(DEFAULT_CONFIG);
  });
});

import { describe, expect, it } from 'vitest';
import { buildPayload } from '../src/send/payload';
import { emailBody, emailSubject, fmtClaim, pdfFileName, statusLabel } from '../src/domain/format';
import { DEFAULT_CONFIG, isValidEndpoint, parseRecipients, sanitizeConfig } from '../src/domain/config';
import type { Ticket } from '../src/domain/types';

const at = (h: number, m: number) => new Date(2026, 10, 5, h, m).getTime();
const ticket: Ticket = {
  id: 'abc12345-0000',
  createdAt: at(10, 20),
  beltAt: at(10, 21),
  closedAt: at(10, 32),
  status: 'missing',
  guard: { guardId: 'TIP1', airport: 'MAD', terminal: 'T4S', post: 'Cinta 7' },
  claims: [
    { id: '0075123456', lpn: '0075123456', key: '075123456', airlineIata: 'IB', foundAt: at(10, 25) },
    { id: '0075123457', lpn: '0075123457', key: '075123457', airlineIata: 'IB' },
  ],
  negatives: 7,
  passenger: { name: 'PEREZ ANA', pnr: 'XYZ789', flight: 'IB3167', from: 'LHR', to: 'MAD', date: '2026-11-05' },
  includePassenger: true,
  notes: 'Derivada a Lost & Found',
  photos: [],
  send: { status: 'none', attempts: 0 },
};

describe('textos del correo', () => {
  it('estado y asunto', () => {
    expect(statusLabel(ticket)).toBe('FALTA 1 MALETA');
    expect(statusLabel({ ...ticket, claims: ticket.claims.map((c) => ({ ...c, foundAt: undefined })) })).toBe('FALTAN 2 MALETAS');
    expect(statusLabel({ ...ticket, status: 'ok' })).toBe('TODO OK');
    expect(emailSubject(ticket)).toBe('[Bagtags Aerovalue] FALTA 1 MALETA · IB3167 · MAD T4S · 05/11/2026 10:32');
  });
  it('cuerpo con recogidas, no aparecidas, descartadas y observaciones', () => {
    const b = emailBody(ticket);
    expect(b).toContain('Maletas recogidas (1/2)');
    expect(b).toContain('0 075 123456 (IB 123456) a las 10:25');
    expect(b).toContain('Maletas NO aparecidas (1)');
    expect(b).toContain('0 075 123457');
    expect(b).toContain('descartadas en cinta: 7');
    expect(b).toContain('Observaciones: Derivada a Lost & Found');
  });
  it('el cuerpo del correo no incluye nombre ni PNR (van solo en el PDF)', () => {
    const b = emailBody(ticket);
    expect(b).not.toContain('PEREZ');
    expect(b).not.toContain('XYZ789');
  });
  it('nombre del PDF', () => {
    expect(pdfFileName(ticket)).toBe('ticket_MAD_20261105_1032_FALTAN.pdf');
    expect(pdfFileName({ ...ticket, status: 'ok' })).toBe('ticket_MAD_20261105_1032_OK.pdf');
  });
  it('fmtClaim para clave de 9 dígitos', () => {
    expect(fmtClaim({ lpn: null, key: '075123456' })).toBe('· 075 123456');
  });
});

describe('payload para Power Automate', () => {
  it('destinatarios con ";", adjunto y resumen estructurado', () => {
    const p = buildPayload(ticket, ['a@x.es', 'b@x.es'], 'UERGLTEu');
    expect(p.to).toBe('a@x.es;b@x.es');
    expect(p.subject).toContain('FALTA 1 MALETA');
    expect(p.attachment).toEqual({ name: 'ticket_MAD_20261105_1032_FALTAN.pdf', contentType: 'application/pdf', contentBytes: 'UERGLTEu' });
    expect(p.ticket).toMatchObject({ status: 'missing', claims: 2, found: 1, missing: ['0 075 123457'], negatives: 7, flight: 'IB3167', guardId: 'TIP1' });
    expect(JSON.stringify(p.ticket)).not.toContain('PEREZ');
  });
});

describe('configuración', () => {
  it('parseRecipients separa válidos e inválidos y quita duplicados', () => {
    expect(parseRecipients('Sup@Empresa.es, otro@x.com;sup@empresa.es\nmal@ , x')).toEqual({ valid: ['sup@empresa.es', 'otro@x.com'], invalid: ['mal@', 'x'] });
  });
  it('solo acepta endpoints https', () => {
    expect(isValidEndpoint('')).toBe(true);
    expect(isValidEndpoint('https://prod.logic.azure.com/workflows/abc')).toBe(true);
    expect(isValidEndpoint('http://inseguro.com')).toBe(false);
    expect(isValidEndpoint('no es url')).toBe(false);
  });
  it('sanitizeConfig rellena valores por defecto y limpia lo no válido', () => {
    const c = sanitizeConfig({ recipients: ['a@x.es', 'mal'], endpoint: 'http://x', retentionDays: 9999, decoder: 'xx', airlines: [{ iata: 'ib', numeric: '075' }, { iata: 'bad', numeric: '1' }] });
    expect(c.recipients).toEqual(['a@x.es']);
    expect(c.endpoint).toBe('');
    expect(c.retentionDays).toBe(365);
    expect(c.decoder).toBe('auto');
    expect(c.airlines).toEqual([{ iata: 'IB', numeric: '075', name: undefined }]);
    expect(sanitizeConfig(null)).toEqual(DEFAULT_CONFIG);
  });
  it('una configuración antigua (v1) se migra sin errores', () => {
    const c = sanitizeConfig({ schema: 1, incidentTypes: ['A'], autoResetSec: 3, sound: false, pinHash: 'x' });
    expect(c.schema).toBe(2);
    expect(c.sound).toBe(false);
    expect('pinHash' in c).toBe(false);
  });
});

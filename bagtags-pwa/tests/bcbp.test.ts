import { describe, expect, it } from 'vitest';
import { buildBcbp, expandBagTagField, looksLikeBcbp, parseBcbp } from '../src/domain/bcbp';

// Ejemplo clásico del estándar IATA 792 (ficticio): un tramo, sin condicionales.
const IATA_EXAMPLE = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 226F001A0025 100';

describe('parseBcbp', () => {
  it('lee los campos obligatorios', () => {
    const r = parseBcbp(IATA_EXAMPLE, new Date('2026-08-10T10:00:00Z'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { data } = r;
    expect(data.name).toBe('DESMARAIS/LUC');
    expect(data.displayName).toBe('DESMARAIS LUC');
    expect(data.eTicket).toBe(true);
    expect(data.legs).toHaveLength(1);
    expect(data.legs[0]).toMatchObject({
      pnr: 'ABC123',
      from: 'YUL',
      to: 'FRA',
      carrier: 'AC',
      flightNumber: '834',
      flight: 'AC834',
      julianDate: 226,
      compartment: 'F',
      seat: '1A',
      sequence: '25',
    });
    // Día juliano 226 → 14 de agosto (año no bisiesto)
    expect(data.legs[0].date).toBe('2026-08-14');
  });

  it('elige el año más cercano para fechas julianas en cambio de año', () => {
    const bp = buildBcbp({ name: 'PEREZ/ANA', pnr: 'XYZ789', from: 'MAD', to: 'BCN', carrier: 'IB', flight: '1234', julian: 2 });
    const r = parseBcbp(bp, new Date('2026-12-31T20:00:00Z'));
    expect(r.ok && r.data.legs[0].date).toBe('2027-01-02');
  });

  it('extrae los LPN de equipaje de la parte condicional y expande los consecutivos', () => {
    const bp = buildBcbp({
      name: 'GARCIA LOPEZ/MARIA',
      pnr: 'Q1W2E3',
      from: 'LHR',
      to: 'MAD',
      carrier: 'IB',
      flight: '3167',
      julian: 309,
      bagTags: ['0075123456001'],
    });
    const r = parseBcbp(bp, new Date('2026-11-05T10:00:00Z'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.version).toBe('6');
    expect(r.data.bagTags).toEqual(['0075123456', '0075123457']);
    expect(r.data.legs[0].flight).toBe('IB3167');
    expect(r.data.legs[0].date).toBe('2026-11-05');
  });

  it('rechaza textos que no son BCBP', () => {
    expect(looksLikeBcbp('0075123456')).toBe(false);
    expect(parseBcbp('M1CORTO').ok).toBe(false);
    expect(parseBcbp('hola mundo').ok).toBe(false);
  });

  it('expandBagTagField ignora campos vacíos', () => {
    expect(expandBagTagField('0000000000000')).toEqual([]);
    expect(expandBagTagField('0075999999002')).toEqual(['0075999999']);
    expect(expandBagTagField('abc')).toEqual([]);
  });
});

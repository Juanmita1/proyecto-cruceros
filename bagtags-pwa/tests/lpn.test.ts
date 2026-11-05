import { describe, expect, it } from 'vitest';
import { buildAirlineIndex, DEFAULT_AIRLINES } from '../src/domain/airlines';
import { formatAlpha, formatTag, normalizeRaw, parseTag, tagId } from '../src/domain/lpn';
import { SAMPLE } from './samples';

const idx = buildAirlineIndex(DEFAULT_AIRLINES);

describe('parseTag — LPN de 10 dígitos', () => {
  it('descompone tipo, aerolínea y serie', () => {
    const r = parseTag(SAMPLE.ib1, idx, 'camera');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toMatchObject({ lpn: '0075123456', key: '075123456', typeDigit: '0', airline: '075', serial: '123456', airlineIata: 'IB', assumedType: false });
    expect(formatTag(r.code)).toBe('0 075 123456');
    expect(formatAlpha(r.code)).toBe('IB 123456');
  });

  it('rechaza lecturas parciales de cámara', () => {
    const r = parseTag(SAMPLE.partial8, idx, 'camera');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/parcial/i);
  });

  it('desde cámara no acepta 9 dígitos ni alfanumérico', () => {
    expect(parseTag('075123456', idx, 'camera').ok).toBe(false);
    expect(parseTag('IB123456', idx, 'camera').ok).toBe(false);
  });

  it('acepta aerolíneas desconocidas en 10 dígitos', () => {
    const r = parseTag('0123999999', idx, 'camera');
    expect(r.ok && r.code.airlineIata).toBe(undefined);
    expect(r.ok && r.code.airline).toBe('123');
  });

  it('elimina prefijos AIM de lectores Bluetooth y separadores', () => {
    expect(normalizeRaw(']I00075123456')).toBe('0075123456');
    expect(normalizeRaw(' 0 075-123456 ')).toBe('0075123456');
    const r = parseTag(']I00075123456', idx, 'keyboard');
    expect(r.ok && r.code.lpn).toBe('0075123456');
  });
});

describe('parseTag — entrada manual', () => {
  it('convierte "IB 123456" al LPN equivalente con tipo supuesto 0', () => {
    const r = parseTag('IB 123456', idx, 'manual');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code.lpn).toBe('0075123456');
    expect(r.code.assumedType).toBe(true);
    expect(r.code.key).toBe('075123456');
  });

  it('acepta minúsculas, guiones y designadores con dígito', () => {
    const r = parseTag('ux-654321', idx, 'manual');
    expect(r.ok && r.code.lpn).toBe('0996654321');
    const custom = buildAirlineIndex([{ iata: 'I2', numeric: '075' }]);
    const r2 = parseTag('I2 000123', custom, 'manual');
    expect(r2.ok && r2.code.lpn).toBe('0075000123');
  });

  it('informa de aerolínea desconocida', () => {
    const r = parseTag('ZZ 123456', idx, 'manual');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ZZ/);
  });

  it('9 dígitos = aerolínea + serie sin tipo (etiqueta dañada)', () => {
    const r = parseTag('075123456', idx, 'manual');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code.lpn).toBeNull();
    expect(r.code.typeDigit).toBeNull();
    expect(tagId(r.code)).toBe('075123456');
    expect(formatTag(r.code)).toBe('· 075 123456');
  });

  it('rechaza longitudes no válidas y texto', () => {
    expect(parseTag('12345', idx, 'manual').ok).toBe(false);
    expect(parseTag('00751234567', idx, 'manual').ok).toBe(false);
    expect(parseTag('hola', idx, 'manual').ok).toBe(false);
    expect(parseTag('', idx, 'manual').ok).toBe(false);
  });
});

describe('tabla de aerolíneas', () => {
  it('ignora filas no válidas y normaliza', () => {
    const t = buildAirlineIndex([
      { iata: 'ib', numeric: '75' },
      { iata: 'XXX', numeric: '001' },
      { iata: 'AB', numeric: 'abc' },
    ]);
    expect(t.byIata.get('IB')?.numeric).toBe('075');
    expect(t.byIata.size).toBe(1);
  });
});

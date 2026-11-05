/**
 * License Plate Number (LPN) IATA — Resolución 740.
 *
 *   Dígito 1      tipo de etiqueta (0 interline, 1 fallback, 2 rush/expedite…)
 *   Dígitos 2-4   código numérico de la aerolínea emisora (075 = Iberia)
 *   Dígitos 5-10  número de serie del bulto
 *
 * El LPN no tiene dígito de control, por lo que la única defensa contra
 * lecturas parciales del ITF es exigir longitud exacta y doble lectura
 * (ver confirm.ts).
 */
import { type AirlineIndex } from './airlines';

export type CodeSource = 'camera' | 'manual' | 'keyboard' | 'bcbp' | 'demo';

export interface TagCode {
  /** LPN completo de 10 dígitos, o null si solo se conoce aerolínea + serie. */
  lpn: string | null;
  /** Clave de coincidencia flexible: aerolínea (3) + serie (6) = 9 dígitos. */
  key: string;
  airline: string;
  serial: string;
  /** Dígito de tipo, null si desconocido. */
  typeDigit: string | null;
  /** true si el dígito de tipo se ha supuesto (conversión "IB 123456" → 0075123456). */
  assumedType: boolean;
  /** Designador IATA de 2 letras si se conoce. */
  airlineIata?: string;
  source: CodeSource;
  raw: string;
}

export type ParseResult = { ok: true; code: TagCode } | { ok: false; error: string };

export const TAG_TYPES: Record<string, string> = {
  '0': 'Interline',
  '1': 'Fallback',
  '2': 'Rush / expedite',
};

export function describeTagType(d: string | null): string {
  if (d == null) return 'Tipo desconocido';
  return TAG_TYPES[d] ?? `Tipo ${d}`;
}

/** Limpia prefijos de simbología AIM (p. ej. "]I0" que envían algunos lectores BT) y separadores. */
export function normalizeRaw(raw: string): string {
  return raw
    .trim()
    .replace(/^\][A-Za-z][0-9A-Za-z]/, '')
    .replace(/[\s\-_.\/]/g, '')
    .toUpperCase();
}

/**
 * Parsea una lectura o entrada manual a TagCode.
 *
 * - Cámara: solo se aceptan 10 dígitos exactos (una lectura de 6 u 8 dígitos
 *   es una lectura parcial típica del ITF y se descarta).
 * - Manual / teclado BT: además se aceptan 9 dígitos (aerolínea + serie, para
 *   etiquetas dañadas) y el formato alfanumérico "IB 123456".
 */
export function parseTag(raw: string, airlines: AirlineIndex, source: CodeSource = 'manual'): ParseResult {
  const s = normalizeRaw(raw);
  if (!s) return { ok: false, error: 'Código vacío' };
  const lenient = source === 'manual' || source === 'keyboard' || source === 'demo';

  if (/^\d{10}$/.test(s)) {
    const airline = s.slice(1, 4);
    return {
      ok: true,
      code: {
        lpn: s,
        key: s.slice(1),
        airline,
        serial: s.slice(4),
        typeDigit: s[0],
        assumedType: false,
        airlineIata: airlines.byNumeric.get(airline)?.iata,
        source,
        raw,
      },
    };
  }

  if (!lenient) {
    if (/^\d+$/.test(s)) return { ok: false, error: `Lectura parcial (${s.length} dígitos, se esperan 10)` };
    return { ok: false, error: 'No es un LPN de equipaje' };
  }

  if (/^\d{9}$/.test(s)) {
    const airline = s.slice(0, 3);
    return {
      ok: true,
      code: {
        lpn: null,
        key: s,
        airline,
        serial: s.slice(3),
        typeDigit: null,
        assumedType: false,
        airlineIata: airlines.byNumeric.get(airline)?.iata,
        source,
        raw,
      },
    };
  }

  // Formato alfanumérico impreso: "IB 123456", "I2123456", "UX-654321".
  const m = /^([A-Z][A-Z0-9]|[0-9][A-Z])(\d{6})$/.exec(s);
  if (m) {
    const [, iata, serial] = m;
    const a = airlines.byIata.get(iata);
    if (!a) return { ok: false, error: `Aerolínea "${iata}" no está en la tabla. Añádala en Configuración o teclee los 10 dígitos.` };
    return {
      ok: true,
      code: {
        lpn: '0' + a.numeric + serial,
        key: a.numeric + serial,
        airline: a.numeric,
        serial,
        typeDigit: '0',
        assumedType: true,
        airlineIata: a.iata,
        source,
        raw,
      },
    };
  }

  if (/^\d+$/.test(s)) {
    return { ok: false, error: `Longitud no válida (${s.length} dígitos). Use 10 dígitos, o 9 (aerolínea + serie).` };
  }
  return { ok: false, error: 'Formato no reconocido. Ejemplos: 0075123456 · IB 123456' };
}

/** "0075123456" → "0 075 123456"; código parcial → "· 075 123456". */
export function formatTag(code: Pick<TagCode, 'typeDigit' | 'airline' | 'serial'>): string {
  return `${code.typeDigit ?? '·'} ${code.airline} ${code.serial}`;
}

/** Texto corto alfanumérico: "IB 123456" si se conoce la aerolínea. */
export function formatAlpha(code: Pick<TagCode, 'airlineIata' | 'airline' | 'serial'>): string {
  return `${code.airlineIata ?? code.airline} ${code.serial}`;
}

/** Identificador estable para persistir: LPN completo o la clave de 9 dígitos. */
export function tagId(code: Pick<TagCode, 'lpn' | 'key'>): string {
  return code.lpn ?? code.key;
}

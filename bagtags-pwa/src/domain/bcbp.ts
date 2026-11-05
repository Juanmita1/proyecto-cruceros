/**
 * Parser de la tarjeta de embarque con código de barras — BCBP (IATA Res. 792).
 *
 * Estructura (formato "M"):
 *   0      'M'  formato
 *   1      nº de tramos codificados (1-4)
 *   2-21   nombre del pasajero (20)          APELLIDO/NOMBRE
 *   22     indicador de billete electrónico (1)
 *   Por cada tramo, 37 caracteres obligatorios:
 *     PNR (7) · origen (3) · destino (3) · transportista operador (3)
 *     nº de vuelo (5) · fecha juliana (3) · clase (1) · asiento (4)
 *     nº de secuencia de check-in (5) · estado del pasajero (1)
 *     tamaño del campo variable (2, hexadecimal)
 *   En el primer tramo el campo variable empieza con la parte condicional única:
 *     '>' · versión (1) · tamaño (2 hex) · descripción pasajero (1)
 *     · origen check-in (1) · origen emisión (1) · fecha emisión (4)
 *     · tipo documento (1) · aerolínea emisora (3)
 *     · LPN de equipaje (13) ×3   → 10 dígitos de LPN + 3 de nº de bultos consecutivos
 *   Seguido de la parte condicional repetida y uso privado de la aerolínea.
 *
 * El parser es tolerante: los campos condicionales se leen solo si existen.
 *
 * PRIVACIDAD: el resultado contiene datos personales (nombre, PNR). Solo se
 * persiste dentro de una incidencia; en los controles correctos se usa solo
 * el vuelo.
 */

export interface BcbpLeg {
  pnr: string;
  from: string;
  to: string;
  carrier: string;
  /** Número de vuelo sin ceros a la izquierda, p. ej. "3456". */
  flightNumber: string;
  /** "IB3456". */
  flight: string;
  julianDate: number | null;
  /** Fecha ISO (AAAA-MM-DD) estimada con el año más cercano a la referencia. */
  date: string | null;
  compartment: string;
  seat: string;
  sequence: string;
  status: string;
}

export interface BcbpData {
  name: string;
  /** "APELLIDO NOMBRE" legible. */
  displayName: string;
  eTicket: boolean;
  legs: BcbpLeg[];
  version: string | null;
  /** LPN de equipaje incluidos en la tarjeta (expandidos según nº de bultos consecutivos). */
  bagTags: string[];
  raw: string;
}

export type BcbpResult = { ok: true; data: BcbpData } | { ok: false; error: string };

export function looksLikeBcbp(raw: string): boolean {
  return /^M[1-4]/.test(raw) && raw.length >= 58;
}

function julianToIso(day: number, ref: Date): string | null {
  if (!(day >= 1 && day <= 366)) return null;
  // El BCBP no lleva año: se elige el año (actual, anterior o siguiente) que deja la fecha más cerca de la referencia.
  const y = ref.getUTCFullYear();
  let best: Date | null = null;
  for (const year of [y - 1, y, y + 1]) {
    const d = new Date(Date.UTC(year, 0, 1));
    d.setUTCDate(day);
    if (d.getUTCFullYear() !== year) continue; // día 366 en año no bisiesto
    if (!best || Math.abs(d.getTime() - ref.getTime()) < Math.abs(best.getTime() - ref.getTime())) best = d;
  }
  return best ? best.toISOString().slice(0, 10) : null;
}

/** Expande el campo de 13 caracteres "0075123456002" en ["0075123456","0075123457","0075123458"]. */
export function expandBagTagField(field: string): string[] {
  if (!/^\d{13}$/.test(field)) return [];
  const base = field.slice(0, 10);
  const extra = parseInt(field.slice(10), 10);
  if (/^0+$/.test(base)) return [];
  const prefix = base.slice(0, 4);
  const serial = parseInt(base.slice(4), 10);
  const out: string[] = [];
  for (let i = 0; i <= Math.min(extra, 20); i++) {
    const s = serial + i;
    if (s > 999999) break;
    out.push(prefix + String(s).padStart(6, '0'));
  }
  return out;
}

export function parseBcbp(input: string, ref: Date = new Date()): BcbpResult {
  const raw = input.replace(/\r?\n$/, '');
  if (!looksLikeBcbp(raw)) return { ok: false, error: 'No es una tarjeta de embarque BCBP (formato M)' };
  const legsCount = parseInt(raw[1], 10);
  const name = raw.slice(2, 22).trim();
  const eTicket = raw[22] === 'E';
  const legs: BcbpLeg[] = [];
  const bagTags: string[] = [];
  let version: string | null = null;
  let pos = 23;

  for (let i = 0; i < legsCount; i++) {
    if (raw.length < pos + 37) {
      if (i === 0) return { ok: false, error: 'Tarjeta de embarque incompleta' };
      break;
    }
    const f = (len: number) => {
      const v = raw.slice(pos, pos + len);
      pos += len;
      return v;
    };
    const pnr = f(7).trim();
    const from = f(3).trim();
    const to = f(3).trim();
    const carrier = f(3).trim();
    const flightRaw = f(5).trim();
    const julianRaw = f(3).trim();
    const compartment = f(1).trim();
    const seat = f(4).trim();
    const sequence = f(5).trim();
    const status = f(1).trim();
    const varSize = parseInt(f(2), 16);
    const variable = Number.isFinite(varSize) ? raw.slice(pos, pos + varSize) : '';
    pos += Number.isFinite(varSize) ? varSize : 0;

    const flightNumber = flightRaw.replace(/^0+(?=\d)/, '');
    const julian = /^\d{1,3}$/.test(julianRaw) ? parseInt(julianRaw, 10) : null;
    legs.push({
      pnr,
      from,
      to,
      carrier,
      flightNumber,
      flight: `${carrier}${flightNumber}`,
      julianDate: julian,
      date: julian ? julianToIso(julian, ref) : null,
      compartment,
      seat: seat.replace(/^0+(?=\d)/, ''),
      sequence: sequence.replace(/^0+(?=\d)/, ''),
      status,
    });

    // Parte condicional única (solo primer tramo).
    if (i === 0 && variable.startsWith('>') && variable.length >= 4) {
      version = variable[1];
      const uSize = parseInt(variable.slice(2, 4), 16);
      if (Number.isFinite(uSize)) {
        const unique = variable.slice(4, 4 + uSize);
        // descripción(1) + origen check-in(1) + origen emisión(1) + fecha(4) + tipo doc(1) + aerolínea(3) = 11
        const tagsPart = unique.slice(11);
        for (let k = 0; k + 13 <= tagsPart.length && k < 39; k += 13) {
          for (const t of expandBagTagField(tagsPart.slice(k, k + 13))) {
            if (!bagTags.includes(t)) bagTags.push(t);
          }
        }
      }
    }
  }

  const [last, first] = name.split('/');
  return {
    ok: true,
    data: {
      name,
      displayName: first ? `${last} ${first}`.trim() : name,
      eTicket,
      legs,
      version,
      bagTags,
      raw,
    },
  };
}

/** Generador de BCBP de ejemplo (para la página de demostración y los tests). */
export function buildBcbp(opts: {
  name: string;
  pnr: string;
  from: string;
  to: string;
  carrier: string;
  flight: string;
  julian: number;
  seat?: string;
  seq?: number;
  bagTags?: string[]; // campos de 13 dígitos
}): string {
  const pad = (s: string, n: number) => s.slice(0, n).padEnd(n, ' ');
  const zero = (s: string | number, n: number) => String(s).padStart(n, '0');
  let variable = '';
  if (opts.bagTags?.length) {
    const unique = 'W' + 'W' + 'W' + '0000' + 'B' + pad(opts.carrier, 3) + opts.bagTags.map((t) => t.padEnd(13, '0')).join('');
    variable = '>' + '6' + zero(unique.length.toString(16).toUpperCase(), 2) + unique;
  }
  return (
    'M1' +
    pad(opts.name, 20) +
    'E' +
    pad(opts.pnr, 7) +
    pad(opts.from, 3) +
    pad(opts.to, 3) +
    pad(opts.carrier, 3) +
    zero(opts.flight, 4).padEnd(5, ' ') +
    zero(opts.julian, 3) +
    'Y' +
    (opts.seat ?? '012A').padStart(4, '0') +
    zero(opts.seq ?? 1, 4).padEnd(5, ' ') +
    '1' +
    zero(variable.length.toString(16).toUpperCase(), 2) +
    variable
  );
}

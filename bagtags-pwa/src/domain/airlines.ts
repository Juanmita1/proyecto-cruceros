/**
 * Tabla por defecto de aerolíneas: designador IATA de 2 caracteres ↔ código
 * numérico de 3 dígitos (el "prefijo" que aparece en los dígitos 2-4 del LPN).
 *
 * IMPORTANTE: son valores de ejemplo de uso habitual. Cada aerolínea o handling
 * puede emitir etiquetas con un código distinto (p. ej. filiales que usan el
 * prefijo de la matriz). La tabla es editable desde Configuración y se puede
 * distribuir a todos los dispositivos con el JSON de configuración.
 */
export interface Airline {
  /** Designador IATA de 2 caracteres (letras o letra+dígito), p. ej. "IB", "I2". */
  iata: string;
  /** Código numérico de 3 dígitos, p. ej. "075". */
  numeric: string;
  /** Nombre descriptivo (opcional). */
  name?: string;
}

export const DEFAULT_AIRLINES: Airline[] = [
  { iata: 'IB', numeric: '075', name: 'Iberia' },
  { iata: 'UX', numeric: '996', name: 'Air Europa' },
  { iata: 'VY', numeric: '030', name: 'Vueling' },
  { iata: 'YW', numeric: '694', name: 'Air Nostrum' },
  { iata: 'FR', numeric: '224', name: 'Ryanair' },
  { iata: 'BA', numeric: '125', name: 'British Airways' },
  { iata: 'AF', numeric: '057', name: 'Air France' },
  { iata: 'KL', numeric: '074', name: 'KLM' },
  { iata: 'LH', numeric: '220', name: 'Lufthansa' },
  { iata: 'LX', numeric: '724', name: 'Swiss' },
  { iata: 'OS', numeric: '257', name: 'Austrian' },
  { iata: 'SN', numeric: '082', name: 'Brussels Airlines' },
  { iata: 'TP', numeric: '047', name: 'TAP Air Portugal' },
  { iata: 'AZ', numeric: '055', name: 'ITA Airways' },
  { iata: 'EI', numeric: '053', name: 'Aer Lingus' },
  { iata: 'AY', numeric: '105', name: 'Finnair' },
  { iata: 'SK', numeric: '117', name: 'SAS' },
  { iata: 'LO', numeric: '080', name: 'LOT' },
  { iata: 'TK', numeric: '235', name: 'Turkish Airlines' },
  { iata: 'AT', numeric: '147', name: 'Royal Air Maroc' },
  { iata: 'MS', numeric: '077', name: 'EgyptAir' },
  { iata: 'LY', numeric: '114', name: 'El Al' },
  { iata: 'EK', numeric: '176', name: 'Emirates' },
  { iata: 'QR', numeric: '157', name: 'Qatar Airways' },
  { iata: 'EY', numeric: '607', name: 'Etihad' },
  { iata: 'SV', numeric: '065', name: 'Saudia' },
  { iata: 'AA', numeric: '001', name: 'American Airlines' },
  { iata: 'DL', numeric: '006', name: 'Delta' },
  { iata: 'UA', numeric: '016', name: 'United' },
  { iata: 'AC', numeric: '014', name: 'Air Canada' },
  { iata: 'AM', numeric: '139', name: 'Aeroméxico' },
  { iata: 'AV', numeric: '134', name: 'Avianca' },
  { iata: 'CM', numeric: '230', name: 'Copa' },
  { iata: 'LA', numeric: '045', name: 'LATAM' },
  { iata: 'AR', numeric: '044', name: 'Aerolíneas Argentinas' },
  { iata: 'CA', numeric: '999', name: 'Air China' },
  { iata: 'JL', numeric: '131', name: 'Japan Airlines' },
  { iata: 'NH', numeric: '205', name: 'ANA' },
  { iata: 'SQ', numeric: '618', name: 'Singapore Airlines' },
  { iata: 'CX', numeric: '160', name: 'Cathay Pacific' },
  { iata: 'KE', numeric: '180', name: 'Korean Air' },
  { iata: 'QF', numeric: '081', name: 'Qantas' },
];

/** Índices de búsqueda rápida construidos a partir de una tabla editable. */
export interface AirlineIndex {
  byIata: Map<string, Airline>;
  byNumeric: Map<string, Airline>;
}

export function buildAirlineIndex(table: Airline[]): AirlineIndex {
  const byIata = new Map<string, Airline>();
  const byNumeric = new Map<string, Airline>();
  for (const a of table) {
    const iata = a.iata.trim().toUpperCase();
    const numeric = a.numeric.trim().padStart(3, '0');
    if (!/^[A-Z0-9]{2}$/.test(iata) || !/^\d{3}$/.test(numeric)) continue;
    const norm = { ...a, iata, numeric };
    if (!byIata.has(iata)) byIata.set(iata, norm);
    if (!byNumeric.has(numeric)) byNumeric.set(numeric, norm);
  }
  return { byIata, byNumeric };
}

/** Valida una fila de la tabla (para el editor de Configuración). */
export function validateAirline(a: Airline): string | null {
  if (!/^[A-Z0-9]{2}$/i.test(a.iata.trim())) return 'El designador IATA debe tener 2 caracteres';
  if (!/^\d{3}$/.test(a.numeric.trim())) return 'El código numérico debe tener 3 dígitos';
  return null;
}

/** Configuración de la aplicación (exportable en JSON para desplegar en todos los dispositivos). */
import { DEFAULT_AIRLINES, type Airline, validateAirline } from './airlines';

export type DecoderPref = 'auto' | 'native' | 'zxing';

export interface AppConfig {
  schema: 2;
  /** Direcciones a las que se envía el PDF de cada ticket. */
  recipients: string[];
  /** URL del flujo HTTP de Power Automate que envía el correo (vacío = solo compartir desde el móvil). */
  endpoint: string;
  airlines: Airline[];
  sound: boolean;
  vibration: boolean;
  /** Exigir dos lecturas idénticas en códigos lineales (ITF, Code 128). */
  doubleRead: boolean;
  decoder: DecoderPref;
  theme: 'dark' | 'light';
  /** Días que se conservan en el dispositivo los tickets ya enviados. */
  retentionDays: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  schema: 2,
  recipients: [],
  endpoint: '',
  airlines: DEFAULT_AIRLINES,
  sound: true,
  vibration: true,
  doubleRead: true,
  decoder: 'auto',
  theme: 'dark',
  retentionDays: 30,
};

export function isEmail(s: string): boolean {
  return /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(s.trim());
}

/** Acepta una lista separada por comas, punto y coma, espacios o saltos de línea. */
export function parseRecipients(text: string): { valid: string[]; invalid: string[] } {
  const items = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = [...new Set(items.filter(isEmail).map((s) => s.toLowerCase()))];
  return { valid, invalid: items.filter((s) => !isEmail(s)) };
}

export function isValidEndpoint(url: string): boolean {
  if (!url) return true;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/**
 * Normaliza un objeto (p. ej. un JSON importado o una configuración antigua)
 * a una configuración válida. Los campos ausentes o no válidos toman el valor de `base`.
 */
export function sanitizeConfig(input: unknown, base: AppConfig = DEFAULT_CONFIG): AppConfig {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const airlines = Array.isArray(o.airlines)
    ? (o.airlines as Airline[])
        .filter((a) => a && typeof a.iata === 'string' && typeof a.numeric === 'string' && !validateAirline(a))
        .map((a) => ({ iata: a.iata.trim().toUpperCase(), numeric: a.numeric.trim(), name: typeof a.name === 'string' ? a.name : undefined }))
    : base.airlines;
  const recipients = Array.isArray(o.recipients) ? parseRecipients(o.recipients.filter((x) => typeof x === 'string').join(' ')).valid : base.recipients;
  const endpoint = typeof o.endpoint === 'string' && isValidEndpoint(o.endpoint.trim()) ? o.endpoint.trim() : base.endpoint;
  return {
    schema: 2,
    recipients,
    endpoint,
    airlines,
    sound: bool(o.sound, base.sound),
    vibration: bool(o.vibration, base.vibration),
    doubleRead: bool(o.doubleRead, base.doubleRead),
    decoder: o.decoder === 'native' || o.decoder === 'zxing' || o.decoder === 'auto' ? o.decoder : base.decoder,
    theme: o.theme === 'light' || o.theme === 'dark' ? o.theme : base.theme,
    retentionDays: num(o.retentionDays, base.retentionDays, 1, 365),
  };
}

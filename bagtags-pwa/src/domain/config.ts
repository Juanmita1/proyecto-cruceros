/** Configuración de la aplicación (exportable en JSON para desplegar en todos los dispositivos). */
import { DEFAULT_AIRLINES, type Airline, validateAirline } from './airlines';

export type DecoderPref = 'auto' | 'native' | 'zxing';

export interface AppConfig {
  schema: 1;
  incidentTypes: string[];
  actions: string[];
  posts: string[];
  airlines: Airline[];
  /** Segundos hasta el reinicio automático tras un CORRECTO (0 = desactivado). */
  autoResetSec: number;
  sound: boolean;
  vibration: boolean;
  /** Abrir la ficha de incidencia automáticamente tras un NO COINCIDE. */
  autoOpenIncident: boolean;
  /** Cerrar el pasajero en cuanto todos los resguardos tienen maleta. */
  autoFinish: boolean;
  /** En el paso 1, volver a leer un resguardo ya leído pasa directamente a maletas (la maleta lleva el mismo código). */
  autoAdvanceOnRepeat: boolean;
  /** Exigir dos lecturas idénticas en códigos lineales (ITF, Code 128). */
  doubleRead: boolean;
  decoder: DecoderPref;
  theme: 'dark' | 'light';
  /** Formato de los LPN en el CSV: "excel" conserva los ceros iniciales al abrir con doble clic; "plain" para Power Automate. */
  csvLpnFormat: 'excel' | 'plain';
  retentionControlsHours: number;
  retentionIncidentsDays: number;
  /** PIN de supervisor (hash SHA-256 con sal). */
  pinSalt: string;
  pinHash: string;
  /** Preparado para la sincronización futura con SharePoint / Power Automate (no implementada). */
  sync: { enabled: boolean; endpoint: string };
}

export const DEFAULT_PIN = '1234';

export const DEFAULT_CONFIG: AppConfig = {
  schema: 1,
  incidentTypes: [
    'Maleta no coincide',
    'Pasajero sin resguardo',
    'Etiqueta ilegible o dañada',
    'Maleta sin etiqueta',
    'Otro',
  ],
  actions: [
    'Retenida',
    'Derivada a la aerolínea / handling',
    'Derivada a Lost & Found',
    'Aviso a Guardia Civil / Policía',
    'Resuelta en el puesto',
  ],
  posts: ['Salida cintas T4', 'Salida cintas T4S', 'Salida cintas T1', 'Salida cintas T2'],
  airlines: DEFAULT_AIRLINES,
  autoResetSec: 3,
  sound: true,
  vibration: true,
  autoOpenIncident: true,
  autoFinish: true,
  autoAdvanceOnRepeat: false,
  doubleRead: true,
  decoder: 'auto',
  theme: 'dark',
  csvLpnFormat: 'excel',
  retentionControlsHours: 72,
  retentionIncidentsDays: 30,
  pinSalt: '',
  pinHash: '',
  sync: { enabled: false, endpoint: '' },
};

const strList = (v: unknown, fallback: string[]) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : fallback;

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/**
 * Normaliza un objeto (p. ej. un JSON importado) a una configuración válida.
 * Los campos ausentes o no válidos toman el valor actual (`base`).
 */
export function sanitizeConfig(input: unknown, base: AppConfig = DEFAULT_CONFIG): AppConfig {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const airlines = Array.isArray(o.airlines)
    ? (o.airlines as Airline[])
        .filter((a) => a && typeof a.iata === 'string' && typeof a.numeric === 'string' && !validateAirline(a))
        .map((a) => ({ iata: a.iata.trim().toUpperCase(), numeric: a.numeric.trim(), name: typeof a.name === 'string' ? a.name : undefined }))
    : base.airlines;
  const sync = (o.sync && typeof o.sync === 'object' ? o.sync : {}) as Record<string, unknown>;
  return {
    schema: 1,
    incidentTypes: strList(o.incidentTypes, base.incidentTypes),
    actions: strList(o.actions, base.actions),
    posts: strList(o.posts, base.posts),
    airlines,
    autoResetSec: num(o.autoResetSec, base.autoResetSec, 0, 30),
    sound: bool(o.sound, base.sound),
    vibration: bool(o.vibration, base.vibration),
    autoOpenIncident: bool(o.autoOpenIncident, base.autoOpenIncident),
    autoFinish: bool(o.autoFinish, base.autoFinish),
    autoAdvanceOnRepeat: bool(o.autoAdvanceOnRepeat, base.autoAdvanceOnRepeat),
    doubleRead: bool(o.doubleRead, base.doubleRead),
    decoder: o.decoder === 'native' || o.decoder === 'zxing' || o.decoder === 'auto' ? o.decoder : base.decoder,
    theme: o.theme === 'light' || o.theme === 'dark' ? o.theme : base.theme,
    csvLpnFormat: o.csvLpnFormat === 'plain' || o.csvLpnFormat === 'excel' ? o.csvLpnFormat : base.csvLpnFormat,
    retentionControlsHours: num(o.retentionControlsHours, base.retentionControlsHours, 1, 24 * 30),
    retentionIncidentsDays: num(o.retentionIncidentsDays, base.retentionIncidentsDays, 1, 365),
    pinSalt: typeof o.pinSalt === 'string' ? o.pinSalt : base.pinSalt,
    pinHash: typeof o.pinHash === 'string' ? o.pinHash : base.pinHash,
    sync: {
      enabled: bool(sync.enabled, base.sync.enabled),
      endpoint: typeof sync.endpoint === 'string' ? sync.endpoint : base.sync.endpoint,
    },
  };
}

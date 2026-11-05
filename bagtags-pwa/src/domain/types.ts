/** Modelos persistidos en IndexedDB. */
import type { BagStatus, ControlResult } from './matcher';

export interface Shift {
  id: string;
  /** TIP o código interno del vigilante. */
  guardId: string;
  /** Código IATA del aeropuerto, p. ej. "MAD". */
  airport: string;
  terminal: string;
  /** Puesto, p. ej. "Salida cintas T4S". */
  post: string;
  /** Vuelos controlados (opcional), p. ej. ["IB3456"]. */
  flights: string[];
  startedAt: number;
  endedAt?: number;
}

/**
 * Control de un pasajero. MINIMIZACIÓN DE DATOS: solo LPN, hora, resultado y
 * vuelo. Nunca nombre, PNR ni asiento.
 */
export interface ControlRecord {
  id: string;
  shiftId: string;
  ts: number;
  result: ControlResult;
  /** LPN (10 dígitos) o clave parcial (9 dígitos) de los resguardos. */
  claims: string[];
  bags: { id: string; status: BagStatus }[];
  /** Coincidencia parcial confirmada o INCOMPLETO confirmado por el vigilante. */
  manualValidation: boolean;
  /** Algún código se introdujo a mano o con lector externo. */
  manualEntry: boolean;
  flight?: string;
  incidentId?: string;
  /** Duración del control (primer escaneo → resultado), para medir el objetivo de 10 s. */
  durationMs?: number;
}

export interface PassengerData {
  name: string;
  pnr: string;
  flight: string;
  from: string;
  to: string;
  date: string | null;
  seat?: string;
}

export interface IncidentPhoto {
  id: string;
  blob: Blob;
  width: number;
  height: number;
}

/** Incidencia. Es el ÚNICO registro que puede contener datos personales del pasajero. */
export interface Incident {
  id: string;
  shiftId: string;
  controlId?: string;
  ts: number;
  type: string;
  action: string;
  notes: string;
  claims: string[];
  bags: string[];
  flight?: string;
  passenger?: PassengerData;
  photos: IncidentPhoto[];
}

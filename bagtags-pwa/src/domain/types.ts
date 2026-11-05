/** Modelos persistidos en IndexedDB. */

/** Datos del vigilante y del puesto (se piden una vez por turno). */
export interface GuardInfo {
  /** TIP o código interno. */
  guardId: string;
  /** Código IATA del aeropuerto, p. ej. "MAD". */
  airport: string;
  terminal: string;
  /** Puesto, p. ej. "Cinta 7 T4S". */
  post: string;
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

export interface TicketPhoto {
  id: string;
  blob: Blob;
  width: number;
  height: number;
}

/** Un resguardo del pasajero y si su maleta ya ha salido por la cinta. */
export interface TicketClaim {
  /** LPN de 10 dígitos, o clave de 9 dígitos (aerolínea + serie) si se tecleó sin tipo. */
  id: string;
  lpn: string | null;
  key: string;
  airlineIata?: string;
  /** Hora en que la maleta salió y se escaneó en la cinta. */
  foundAt?: number;
  /** Encontrada por coincidencia parcial confirmada a mano. */
  manual?: boolean;
}

export type TicketStatus = 'open' | 'ok' | 'missing';

export type SendStatus = 'none' | 'pending' | 'sent' | 'shared' | 'failed';

export interface Ticket {
  id: string;
  createdAt: number;
  /** Momento en que se pasó a vigilar la cinta. */
  beltAt?: number;
  closedAt?: number;
  status: TicketStatus;
  guard: GuardInfo;
  claims: TicketClaim[];
  /** Maletas escaneadas en la cinta que NO eran del pasajero. */
  negatives: number;
  /** Datos del BCBP (solo si se leyó la tarjeta de embarque). */
  passenger?: PassengerData;
  /** Incluir los datos del pasajero en el PDF enviado. */
  includePassenger: boolean;
  flight?: string;
  notes: string;
  photos: TicketPhoto[];
  send: { status: SendStatus; at?: number; attempts: number; error?: string };
}

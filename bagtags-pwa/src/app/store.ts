/** Estado global mínimo con suscripción (sin librerías) + hook para Preact. */
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_CONFIG, type AppConfig } from '../domain/config';
import { buildAirlineIndex, type AirlineIndex } from '../domain/airlines';
import type { Ticket } from '../domain/types';
import type { DevicePrefs } from '../storage/db';

export type Route =
  | { name: 'loading' }
  | { name: 'guard' }
  | { name: 'ticket' }
  | { name: 'close' }
  | { name: 'history' }
  | { name: 'view'; ticketId: string }
  | { name: 'settings' }
  | { name: 'demo' }
  | { name: 'help' };

/** Aviso grande de la última maleta escaneada en la cinta. */
export type BeltFlash =
  | { kind: 'match'; claimIndex: number; seq: number }
  | { kind: 'repeat'; claimIndex: number; seq: number }
  | { kind: 'nomatch'; code: string; seq: number }
  | { kind: 'allfound'; seq: number };

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn' | 'error' | 'ok';
}

export interface AppState {
  route: Route;
  config: AppConfig;
  airlines: AirlineIndex;
  prefs: DevicePrefs;
  /** Ticket en curso (abierto o recién cerrado y aún no enviado). */
  ticket: Ticket | null;
  /** Paso del ticket abierto. */
  step: 'claims' | 'belt';
  flash: BeltFlash | null;
  /** Coincidencia parcial pendiente de confirmar: índice del resguardo y código leído. */
  partial: { claimIndex: number; code: string } | null;
  toast: Toast | null;
  online: boolean;
  /** Tickets pendientes de envío. */
  pendingCount: number;
  updateAvailable: boolean;
  demoSim: boolean;
}

let state: AppState = {
  route: { name: 'loading' },
  config: DEFAULT_CONFIG,
  airlines: buildAirlineIndex(DEFAULT_CONFIG.airlines),
  prefs: { guard: null, guardDate: '' },
  ticket: null,
  step: 'claims',
  flash: null,
  partial: null,
  toast: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingCount: 0,
  updateAvailable: false,
  demoSim: false,
};

const listeners = new Set<() => void>();

export function getState() {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  if (p.config) state.airlines = buildAirlineIndex(state.config.airlines);
  for (const l of listeners) l();
}

export function navigate(route: Route) {
  setState({ route });
  window.scrollTo(0, 0);
}

let toastSeq = 0;
let toastTimer: number | undefined;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 2500) {
  const id = ++toastSeq;
  setState({ toast: { id, text, kind } });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (state.toast?.id === id) setState({ toast: null });
  }, ms);
}

/**
 * Suscribe el componente al estado global.
 * La suscripción se hace en un efecto (después de pintar): si el estado cambió
 * entre el render y la suscripción (p. ej. init() terminó muy rápido), se
 * fuerza un nuevo render para no perder ese cambio.
 */
export function useApp(): AppState {
  const [, force] = useState(0);
  const rendered = state;
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (state !== rendered) l();
    return () => void listeners.delete(l);
  }, []);
  return state;
}

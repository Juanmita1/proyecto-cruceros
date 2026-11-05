/**
 * Estado global mínimo con suscripción (sin librerías) + hook para Preact.
 */
import { useEffect, useState } from 'preact/hooks';
import type { AppConfig } from '../domain/config';
import { DEFAULT_CONFIG } from '../domain/config';
import { buildAirlineIndex, type AirlineIndex } from '../domain/airlines';
import type { BcbpData } from '../domain/bcbp';
import type { TagCode } from '../domain/lpn';
import type { BagEval, ControlResult } from '../domain/matcher';
import { SeenRegistry } from '../domain/matcher';
import type { Shift } from '../domain/types';
import type { DevicePrefs } from '../storage/db';

export type Route =
  | { name: 'loading' }
  | { name: 'start' }
  | { name: 'control' }
  | { name: 'incident'; controlId?: string; incidentId?: string; presetType?: string }
  | { name: 'report' }
  | { name: 'settings' }
  | { name: 'demo' }
  | { name: 'help' };

export interface PassOutcome {
  result: ControlResult;
  controlId: string;
  at: number;
}

/** Estado del pasajero en curso. Vive solo en memoria (los datos BCBP nunca se guardan salvo en incidencias). */
export interface PassState {
  step: 'claims' | 'bags';
  claims: TagCode[];
  bags: BagEval[];
  bcbp?: BcbpData;
  startedAt?: number;
  manualEntry: boolean;
  /** Índice de la maleta con coincidencia parcial pendiente de confirmar. */
  pendingPartial?: number;
  outcome?: PassOutcome;
  /** Ya se abrió la ficha de incidencia para este pasajero (evita reabrirla automáticamente). */
  incidentShown?: boolean;
}

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
  shift: Shift | null;
  /** Vuelo seleccionado manualmente (si el turno controla varios). */
  currentFlight?: string;
  pass: PassState;
  counters: { controls: number; incidents: number };
  toast: Toast | null;
  updateAvailable: boolean;
  /** Petición de PIN de supervisor en curso. */
  pinRequest: { reason: string; resolve: (ok: boolean) => void } | null;
  /** Simulador de lecturas activo en la pantalla de control. */
  demoSim: boolean;
}

export const emptyPass = (): PassState => ({ step: 'claims', claims: [], bags: [], manualEntry: false });

let state: AppState = {
  route: { name: 'loading' },
  config: DEFAULT_CONFIG,
  airlines: buildAirlineIndex(DEFAULT_CONFIG.airlines),
  prefs: { lastGuardId: '', lastAirport: '', lastTerminal: '', lastPost: '', recentFlights: [] },
  shift: null,
  pass: emptyPass(),
  counters: { controls: 0, incidents: 0 },
  toast: null,
  updateAvailable: false,
  pinRequest: null,
  demoSim: false,
};

/** Maletas verificadas en el turno activo (para YA CONTROLADA). */
export const seen = new SeenRegistry();

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

export function setPass(patch: Partial<PassState> | ((p: PassState) => Partial<PassState>)) {
  setState((s) => ({ pass: { ...s.pass, ...(typeof patch === 'function' ? patch(s.pass) : patch) } }));
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

export function useApp(): AppState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return state;
}

/** Pide el PIN de supervisor. Resuelve true si es correcto, false si se cancela. */
export function requestPin(reason: string): Promise<boolean> {
  return new Promise((resolve) => {
    setState({
      pinRequest: {
        reason,
        resolve: (ok) => {
          setState({ pinRequest: null });
          resolve(ok);
        },
      },
    });
  });
}

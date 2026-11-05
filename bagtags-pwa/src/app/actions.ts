/**
 * Acciones de la app: turno, flujo de control en salida e incidencias.
 */
import { classify } from '../domain/classify';
import { formatTag, tagId, type CodeSource, type TagCode } from '../domain/lpn';
import { computeOutcome, containsCode, evaluateBag, shouldAutoFinish, type ControlResult } from '../domain/matcher';
import type { AppConfig } from '../domain/config';
import type { ControlRecord, Incident, Shift } from '../domain/types';
import * as store from '../storage/db';
import { camera } from '../scanner/camera';
import { cue, setFeedback } from '../feedback';
import { emptyPass, getState, navigate, seen, setPass, setState, toast } from './store';

// ---------------------------------------------------------------- arranque

export async function init() {
  const [config, prefs] = await Promise.all([store.loadConfig(), store.loadPrefs()]);
  applyConfig(config);
  setState({ config, prefs });
  void store.requestPersistence();
  let shift: Shift | null = null;
  if (prefs.activeShiftId) {
    shift = (await store.getShift(prefs.activeShiftId)) ?? null;
    if (shift?.endedAt) shift = null;
  }
  await retention();
  window.addEventListener('hashchange', () => {
    if (location.hash === '#demo') navigate({ name: 'demo' });
  });
  window.setInterval(() => void retention(), 15 * 60_000);
  if (shift) {
    await loadShift(shift);
    navigate(location.hash === '#demo' ? { name: 'demo' } : { name: 'control' });
  } else {
    navigate(location.hash === '#demo' ? { name: 'demo' } : { name: 'start' });
  }
}

function applyConfig(cfg: AppConfig) {
  setFeedback({ sound: cfg.sound, vibration: cfg.vibration });
  camera.setDecoderPref(cfg.decoder);
  document.documentElement.dataset.theme = cfg.theme;
}

export async function updateConfig(cfg: AppConfig) {
  await store.saveConfig(cfg);
  applyConfig(cfg);
  setState({ config: cfg });
}

async function retention() {
  const s = getState();
  const plan = await store.runRetention(s.config, s.shift?.id);
  if (plan.controls.length && s.shift) await loadShift(s.shift);
}

async function loadShift(shift: Shift) {
  const [controls, incidents] = await Promise.all([store.controlsOf(shift.id), store.incidentsOf(shift.id)]);
  seen.clear();
  for (const c of controls) registerSeen(c);
  setState({
    shift,
    pass: emptyPass(),
    counters: { controls: controls.length, incidents: incidents.length },
    currentFlight: shift.flights.length === 1 ? shift.flights[0] : getState().currentFlight,
  });
}

function registerSeen(c: ControlRecord) {
  if (c.result === 'mismatch' || c.result === 'already') return;
  for (const b of c.bags) if (b.status === 'match' || b.status === 'manual') seen.addId(b.id, c.ts);
}

// ---------------------------------------------------------------- turno

export async function startShift(data: Omit<Shift, 'id' | 'endedAt'>) {
  const shift: Shift = { ...data, id: store.uid() };
  await store.putShift(shift);
  const prefs = {
    ...getState().prefs,
    lastGuardId: shift.guardId,
    lastAirport: shift.airport,
    lastTerminal: shift.terminal,
    lastPost: shift.post,
    recentFlights: [...new Set([...shift.flights, ...getState().prefs.recentFlights])].slice(0, 12),
    activeShiftId: shift.id,
  };
  await store.savePrefs(prefs);
  setState({ prefs, currentFlight: shift.flights[0] });
  await loadShift(shift);
  navigate({ name: 'control' });
}

export async function endShift() {
  const s = getState();
  if (!s.shift) return;
  const shift = { ...s.shift, endedAt: Date.now() };
  await store.putShift(shift);
  const prefs = { ...s.prefs, activeShiftId: undefined };
  await store.savePrefs(prefs);
  camera.stop();
  setState({ shift, prefs, pass: emptyPass() });
  navigate({ name: 'report' });
}

/** Borra los datos del turno ya cerrado y vuelve al inicio. */
export async function deleteShift(shiftId: string) {
  await store.deleteShiftData(shiftId);
  seen.clear();
  setState({ shift: null, counters: { controls: 0, incidents: 0 }, pass: emptyPass() });
  navigate({ name: 'start' });
}

export function setCurrentFlight(f: string | undefined) {
  setState({ currentFlight: f });
}

// ---------------------------------------------------------------- flujo de control

/** Punto de entrada de cualquier lectura ya confirmada (cámara, teclado, BT, demo). */
export function handleInput(raw: string, source: CodeSource): boolean {
  const s = getState();
  const p = s.pass;
  if (p.outcome || p.pendingPartial !== undefined) return false; // pantalla de resultado o confirmación abierta
  const c = classify(raw, s.airlines, source);

  if (c.kind === 'invalid') {
    if (source !== 'camera') {
      cue('error');
      toast(c.error, 'error', 3500);
    }
    return false;
  }

  const startedAt = p.startedAt ?? Date.now();
  const manual = p.manualEntry || source === 'manual';

  if (c.kind === 'bcbp') {
    // Tarjeta de embarque: asocia vuelo; si trae LPN de equipaje los añade como resguardos.
    const added: TagCode[] = [];
    if (p.step === 'claims') {
      for (const lpn of c.data.bagTags) {
        const r = classify(lpn, s.airlines, 'bcbp');
        if (r.kind === 'tag' && !containsCode([...p.claims, ...added], r.code)) added.push(r.code);
      }
    }
    setPass({ bcbp: c.data, startedAt, claims: [...p.claims, ...added] });
    cue('scan');
    const leg = c.data.legs[0];
    toast(`Tarjeta de embarque: vuelo ${leg?.flight ?? '—'} ${leg ? leg.from + '→' + leg.to : ''}${added.length ? ` · ${added.length} resguardo(s)` : ''}`, 'info');
    return true;
  }

  const code = c.code;
  if (p.step === 'claims') {
    if (containsCode(p.claims, code)) {
      // El mismo código otra vez: en la práctica es la etiqueta de la maleta → paso 2 automático.
      if (s.config.autoAdvanceOnRepeat && (source === 'camera' || source === 'keyboard')) {
        setPass({ step: 'bags' });
        return addBag(code, startedAt, manual);
      }
      toast(`Resguardo ${formatTag(code)} ya leído`, 'warn');
      return false;
    }
    setPass({ claims: [...p.claims, code], startedAt, manualEntry: manual });
    cue('scan');
    return true;
  }
  return addBag(code, startedAt, manual);
}

function addBag(code: TagCode, startedAt: number, manual: boolean): boolean {
  const { pass: p, config } = getState();
  if (p.bags.some((b) => b.code.key === code.key)) {
    toast(`Maleta ${formatTag(code)} ya escaneada`, 'warn');
    return false;
  }
  const ev = evaluateBag(code, p.claims, p.bags, seen);
  const bags = [...p.bags, ev];
  setPass({ bags, startedAt, manualEntry: manual });
  if (ev.status === 'partial') {
    cue('partial');
    setPass({ pendingPartial: bags.length - 1 });
    return true;
  }
  cue('scan');
  if (ev.status === 'nomatch' || ev.status === 'already' || (config.autoFinish && shouldAutoFinish(p.claims, bags))) void finish();
  return true;
}

export function goToBags() {
  setPass({ step: 'bags' });
}

export function removeClaim(i: number) {
  setPass((p) => ({ claims: p.claims.filter((_, k) => k !== i), bags: [] }));
}

export function removeBag(i: number) {
  setPass((p) => ({ bags: p.bags.filter((_, k) => k !== i) }));
}

/** Respuesta del vigilante a una coincidencia parcial (etiqueta dañada / lectura incompleta). */
export function resolvePartial(matches: boolean) {
  const { pass: p, config } = getState();
  if (p.pendingPartial === undefined) return;
  const bags = p.bags.map((b, i) => (i === p.pendingPartial ? { ...b, status: matches ? ('manual' as const) : ('nomatch' as const) } : b));
  setPass({ bags, pendingPartial: undefined });
  if (!matches || (config.autoFinish && shouldAutoFinish(p.claims, bags))) void finish();
}

/** Cierra el pasajero actual, guarda el control y muestra el resultado. */
export async function finish(): Promise<void> {
  const s = getState();
  const p = s.pass;
  if (p.outcome) return;
  const result = computeOutcome(p.claims, p.bags);
  if (result === null) return;
  const control: ControlRecord = {
    id: store.uid(),
    shiftId: s.shift!.id,
    ts: Date.now(),
    result,
    claims: p.claims.map(tagId),
    bags: p.bags.map((b) => ({ id: tagId(b.code), status: b.status })),
    manualValidation: p.bags.some((b) => b.status === 'manual'),
    manualEntry: p.manualEntry,
    flight: passFlight(),
    durationMs: p.startedAt ? Date.now() - p.startedAt : undefined,
  };
  setPass({ outcome: { result, controlId: control.id, at: control.ts } });
  cue(result === 'ok' ? 'ok' : result === 'mismatch' ? 'mismatch' : result === 'already' ? 'already' : 'incomplete');
  await store.putControl(control);
  registerSeen(control);
  setState((st) => ({ counters: { ...st.counters, controls: st.counters.controls + 1 } }));
}

/** Vuelo del pasajero actual: BCBP leído o vuelo seleccionado en el turno. */
export function passFlight(): string | undefined {
  const s = getState();
  return s.pass.bcbp?.legs[0]?.flight ?? s.currentFlight;
}

/** El vigilante da por bueno un INCOMPLETO (p. ej. el pasajero espera otra maleta). */
export async function confirmIncomplete() {
  const s = getState();
  const o = s.pass.outcome;
  if (!o) return;
  await patchControl(o.controlId, { result: 'incomplete_confirmed', manualValidation: true });
  setPass({ outcome: { ...o, result: 'incomplete_confirmed' } });
  cue('ok');
}

/** Volver al paso de maletas desde INCOMPLETO (deshace el control guardado). */
export async function continueScanning() {
  const s = getState();
  const o = s.pass.outcome;
  if (!o) return;
  const d = await store.db();
  await d.delete('controls', o.controlId);
  setState((st) => ({ counters: { ...st.counters, controls: Math.max(0, st.counters.controls - 1) } }));
  setPass({ outcome: undefined, step: 'bags' });
}

async function patchControl(id: string, patch: Partial<ControlRecord>) {
  const d = await store.db();
  const c = await d.get('controls', id);
  if (c) await d.put('controls', { ...c, ...patch });
}

export function nextPassenger() {
  setState({ pass: emptyPass() });
}

// ---------------------------------------------------------------- incidencias

export function openIncident(presetType?: string) {
  const o = getState().pass.outcome;
  setPass({ incidentShown: true });
  navigate({ name: 'incident', controlId: o?.controlId, presetType });
}

export async function saveIncident(inc: Omit<Incident, 'id' | 'shiftId' | 'ts'> & { id?: string; ts?: number }) {
  const s = getState();
  const isNew = !inc.id;
  const full: Incident = { ...inc, id: inc.id ?? store.uid(), shiftId: s.shift!.id, ts: inc.ts ?? Date.now() };
  await store.putIncident(full);
  if (full.controlId) await patchControl(full.controlId, { incidentId: full.id });
  if (isNew) setState((st) => ({ counters: { ...st.counters, incidents: st.counters.incidents + 1 } }));
  return full;
}

export async function deleteIncidentById(id: string) {
  await store.deleteIncident(id);
  setState((st) => ({ counters: { ...st.counters, incidents: Math.max(0, st.counters.incidents - 1) } }));
}

export const RESULT_TEXT: Record<ControlResult, string> = {
  ok: 'CORRECTO',
  incomplete_confirmed: 'CORRECTO',
  mismatch: 'NO COINCIDE',
  incomplete: 'INCOMPLETO',
  already: 'YA CONTROLADA',
};

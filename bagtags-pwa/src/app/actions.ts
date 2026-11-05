/** Acciones de la app: vigilante, ticket (resguardos → cinta → cierre) y envío. */
import { classify } from '../domain/classify';
import { formatTag, type CodeSource } from '../domain/lpn';
import type { AppConfig } from '../domain/config';
import type { GuardInfo, PassengerData, Ticket } from '../domain/types';
import type { BcbpData } from '../domain/bcbp';
import { allFound, claimFromCode, closeTicket, evaluateBeltScan, hasClaim, markFound, newTicket, reopenTicket } from '../domain/ticket';
import * as store from '../storage/db';
import { camera } from '../scanner/camera';
import { cue, setFeedback } from '../feedback';
import { canAutoSend, sendViaPowerAutomate, shareTicket } from '../send/send';
import { getState, navigate, setState, toast } from './store';

const today = () => new Date().toISOString().slice(0, 10);
let flashSeq = 0;

// ---------------------------------------------------------------- arranque

export async function init() {
  const [config, prefs] = await Promise.all([store.loadConfig(), store.loadPrefs()]);
  applyConfig(config);
  setState({ config, prefs });
  void store.requestPersistence();
  await store.runRetention(config);

  let ticket: Ticket | null = null;
  if (prefs.activeTicketId) ticket = (await store.getTicket(prefs.activeTicketId)) ?? null;
  setState({ ticket, step: ticket?.beltAt ? 'belt' : 'claims' });
  await refreshPending();

  window.addEventListener('online', () => {
    setState({ online: true });
    void processQueue();
  });
  window.addEventListener('offline', () => setState({ online: false }));
  window.setInterval(() => void processQueue(), 5 * 60_000);
  window.addEventListener('hashchange', () => {
    if (location.hash === '#demo') navigate({ name: 'demo' });
  });
  void processQueue();

  if (location.hash === '#demo') return navigate({ name: 'demo' });
  if (!prefs.guard) return navigate({ name: 'guard' });
  if (ticket && ticket.status !== 'open') return navigate({ name: 'close' });
  if (!ticket && prefs.guardDate !== today()) return navigate({ name: 'guard' });
  await ensureTicket();
  navigate({ name: 'ticket' });
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
  void processQueue();
}

// ---------------------------------------------------------------- vigilante

export async function saveGuard(guard: GuardInfo) {
  const s = getState();
  const prefs = { ...s.prefs, guard, guardDate: today() };
  await store.savePrefs(prefs);
  setState({ prefs });
  // El ticket abierto (si lo hay) se queda con los datos con los que se abrió, salvo que aún esté vacío.
  if (s.ticket && s.ticket.status === 'open' && s.ticket.claims.length === 0) await saveTicket({ ...s.ticket, guard });
  await ensureTicket();
  navigate({ name: s.ticket && s.ticket.status !== 'open' ? 'close' : 'ticket' });
}

// ---------------------------------------------------------------- ticket

async function saveTicket(t: Ticket) {
  setState({ ticket: t });
  await store.putTicket(t);
}

async function setActive(id: string | undefined) {
  const prefs = { ...getState().prefs, activeTicketId: id };
  setState({ prefs });
  await store.savePrefs(prefs);
}

export async function ensureTicket() {
  const s = getState();
  if (s.ticket || !s.prefs.guard) return;
  const t = newTicket(store.uid(), s.prefs.guard, Date.now());
  await saveTicket(t);
  await setActive(t.id);
  setState({ step: 'claims', flash: null, partial: null });
}

function passengerFrom(b: BcbpData): PassengerData {
  const l = b.legs[0];
  return { name: b.displayName, pnr: l?.pnr ?? '', flight: l?.flight ?? '', from: l?.from ?? '', to: l?.to ?? '', date: l?.date ?? null, seat: l?.seat };
}

/** Entrada de cualquier lectura ya confirmada (cámara, teclado, lector BT, demo). */
export function handleInput(raw: string, source: CodeSource): boolean {
  const s = getState();
  const t = s.ticket;
  if (!t || t.status !== 'open' || s.partial) return false;
  const c = classify(raw, s.airlines, source);

  if (c.kind === 'invalid') {
    if (source !== 'camera') {
      cue('error');
      toast(c.error, 'error', 3500);
    }
    return false;
  }

  if (c.kind === 'bcbp') {
    // Tarjeta de embarque: datos del pasajero y vuelo; en el paso 1 añade los LPN que traiga.
    let next: Ticket = { ...t, passenger: passengerFrom(c.data), flight: t.flight || c.data.legs[0]?.flight };
    let added = 0;
    if (s.step === 'claims') {
      for (const lpn of c.data.bagTags) {
        const r = classify(lpn, s.airlines, 'bcbp');
        if (r.kind === 'tag' && !hasClaim(next, r.code)) {
          next = { ...next, claims: [...next.claims, claimFromCode(r.code)] };
          added++;
        }
      }
    }
    void saveTicket(next);
    cue('scan');
    const leg = c.data.legs[0];
    toast(`Tarjeta de embarque: ${leg?.flight ?? ''} ${leg ? leg.from + '→' + leg.to : ''}${added ? ` · ${added} resguardo(s)` : ''}`, 'info');
    return true;
  }

  const code = c.code;
  if (s.step === 'claims') {
    if (hasClaim(t, code)) {
      toast(`Resguardo ${formatTag(code)} ya leído`, 'warn');
      return false;
    }
    void saveTicket({ ...t, claims: [...t.claims, claimFromCode(code)] });
    cue('scan');
    return true;
  }

  // Cinta
  const v = evaluateBeltScan(t.claims, code);
  const seq = ++flashSeq;
  switch (v.kind) {
    case 'match':
      found(markFound(t, v.claimIndex, Date.now()), v.claimIndex, seq);
      break;
    case 'repeat':
      cue('repeat');
      setState({ flash: { kind: 'repeat', claimIndex: v.claimIndex, seq } });
      break;
    case 'partial':
      cue('partial');
      setState({ partial: { claimIndex: v.claimIndex, code: formatTag(code) }, flash: null });
      break;
    case 'nomatch':
      cue('nomatch');
      void saveTicket({ ...t, negatives: t.negatives + 1 });
      setState({ flash: { kind: 'nomatch', code: formatTag(code), seq } });
      break;
  }
  return true;
}

function found(next: Ticket, claimIndex: number, seq: number) {
  void saveTicket(next);
  if (allFound(next)) {
    cue('ok');
    setState({ flash: { kind: 'allfound', seq } });
    // Todas recogidas: se cierra solo tras mostrar el aviso.
    window.setTimeout(() => {
      const s = getState();
      if (s.flash?.seq === seq && s.ticket?.id === next.id && s.ticket.status === 'open') void closeNow();
    }, 2500);
  } else {
    cue('match');
    setState({ flash: { kind: 'match', claimIndex, seq } });
  }
}

/** Respuesta del vigilante a una coincidencia parcial (etiqueta dañada / de reserva). */
export function resolvePartial(isHers: boolean) {
  const s = getState();
  const t = s.ticket;
  if (!t || !s.partial) return;
  const seq = ++flashSeq;
  const { claimIndex, code } = s.partial;
  setState({ partial: null });
  if (isHers) found(markFound(t, claimIndex, Date.now(), true), claimIndex, seq);
  else {
    cue('nomatch');
    void saveTicket({ ...t, negatives: t.negatives + 1 });
    setState({ flash: { kind: 'nomatch', code, seq } });
  }
}

export function clearFlash(seq: number) {
  if (getState().flash?.seq === seq) setState({ flash: null });
}

export function removeClaim(i: number) {
  const t = getState().ticket;
  if (t) void saveTicket({ ...t, claims: t.claims.filter((_, k) => k !== i) });
}

export function startBelt() {
  const t = getState().ticket;
  if (!t || t.claims.length === 0) return;
  void saveTicket({ ...t, beltAt: t.beltAt ?? Date.now() });
  setState({ step: 'belt', flash: null });
}

export function backToClaims() {
  setState({ step: 'claims', flash: null });
}

/** Cierra el ticket (cinta terminada o todas recogidas). */
export async function closeNow() {
  const t = getState().ticket;
  if (!t) return;
  const closed = closeTicket(t, Date.now());
  if (closed.status === 'missing') cue('missing');
  await saveTicket(closed);
  setState({ flash: null, partial: null });
  navigate({ name: 'close' });
}

/** Vuelve a la cinta desde el cierre (p. ej. aparece la maleta que faltaba). */
export async function reopen() {
  const t = getState().ticket;
  if (!t) return;
  await saveTicket(reopenTicket(t));
  setState({ step: 'belt', flash: null });
  navigate({ name: 'ticket' });
}

export function updateTicket(patch: Partial<Pick<Ticket, 'notes' | 'photos' | 'includePassenger' | 'flight'>>) {
  const t = getState().ticket;
  if (t) void saveTicket({ ...t, ...patch });
}

/** Termina el ticket actual y abre uno nuevo para el siguiente pasajero. */
export async function nextTicket() {
  setState({ ticket: null, flash: null, partial: null, step: 'claims' });
  await setActive(undefined);
  if (getState().prefs.guardDate !== today()) return navigate({ name: 'guard' });
  await ensureTicket();
  navigate({ name: 'ticket' });
}

export async function discardTicket() {
  const t = getState().ticket;
  if (t) await store.deleteTicket(t.id);
  await nextTicket();
}

// ---------------------------------------------------------------- envío

async function refreshPending() {
  const n = (await store.listTickets()).filter((t) => t.send.status === 'pending' || t.send.status === 'failed').length;
  setState({ pendingCount: n });
}

async function setSend(t: Ticket, send: Ticket['send']) {
  const next = { ...t, send };
  await store.putTicket(next);
  if (getState().ticket?.id === t.id) setState({ ticket: next });
  await refreshPending();
  return next;
}

/**
 * Envía el ticket cerrado. Con Power Automate configurado lo manda (o lo deja
 * en cola si no hay red). Devuelve 'sent' | 'queued' | 'needs-share'.
 */
export async function sendTicket(t: Ticket): Promise<'sent' | 'queued' | 'needs-share'> {
  const cfg = getState().config;
  if (!canAutoSend(cfg)) return 'needs-share';
  if (!navigator.onLine) {
    await setSend(t, { status: 'pending', attempts: t.send.attempts, error: 'Sin conexión' });
    return 'queued';
  }
  try {
    await sendViaPowerAutomate(t, cfg);
    await setSend(t, { status: 'sent', at: Date.now(), attempts: t.send.attempts + 1 });
    return 'sent';
  } catch (e) {
    await setSend(t, { status: 'failed', attempts: t.send.attempts + 1, error: (e as Error).message });
    return 'queued';
  }
}

export async function shareViaPhone(t: Ticket): Promise<boolean> {
  const r = await shareTicket(t, getState().config);
  if (r === 'cancelled') return false;
  // Si estaba en cola para Power Automate, se mantiene; si no, queda como compartido.
  if (t.send.status !== 'pending' && t.send.status !== 'failed') await setSend(t, { status: 'shared', at: Date.now(), attempts: t.send.attempts });
  return true;
}

let processing = false;
/** Reintenta los envíos pendientes (al recuperar la red, al arrancar y cada 5 min). */
export async function processQueue() {
  const cfg = getState().config;
  if (processing || !navigator.onLine || !canAutoSend(cfg)) return;
  processing = true;
  try {
    const pending = (await store.listTickets()).filter((t) => t.send.status === 'pending' || t.send.status === 'failed');
    let sent = 0;
    for (const t of pending) {
      try {
        await sendViaPowerAutomate(t, cfg);
        await setSend(t, { status: 'sent', at: Date.now(), attempts: t.send.attempts + 1 });
        sent++;
      } catch (e) {
        await setSend(t, { status: 'failed', attempts: t.send.attempts + 1, error: (e as Error).message });
      }
    }
    if (sent) toast(`${sent} ticket(s) pendiente(s) enviado(s)`, 'ok');
  } finally {
    processing = false;
  }
}

export async function deleteTicketById(id: string) {
  await store.deleteTicket(id);
  await refreshPending();
}

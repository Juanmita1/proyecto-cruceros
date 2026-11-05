import { describe, expect, it } from 'vitest';
import { buildAirlineIndex, DEFAULT_AIRLINES } from '../src/domain/airlines';
import { parseTag, type TagCode } from '../src/domain/lpn';
import { allFound, claimFromCode, closeTicket, evaluateBeltScan, expiredTickets, hasClaim, markFound, newTicket, pendingClaims, reopenTicket, ticketFlight } from '../src/domain/ticket';
import type { Ticket } from '../src/domain/types';
import { SAMPLE } from './samples';

const idx = buildAirlineIndex(DEFAULT_AIRLINES);
const tag = (raw: string, src: 'camera' | 'manual' = 'camera'): TagCode => {
  const r = parseTag(raw, idx, src);
  if (!r.ok) throw new Error(r.error);
  return r.code;
};
const guard = { guardId: 'TIP1', airport: 'MAD', terminal: 'T4S', post: 'Cinta 7' };
const withClaims = (...codes: string[]): Ticket => ({ ...newTicket('t1', guard, 1000), claims: codes.map((c) => claimFromCode(tag(c))) });

describe('cinta: evaluateBeltScan', () => {
  it('¡ES SUYA! cuando coincide el LPN completo', () => {
    const t = withClaims(SAMPLE.ib1, SAMPLE.ib2);
    expect(evaluateBeltScan(t.claims, tag(SAMPLE.ib2))).toEqual({ kind: 'match', claimIndex: 1 });
  });
  it('NO ES SUYA para cualquier otra maleta', () => {
    const t = withClaims(SAMPLE.ib1);
    expect(evaluateBeltScan(t.claims, tag(SAMPLE.vy1))).toEqual({ kind: 'nomatch' });
    expect(evaluateBeltScan(t.claims, tag(SAMPLE.ux1))).toEqual({ kind: 'nomatch' });
  });
  it('YA RECOGIDA si se vuelve a escanear una maleta encontrada', () => {
    const t = markFound(withClaims(SAMPLE.ib1), 0, 5000);
    expect(evaluateBeltScan(t.claims, tag(SAMPLE.ib1))).toEqual({ kind: 'repeat', claimIndex: 0, at: 5000 });
  });
  it('¿ES SUYA? (parcial) si solo coinciden aerolínea y serie', () => {
    const t = withClaims(SAMPLE.ib1);
    expect(evaluateBeltScan(t.claims, tag(SAMPLE.ib1Fallback))).toEqual({ kind: 'partial', claimIndex: 0 });
    expect(evaluateBeltScan(t.claims, tag('075123456', 'manual'))).toEqual({ kind: 'partial', claimIndex: 0 });
  });
  it('resguardo tecleado "IB 123456" coincide con la etiqueta de tipo 0', () => {
    const t: Ticket = { ...newTicket('t', guard, 0), claims: [claimFromCode(tag('IB 123456', 'manual'))] };
    expect(evaluateBeltScan(t.claims, tag(SAMPLE.ib1)).kind).toBe('match');
  });
});

describe('ciclo del ticket', () => {
  it('TODO OK cuando salen todas las maletas', () => {
    let t = withClaims(SAMPLE.ib1, SAMPLE.ib2);
    expect(allFound(t)).toBe(false);
    t = markFound(t, 0, 2000);
    t = markFound(t, 1, 3000, true);
    expect(allFound(t)).toBe(true);
    const c = closeTicket(t, 4000);
    expect(c.status).toBe('ok');
    expect(c.closedAt).toBe(4000);
    expect(c.claims[1].manual).toBe(true);
  });
  it('FALTAN maletas si se cierra antes', () => {
    const c = closeTicket(markFound(withClaims(SAMPLE.ib1, SAMPLE.ib2), 0, 2000), 4000);
    expect(c.status).toBe('missing');
    expect(pendingClaims(c).map((x) => x.id)).toEqual([SAMPLE.ib2]);
  });
  it('un ticket sin resguardos nunca está "todo ok"', () => {
    expect(closeTicket(newTicket('x', guard, 0), 1).status).toBe('missing');
  });
  it('markFound no sobrescribe la hora de una maleta ya encontrada', () => {
    const t = markFound(markFound(withClaims(SAMPLE.ib1), 0, 2000), 0, 9000);
    expect(t.claims[0].foundAt).toBe(2000);
  });
  it('reabrir vuelve a "open" y reinicia el envío', () => {
    const c = { ...closeTicket(withClaims(SAMPLE.ib1), 10), send: { status: 'failed' as const, attempts: 2 } };
    const r = reopenTicket(c);
    expect(r.status).toBe('open');
    expect(r.closedAt).toBeUndefined();
    expect(r.send).toEqual({ status: 'none', attempts: 0 });
  });
  it('hasClaim detecta resguardos repetidos por aerolínea + serie', () => {
    const t = withClaims(SAMPLE.ib1);
    expect(hasClaim(t, tag(SAMPLE.ib1Fallback))).toBe(true);
    expect(hasClaim(t, tag(SAMPLE.ib2))).toBe(false);
  });
  it('vuelo: el introducido a mano tiene prioridad sobre el del BCBP', () => {
    const p = { name: 'X', pnr: 'P', flight: 'IB3167', from: 'LHR', to: 'MAD', date: null };
    expect(ticketFlight({ passenger: p })).toBe('IB3167');
    expect(ticketFlight({ passenger: p, flight: 'UX1092' })).toBe('UX1092');
    expect(ticketFlight({})).toBeUndefined();
  });
});

describe('retención', () => {
  const DAY = 24 * 3600_000;
  const base = closeTicket(withClaims(SAMPLE.ib1), 0);
  it('borra los enviados o compartidos más antiguos que el plazo', () => {
    const list: Ticket[] = [
      { ...base, id: 'sent', send: { status: 'sent', attempts: 1 } },
      { ...base, id: 'shared', send: { status: 'shared', attempts: 0 } },
      { ...base, id: 'none', send: { status: 'none', attempts: 0 } },
    ];
    expect(expiredTickets(list, 31 * DAY, 30).sort()).toEqual(['none', 'sent', 'shared']);
    expect(expiredTickets(list, 29 * DAY, 30)).toEqual([]);
  });
  it('nunca borra los pendientes de envío ni el ticket abierto', () => {
    const list: Ticket[] = [
      { ...base, id: 'pending', send: { status: 'pending', attempts: 0 } },
      { ...base, id: 'failed', send: { status: 'failed', attempts: 3 } },
      { ...withClaims(SAMPLE.ib1), id: 'open' },
    ];
    expect(expiredTickets(list, 365 * DAY, 30)).toEqual([]);
  });
});

/**
 * Lógica del ticket de cinta.
 *
 *  1. Se leen los resguardos del pasajero.
 *  2. En la cinta, cada maleta escaneada se compara con ellos:
 *       match    → ¡ES SUYA! (se marca como recogida)
 *       repeat   → ya recogida antes
 *       partial  → coinciden aerolínea + serie pero no el código completo: el vigilante lo confirma
 *       nomatch  → NO ES SUYA
 *  3. Se cierra: TODO OK si han salido todas, o FALTAN N si alguna no ha aparecido.
 */
import { tagId, type TagCode } from './lpn';
import type { GuardInfo, Ticket, TicketClaim } from './types';

export type BeltVerdict =
  | { kind: 'match'; claimIndex: number }
  | { kind: 'repeat'; claimIndex: number; at: number }
  | { kind: 'partial'; claimIndex: number }
  | { kind: 'nomatch' };

export function newTicket(id: string, guard: GuardInfo, now: number): Ticket {
  return {
    id,
    createdAt: now,
    status: 'open',
    guard,
    claims: [],
    negatives: 0,
    includePassenger: true,
    notes: '',
    photos: [],
    send: { status: 'none', attempts: 0 },
  };
}

export function claimFromCode(c: TagCode): TicketClaim {
  return { id: tagId(c), lpn: c.lpn, key: c.key, airlineIata: c.airlineIata };
}

/** true si el resguardo ya está en el ticket (misma aerolínea + serie). */
export function hasClaim(t: Ticket, c: TagCode): boolean {
  return t.claims.some((x) => x.key === c.key);
}

/** Compara una maleta de la cinta con los resguardos del ticket. */
export function evaluateBeltScan(claims: TicketClaim[], bag: TagCode): BeltVerdict {
  // Coincidencia exacta de los 10 dígitos, prefiriendo resguardos aún pendientes.
  const order = claims.map((_, i) => i).sort((a, b) => Number(!!claims[a].foundAt) - Number(!!claims[b].foundAt));
  for (const i of order) {
    const c = claims[i];
    if (bag.lpn && c.lpn && bag.lpn === c.lpn) return c.foundAt ? { kind: 'repeat', claimIndex: i, at: c.foundAt } : { kind: 'match', claimIndex: i };
  }
  for (const i of order) {
    const c = claims[i];
    if (c.key === bag.key) return c.foundAt ? { kind: 'repeat', claimIndex: i, at: c.foundAt } : { kind: 'partial', claimIndex: i };
  }
  return { kind: 'nomatch' };
}

export function markFound(t: Ticket, claimIndex: number, now: number, manual = false): Ticket {
  return { ...t, claims: t.claims.map((c, i) => (i === claimIndex && !c.foundAt ? { ...c, foundAt: now, manual } : c)) };
}

export function pendingClaims(t: Pick<Ticket, 'claims'>): TicketClaim[] {
  return t.claims.filter((c) => !c.foundAt);
}

export function allFound(t: Pick<Ticket, 'claims'>): boolean {
  return t.claims.length > 0 && pendingClaims(t).length === 0;
}

/** Cierra el ticket: TODO OK o FALTAN maletas. */
export function closeTicket(t: Ticket, now: number): Ticket {
  return { ...t, closedAt: now, status: allFound(t) ? 'ok' : 'missing' };
}

/** Reabre un ticket cerrado (p. ej. la maleta que faltaba aparece después). */
export function reopenTicket(t: Ticket): Ticket {
  return { ...t, closedAt: undefined, status: 'open', send: { status: 'none', attempts: 0 } };
}

/** Vuelo del ticket: el del BCBP o el introducido a mano. */
export function ticketFlight(t: Pick<Ticket, 'flight' | 'passenger'>): string | undefined {
  return t.flight || t.passenger?.flight || undefined;
}

/**
 * Tickets que se pueden borrar por antigüedad. Nunca se borran el ticket
 * abierto ni los pendientes de envío.
 */
export function expiredTickets(tickets: Ticket[], now: number, retentionDays: number): string[] {
  const limit = now - retentionDays * 24 * 3600_000;
  return tickets
    .filter((t) => t.status !== 'open' && t.send.status !== 'pending' && t.send.status !== 'failed' && (t.closedAt ?? t.createdAt) < limit)
    .map((t) => t.id);
}

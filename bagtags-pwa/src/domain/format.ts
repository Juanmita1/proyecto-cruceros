/** Formatos de fecha/hora y textos del ticket (asunto y cuerpo del correo). */
import type { Ticket, TicketClaim } from './types';
import { pendingClaims, ticketFlight } from './ticket';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fmtTime(ts: number, seconds = false): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}${seconds ? ':' + pad2(d.getSeconds()) : ''}`;
}

/** "0075123456" → "0 075 123456"; clave de 9 dígitos → "· 075 123456". */
export function fmtClaim(c: Pick<TicketClaim, 'lpn' | 'key'>): string {
  return c.lpn ? `${c.lpn[0]} ${c.lpn.slice(1, 4)} ${c.lpn.slice(4)}` : `· ${c.key.slice(0, 3)} ${c.key.slice(3)}`;
}

/** "IB 123456" si se conoce la aerolínea. */
export function fmtClaimAlpha(c: Pick<TicketClaim, 'airlineIata' | 'key'>): string {
  return `${c.airlineIata ?? c.key.slice(0, 3)} ${c.key.slice(3)}`;
}

export function statusLabel(t: Pick<Ticket, 'status' | 'claims'>): string {
  if (t.status === 'ok') return 'TODO OK';
  if (t.status === 'missing') {
    const n = pendingClaims(t).length;
    return `FALTA${n === 1 ? '' : 'N'} ${n} MALETA${n === 1 ? '' : 'S'}`;
  }
  return 'ABIERTO';
}

/** Asunto del correo: "[Bagtags Aerovalue] TODO OK · IB3167 · MAD T4S · 05/11/2026 10:32". */
export function emailSubject(t: Ticket): string {
  const ts = t.closedAt ?? t.createdAt;
  const parts = [statusLabel(t), ticketFlight(t), `${t.guard.airport} ${t.guard.terminal}`.trim(), `${fmtDate(ts)} ${fmtTime(ts)}`].filter(Boolean);
  return `[Bagtags Aerovalue] ${parts.join(' · ')}`;
}

/** Cuerpo del correo en texto plano (el detalle completo va en el PDF adjunto). */
export function emailBody(t: Ticket): string {
  const found = t.claims.filter((c) => c.foundAt);
  const missing = pendingClaims(t);
  const lines = [
    `Resultado: ${statusLabel(t)}`,
    `Vigilante: ${t.guard.guardId} · ${t.guard.airport} ${t.guard.terminal} · ${t.guard.post}`,
    `Vuelo: ${ticketFlight(t) ?? '-'}`,
    `Apertura: ${fmtDate(t.createdAt)} ${fmtTime(t.createdAt)} · Cierre: ${t.closedAt ? fmtTime(t.closedAt) : '-'}`,
    '',
    `Maletas recogidas (${found.length}/${t.claims.length}):`,
    ...found.map((c) => `  - ${fmtClaim(c)} (${fmtClaimAlpha(c)}) a las ${fmtTime(c.foundAt!)}${c.manual ? ' [validación manual]' : ''}`),
  ];
  if (missing.length) lines.push('', `Maletas NO aparecidas (${missing.length}):`, ...missing.map((c) => `  - ${fmtClaim(c)} (${fmtClaimAlpha(c)})`));
  lines.push('', `Maletas de otros pasajeros descartadas en cinta: ${t.negatives}`);
  if (t.notes.trim()) lines.push('', `Observaciones: ${t.notes.trim()}`);
  lines.push('', 'Detalle completo en el PDF adjunto.');
  return lines.join('\n');
}

/** Nombre del PDF: ticket_MAD_20261105_1032_OK.pdf */
export function pdfFileName(t: Ticket): string {
  const d = new Date(t.closedAt ?? t.createdAt);
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  const clean = (s: string) => s.normalize('NFD').replace(/[^\w]+/g, '');
  return `ticket_${clean(t.guard.airport) || 'XXX'}_${stamp}_${t.status === 'ok' ? 'OK' : 'FALTAN'}.pdf`;
}

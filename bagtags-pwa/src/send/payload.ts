/**
 * Contenido que se envía al flujo HTTP de Power Automate.
 * El flujo manda un correo a `to` con `subject`, `body` y el PDF adjunto
 * (`attachment.contentBytes` en base64). Ver README → "Envío por email".
 */
import type { Ticket } from '../domain/types';
import { emailBody, emailSubject, fmtClaim, pdfFileName } from '../domain/format';
import { pendingClaims, ticketFlight } from '../domain/ticket';

export interface EmailPayload {
  /** Destinatarios separados por ";" (formato que espera Outlook en Power Automate). */
  to: string;
  subject: string;
  body: string;
  attachment: { name: string; contentType: 'application/pdf'; contentBytes: string };
  /** Datos estructurados por si el flujo quiere guardarlos también en SharePoint. */
  ticket: {
    id: string;
    status: 'ok' | 'missing';
    openedAt: string;
    closedAt: string | null;
    guardId: string;
    airport: string;
    terminal: string;
    post: string;
    flight: string | null;
    claims: number;
    found: number;
    missing: string[];
    negatives: number;
    photos: number;
  };
}

export function buildPayload(t: Ticket, recipients: string[], pdfBase64: string): EmailPayload {
  return {
    to: recipients.join(';'),
    subject: emailSubject(t),
    body: emailBody(t),
    attachment: { name: pdfFileName(t), contentType: 'application/pdf', contentBytes: pdfBase64 },
    ticket: {
      id: t.id,
      status: t.status === 'ok' ? 'ok' : 'missing',
      openedAt: new Date(t.createdAt).toISOString(),
      closedAt: t.closedAt ? new Date(t.closedAt).toISOString() : null,
      guardId: t.guard.guardId,
      airport: t.guard.airport,
      terminal: t.guard.terminal,
      post: t.guard.post,
      flight: ticketFlight(t) ?? null,
      claims: t.claims.length,
      found: t.claims.length - pendingClaims(t).length,
      missing: pendingClaims(t).map(fmtClaim),
      negatives: t.negatives,
      photos: t.photos.length,
    },
  };
}

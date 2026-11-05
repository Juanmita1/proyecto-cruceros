/**
 * Envío del PDF del ticket por correo.
 *
 *  1. Power Automate (si hay URL configurada): POST JSON con el PDF en base64.
 *     Sin red, el ticket queda "pendiente" y se reintenta al recuperar la conexión.
 *  2. Compartir desde el móvil: hoja nativa con el PDF adjunto. Los destinatarios
 *     se copian al portapapeles porque el navegador no puede rellenar el campo "Para".
 */
import type { AppConfig } from '../domain/config';
import type { Ticket } from '../domain/types';
import { emailBody, emailSubject, pdfFileName } from '../domain/format';
import { buildPayload } from './payload';

export async function ticketPdf(t: Ticket): Promise<Blob> {
  const { buildTicketPdf } = await import('../report/pdf');
  return buildTicketPdf(t);
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export function canAutoSend(cfg: AppConfig): boolean {
  return !!cfg.endpoint && cfg.recipients.length > 0;
}

/** Envía al flujo de Power Automate. Lanza un Error con un mensaje legible si falla. */
export async function sendViaPowerAutomate(t: Ticket, cfg: AppConfig): Promise<void> {
  if (!canAutoSend(cfg)) throw new Error('Falta la URL de Power Automate o los destinatarios');
  if (!navigator.onLine) throw new Error('Sin conexión');
  const pdf = await ticketPdf(t);
  const payload = buildPayload(t, cfg.recipients, await blobToBase64(pdf));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Tiempo de espera agotado');
    if (e instanceof TypeError) throw new Error('No se pudo conectar con Power Automate');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Abre la hoja de compartir con el PDF. Devuelve 'shared', 'downloaded' o 'cancelled'. */
export async function shareTicket(t: Ticket, cfg: AppConfig): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([await ticketPdf(t)], pdfFileName(t), { type: 'application/pdf' });
  const to = cfg.recipients.join(', ');
  if (to) {
    try {
      await navigator.clipboard?.writeText(to);
    } catch {
      /* sin permiso de portapapeles */
    }
  }
  const text = `${to ? `Para: ${to}\n\n` : ''}${emailBody(t)}`;
  let canShare = false;
  try {
    canShare = !!navigator.canShare?.({ files: [file] });
  } catch {
    canShare = false;
  }
  if (canShare) {
    try {
      await navigator.share({ files: [file], title: emailSubject(t), text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  // Escritorio / navegadores sin compartir archivos: descarga + correo con los destinatarios.
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  if (to) location.href = `mailto:${encodeURIComponent(cfg.recipients.join(','))}?subject=${encodeURIComponent(emailSubject(t))}&body=${encodeURIComponent(emailBody(t) + '\n\n(Adjunte el PDF descargado)')}`;
  return 'downloaded';
}

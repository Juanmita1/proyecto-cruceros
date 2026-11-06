/**
 * PDF de un ticket (jsPDF, cargado bajo demanda): resultado, vigilante y puesto,
 * pasajero (si se leyó el BCBP y se marcó incluirlo), maletas recogidas y no
 * aparecidas, observaciones y fotos.
 */
import type { Ticket } from '../domain/types';
import { fmtClaim, fmtClaimAlpha, fmtDate, fmtTime, statusLabel } from '../domain/format';
import { pendingClaims, ticketFlight } from '../domain/ticket';
import { blobToDataUrl } from '../ui/photo';

export async function buildTicketPdf(t: Ticket): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 15;
  let y = 0;

  const ensure = (h: number) => {
    if (y + h > 297 - M) {
      doc.addPage();
      y = M;
    }
  };
  const h2 = (s: string) => {
    ensure(12);
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(0).text(s, M, y);
    y += 2;
    doc.setDrawColor(190).line(M, y, W - M, y);
    y += 6;
  };
  const kv = (rows: [string, string][]) => {
    doc.setFontSize(10);
    for (const [k, v] of rows) {
      ensure(6);
      doc.setFont('helvetica', 'normal').setTextColor(80).text(k, M, y);
      doc.setFont('helvetica', 'bold').setTextColor(0).text(v, M + 45, y);
      y += 5.5;
    }
    y += 3;
  };

  // Banda de resultado
  const ok = t.status === 'ok';
  doc.setFillColor(...((ok ? [0, 150, 70] : [230, 120, 0]) as [number, number, number])).rect(0, 0, W, 34, 'F');
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(24).text(statusLabel(t), M, 17);
  doc.setFont('helvetica', 'normal').setFontSize(10).text(`Bagtags Aerovalue - ticket de control de equipaje en cinta - ${fmtDate(t.closedAt ?? t.createdAt)} ${fmtTime(t.closedAt ?? t.createdAt)}`, M, 27);
  y = 44;

  h2('Control');
  kv([
    ['Vigilante', t.guard.guardId],
    ['Aeropuerto / terminal', `${t.guard.airport} ${t.guard.terminal}`.trim()],
    ['Puesto', t.guard.post || '-'],
    ['Vuelo', ticketFlight(t) ?? '-'],
    ['Apertura', `${fmtDate(t.createdAt)} ${fmtTime(t.createdAt, true)}`],
    ['Inicio vigilancia cinta', t.beltAt ? fmtTime(t.beltAt, true) : '-'],
    ['Cierre', t.closedAt ? fmtTime(t.closedAt, true) : '-'],
  ]);

  if (t.passenger && t.includePassenger) {
    const p = t.passenger;
    h2('Pasajero (tarjeta de embarque)');
    kv([
      ['Nombre', p.name],
      ['PNR', p.pnr || '-'],
      ['Ruta', `${p.from} - ${p.to}`],
      ['Fecha del vuelo', p.date ?? '-'],
      ['Asiento', p.seat ?? '-'],
    ]);
  }

  const missing = pendingClaims(t);
  h2(`Maletas del pasajero: ${t.claims.length - missing.length} de ${t.claims.length} recogidas`);
  doc.setFontSize(10);
  for (const c of t.claims) {
    ensure(7);
    doc.setFont('courier', 'bold').setTextColor(0).text(fmtClaim(c), M, y);
    doc.setFont('helvetica', 'normal').text(fmtClaimAlpha(c), M + 45, y);
    if (c.foundAt) {
      doc.setTextColor(0, 120, 50).setFont('helvetica', 'bold').text(`RECOGIDA ${fmtTime(c.foundAt, true)}${c.manual ? ' (validacion manual)' : ''}`, M + 80, y);
    } else {
      doc.setTextColor(200, 90, 0).setFont('helvetica', 'bold').text('NO APARECIDA', M + 80, y);
    }
    y += 6.5;
  }
  doc.setTextColor(0);
  y += 2;
  ensure(8);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(80).text('Maletas de otros pasajeros descartadas en cinta:', M, y);
  doc.setFont('helvetica', 'bold').setTextColor(0).text(String(t.negatives), M + 82, y);
  y += 9;

  if (t.notes.trim()) {
    h2('Observaciones');
    doc.setFont('helvetica', 'normal').setFontSize(10);
    for (const line of doc.splitTextToSize(t.notes.trim(), W - 2 * M) as string[]) {
      ensure(5);
      doc.text(line, M, y);
      y += 5;
    }
    y += 3;
  }

  if (t.photos.length) {
    h2(`Fotos (${t.photos.length})`);
    const pw = (W - 2 * M - 6) / 2;
    for (let k = 0; k < t.photos.length; k += 2) {
      const row = t.photos.slice(k, k + 2);
      const h = Math.min(110, Math.max(...row.map((p) => (pw * p.height) / p.width)));
      ensure(h + 4);
      for (const [j, p] of row.entries()) {
        const w = Math.min(pw, (h * p.width) / p.height);
        doc.addImage(await blobToDataUrl(p.blob), 'JPEG', M + j * (pw + 6), y, w, (w * p.height) / p.width);
      }
      y += h + 4;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8).setTextColor(120).text(`Bagtags Aerovalue - documento interno. Ticket ${t.id.slice(0, 8)} - pagina ${p}/${pages}`, W / 2, 290, { align: 'center' });
  }
  return doc.output('blob');
}

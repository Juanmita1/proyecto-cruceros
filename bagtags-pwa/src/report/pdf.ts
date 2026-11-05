/**
 * Informe PDF del turno (jsPDF, cargado bajo demanda para no penalizar el arranque).
 * Incluye resumen, distribución por hora y vuelo, y el detalle de las
 * incidencias con sus fotos.
 */
import type { ControlRecord, Incident, Shift } from '../domain/types';
import { fmtDate, fmtTime, summarize } from '../domain/report';
import { blobToDataUrl } from '../ui/photo';

export async function buildPdf(shift: Shift, controls: ControlRecord[], incidents: Incident[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 15;
  let y = M;
  const s = summarize(controls, incidents);

  const ensure = (h: number) => {
    if (y + h > 297 - M) {
      doc.addPage();
      y = M;
    }
  };
  const h1 = (t: string) => {
    ensure(12);
    doc.setFont('helvetica', 'bold').setFontSize(13).text(t, M, y);
    y += 2;
    doc.setDrawColor(180).line(M, y, W - M, y);
    y += 6;
  };
  const kv = (rows: [string, string | number][], colW = 70) => {
    doc.setFontSize(10);
    for (const [k, v] of rows) {
      ensure(6);
      doc.setFont('helvetica', 'normal').text(k, M, y);
      doc.setFont('helvetica', 'bold').text(String(v), M + colW, y);
      y += 5.5;
    }
    y += 2;
  };

  // Cabecera
  doc.setFillColor(20, 30, 45).rect(0, 0, W, 26, 'F');
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(16).text('Informe de control de equipajes', M, 12);
  doc.setFont('helvetica', 'normal').setFontSize(10).text('Salida de recogida de equipajes - Lector de Bagtags', M, 19);
  doc.setTextColor(0);
  y = 34;

  h1('Turno');
  kv([
    ['Vigilante', shift.guardId],
    ['Aeropuerto / terminal', `${shift.airport} ${shift.terminal}`],
    ['Puesto', shift.post],
    ['Inicio', `${fmtDate(shift.startedAt)} ${fmtTime(shift.startedAt, false)}`],
    ['Fin', shift.endedAt ? `${fmtDate(shift.endedAt)} ${fmtTime(shift.endedAt, false)}` : 'Turno en curso'],
    ['Vuelos controlados', shift.flights.join(', ') || '-'],
  ]);

  h1('Resumen');
  kv([
    ['Controles totales', s.total],
    ['Correctos', `${s.correct}  (incompletos confirmados: ${s.incompleteConfirmed})`],
    ['No coincide', s.mismatch],
    ['Incompletos sin confirmar', s.incomplete],
    ['Ya controladas (repetidas)', s.already],
    ['Maletas verificadas', s.bags],
    ['Validaciones manuales', s.manualValidations],
    ['Controles con entrada manual', s.manualEntries],
    ['Incidencias', s.incidents],
    ['Tiempo mediano por pasajero (correctos)', s.medianDurationMs != null ? `${(s.medianDurationMs / 1000).toFixed(1)} s` : '-'],
  ]);

  if (s.incidentsByType.length) {
    h1('Incidencias por tipo');
    kv(s.incidentsByType, 120);
  }
  if (s.incidentsByAction.length) {
    h1('Incidencias por acción tomada');
    kv(s.incidentsByAction, 120);
  }

  if (s.perHour.length) {
    h1('Controles por hora');
    const max = Math.max(...s.perHour.map((r) => r[1]));
    doc.setFontSize(10);
    for (const [h, n] of s.perHour) {
      ensure(6);
      doc.setFont('helvetica', 'normal').text(h, M, y);
      doc.setFillColor(40, 110, 200).rect(M + 18, y - 3.5, Math.max(1, (n / max) * 130), 4, 'F');
      doc.text(String(n), M + 152, y);
      y += 5.5;
    }
    y += 2;
  }
  if (s.perFlight.length) {
    h1('Controles por vuelo');
    kv(s.perFlight, 60);
  }

  // Detalle de incidencias
  if (incidents.length) {
    doc.addPage();
    y = M;
    h1(`Detalle de incidencias (${incidents.length})`);
    for (const [n, i] of [...incidents].sort((a, b) => a.ts - b.ts).entries()) {
      ensure(30);
      doc.setFont('helvetica', 'bold').setFontSize(11).text(`${n + 1}. ${i.type}`, M, y);
      doc.setFont('helvetica', 'normal').setFontSize(10).text(`${fmtDate(i.ts)} ${fmtTime(i.ts)}`, W - M, y, { align: 'right' });
      y += 6;
      const lines: string[] = [
        `Acción: ${i.action || '-'}`,
        `Vuelo: ${i.flight ?? i.passenger?.flight ?? '-'}`,
        `Resguardos: ${i.claims.join(', ') || '-'}`,
        `Maletas: ${i.bags.join(', ') || '-'}`,
      ];
      if (i.passenger) lines.push(`Pasajero: ${i.passenger.name} - PNR ${i.passenger.pnr} - ${i.passenger.from}-${i.passenger.to} ${i.passenger.date ?? ''}`);
      if (i.notes) lines.push(`Observaciones: ${i.notes}`);
      for (const l of lines) {
        for (const part of doc.splitTextToSize(l, W - 2 * M) as string[]) {
          ensure(5);
          doc.text(part, M, y);
          y += 5;
        }
      }
      // Fotos: 2 por fila
      const pw = (W - 2 * M - 6) / 2;
      for (let k = 0; k < i.photos.length; k += 2) {
        const row = i.photos.slice(k, k + 2);
        const ph = Math.max(...row.map((p) => (pw * p.height) / p.width));
        const h = Math.min(ph, 110);
        ensure(h + 4);
        for (const [j, p] of row.entries()) {
          const data = await blobToDataUrl(p.blob);
          const w = Math.min(pw, (h * p.width) / p.height);
          doc.addImage(data, 'JPEG', M + j * (pw + 6), y, w, (w * p.height) / p.width);
        }
        y += h + 4;
      }
      y += 4;
      doc.setDrawColor(220).line(M, y - 3, W - M, y - 3);
    }
  }

  // Pie con numeración
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8).setTextColor(120).text(`Documento interno - contiene datos personales solo en incidencias. Página ${p}/${pages}`, W / 2, 290, { align: 'center' });
  }
  return doc.output('blob');
}

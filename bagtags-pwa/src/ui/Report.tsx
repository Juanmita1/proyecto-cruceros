/** Resumen del turno, exportación CSV/PDF, compartir y borrado tras exportar. */
import { useEffect, useState } from 'preact/hooks';
import { navigate, requestPin, setState, toast, useApp } from '../app/store';
import * as A from '../app/actions';
import { buildCsv, fmtDate, fmtTime, reportBaseName, summarize, RESULT_LABEL } from '../domain/report';
import type { ControlRecord, Incident } from '../domain/types';
import { controlsOf, incidentsOf } from '../storage/db';
import { shareOrDownload, download } from '../report/share';

export function Report() {
  const { shift, config } = useApp();
  const [controls, setControls] = useState<ControlRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [busy, setBusy] = useState('');
  const [exported, setExported] = useState(false);

  useEffect(() => {
    if (!shift) return;
    void Promise.all([controlsOf(shift.id), incidentsOf(shift.id)]).then(([c, i]) => {
      setControls(c.sort((a, b) => b.ts - a.ts));
      setIncidents(i.sort((a, b) => b.ts - a.ts));
    });
  }, [shift?.id]);

  if (!shift) {
    return (
      <div class="screen">
        <p class="pad">No hay turno.</p>
        <button class="btn" onClick={() => navigate({ name: 'start' })}>
          Inicio
        </button>
      </div>
    );
  }

  const s = summarize(controls, incidents);
  const base = reportBaseName(shift);
  const ended = !!shift.endedAt;

  const makeCsv = () => new File([buildCsv(shift, controls, incidents, config.csvLpnFormat)], `${base}.csv`, { type: 'text/csv;charset=utf-8' });
  const makePdf = async () => {
    const { buildPdf } = await import('../report/pdf');
    return new File([await buildPdf(shift, controls, incidents)], `${base}.pdf`, { type: 'application/pdf' });
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      setExported(true);
    } catch (e) {
      toast(`Error al generar el informe: ${e}`, 'error', 5000);
    } finally {
      setBusy('');
    }
  };

  const del = async () => {
    if (!(await requestPin('Borrar los datos del turno'))) return;
    await A.deleteShift(shift.id);
    toast('Datos del turno borrados', 'ok');
  };

  const maxHour = Math.max(1, ...s.perHour.map((r) => r[1]));

  return (
    <div class="screen screen--form">
      <header class="topbar">
        {!ended && (
          <button class="iconbtn" onClick={() => navigate({ name: 'control' })} aria-label="Volver">
            ←
          </button>
        )}
        <div class="topbar__title">
          <strong>{ended ? 'Informe final del turno' : 'Resumen del turno (en curso)'}</strong>
          <span>
            {shift.post} · {fmtDate(shift.startedAt)} {fmtTime(shift.startedAt, false)}
            {shift.endedAt ? `–${fmtTime(shift.endedAt, false)}` : ''}
          </span>
        </div>
      </header>

      <div class="form">
        <div class="kpis">
          <Kpi label="Controles" value={s.total} />
          <Kpi label="Correctos" value={s.correct} cls="ok" />
          <Kpi label="No coincide" value={s.mismatch} cls="bad" />
          <Kpi label="Incidencias" value={s.incidents} cls="warn" />
          <Kpi label="Validaciones manuales" value={s.manualValidations} />
          <Kpi label="Ya controladas" value={s.already} />
        </div>
        <p class="muted">
          Maletas verificadas: {s.bags} · Incompletos sin confirmar: {s.incomplete} · Entrada manual: {s.manualEntries}
          {s.medianDurationMs != null && ` · Tiempo mediano: ${(s.medianDurationMs / 1000).toFixed(1)} s`}
        </p>

        {s.incidentsByType.length > 0 && (
          <section>
            <h3>Incidencias por tipo</h3>
            <table class="table">
              <tbody>
                {s.incidentsByType.map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td class="num">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {s.perHour.length > 0 && (
          <section>
            <h3>Controles por hora</h3>
            <div class="bars">
              {s.perHour.map(([h, n]) => (
                <div class="bar" key={h}>
                  <span>{h}</span>
                  <div class="bar__track">
                    <div class="bar__fill" style={{ width: `${(n / maxHour) * 100}%` }} />
                  </div>
                  <span class="num">{n}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {s.perFlight.length > 0 && (
          <section>
            <h3>Controles por vuelo</h3>
            <table class="table">
              <tbody>
                {s.perFlight.map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td class="num">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {incidents.length > 0 && (
          <section>
            <h3>Incidencias</h3>
            <ul class="list">
              {incidents.map((i) => (
                <li key={i.id}>
                  <button class="list__item" onClick={() => navigate({ name: 'incident', incidentId: i.id })}>
                    <strong>
                      {fmtTime(i.ts, false)} · {i.type}
                    </strong>
                    <span>
                      {i.action || 'Sin acción'} · {i.bags.join(', ') || i.claims.join(', ') || '—'} {i.photos.length ? `· 📷${i.photos.length}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {controls.length > 0 && (
          <details>
            <summary>Últimos controles ({controls.length})</summary>
            <ul class="list">
              {controls.slice(0, 50).map((c) => (
                <li key={c.id} class="list__row">
                  <span>{fmtTime(c.ts)}</span>
                  <span class={`tag tag--${c.result}`}>{RESULT_LABEL[c.result]}</span>
                  <span class="muted">{c.bags.map((b) => b.id).join(' ')}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <footer class="actions">
        <button
          class="btn btn--xl btn--primary"
          disabled={!!busy}
          onClick={() =>
            run('share', async () => {
              const r = await shareOrDownload([makeCsv(), await makePdf()], `Informe ${shift.post} ${fmtDate(shift.startedAt)}`);
              if (r === 'cancelled') throw new Error('cancelado');
            })
          }
        >
          {busy === 'share' ? 'Generando…' : '📤 COMPARTIR INFORME (CSV + PDF)'}
        </button>
        <div class="row">
          <button class="btn" disabled={!!busy} onClick={() => run('csv', async () => download(makeCsv()))}>
            ⬇ CSV
          </button>
          <button class="btn" disabled={!!busy} onClick={() => run('pdf', async () => download(await makePdf()))}>
            {busy === 'pdf' ? '…' : '⬇ PDF'}
          </button>
        </div>
        {ended ? (
          <>
            {exported && <p class="notice">Informe exportado. ¿Desea borrar ahora los datos del turno de este dispositivo?</p>}
            <div class="row">
              <button class={`btn ${exported ? 'btn--bad' : ''}`} onClick={del}>
                🗑 Borrar datos del turno
              </button>
              <button
                class="btn"
                onClick={() => {
                  setState({ shift: null });
                  navigate({ name: 'start' });
                }}
              >
                Nuevo turno
              </button>
            </div>
          </>
        ) : (
          <button
            class="btn btn--warn"
            onClick={() => {
              if (confirm('¿Cerrar el turno?')) void A.endShift();
            }}
          >
            ⏹ Cerrar turno
          </button>
        )}
      </footer>
    </div>
  );
}

function Kpi({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <div class={`kpi ${cls ? 'kpi--' + cls : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

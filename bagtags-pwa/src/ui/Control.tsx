/**
 * Pantalla principal: control en la salida.
 *   Paso 1 — resguardos (claim tags) de la tarjeta de embarque (+ BCBP opcional)
 *   Paso 2 — etiquetas de las maletas
 *   Resultado a pantalla completa.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ReadConfirmer } from '../domain/confirm';
import { LINEAR_FORMATS } from '../domain/classify';
import { formatAlpha, formatTag } from '../domain/lpn';
import { pendingClaims } from '../domain/matcher';
import { camera } from '../scanner/camera';
import { navigate, useApp } from '../app/store';
import * as A from '../app/actions';
import { ScannerView } from './ScannerView';
import { ManualEntry } from './ManualEntry';
import { KeyboardWedge } from './KeyboardWedge';
import { ResultOverlay } from './ResultOverlay';
import { unlockAudio } from '../feedback';
import { DemoDrawer } from './Demo';

export function Control() {
  const s = useApp();
  const { pass, config, shift, counters } = s;
  const [manual, setManual] = useState(false);
  const [menu, setMenu] = useState(false);

  const confirmer = useMemo(() => new ReadConfirmer({ required: 2, windowMs: 1200, holdMs: 1500 }), []);

  // Lecturas de cámara → doble lectura para lineales → flujo.
  useEffect(
    () =>
      camera.onDetect((dets) => {
        const now = performance.now();
        for (const d of dets) {
          const required = config.doubleRead && LINEAR_FORMATS.has(d.format) ? 2 : 1;
          if (confirmer.push(d.text, now, required)) A.handleInput(d.text, d.format === 'demo' ? 'demo' : 'camera');
        }
      }),
    [config.doubleRead],
  );

  const overlay = !!pass.outcome || pass.pendingPartial !== undefined || manual || menu;
  useEffect(() => camera.setPaused(overlay), [overlay]);
  useEffect(() => () => camera.setPaused(false), []);

  if (!shift) return null;

  const pending = pendingClaims(pass.claims, pass.bags);
  const stepClaims = pass.step === 'claims';
  const flights = shift.flights;
  const leg = pass.bcbp?.legs[0];

  return (
    <div class="screen screen--control" onPointerDown={unlockAudio}>
      <header class="topbar">
        <button class="iconbtn" onClick={() => setMenu(true)} aria-label="Menú">
          ☰
        </button>
        <div class="topbar__title">
          <strong>{shift.post}</strong>
          <span>
            {shift.airport} {shift.terminal} · {shift.guardId}
          </span>
        </div>
        <div class="topbar__counters" aria-label="Contadores del turno">
          <span title="Controles">✔ {counters.controls}</span>
          <span title="Incidencias">⚠ {counters.incidents}</span>
        </div>
      </header>

      <ScannerView
        hint={stepClaims ? '1 · Enfoque el RESGUARDO de la tarjeta de embarque' : '2 · Enfoque la ETIQUETA de la maleta'}
        onManual={() => setManual(true)}
      />

      {flights.length > 1 && (
        <div class="flights" role="radiogroup" aria-label="Vuelo">
          {flights.map((f) => (
            <button key={f} class={`chipbtn ${s.currentFlight === f ? 'chipbtn--on' : ''}`} onClick={() => A.setCurrentFlight(s.currentFlight === f ? undefined : f)}>
              {f}
            </button>
          ))}
        </div>
      )}

      <section class="steps">
        <div class={`step ${stepClaims ? 'step--active' : 'step--done'}`}>
          <div class="step__head">
            <span class="step__num">1</span>
            <span class="step__label">
              Resguardos: <strong>{pass.claims.length}</strong> {pass.claims.length === 1 ? 'leído' : 'leídos'}
            </span>
            {leg && <span class="badge">✈ {leg.flight}</span>}
          </div>
          <ul class="codes">
            {pass.claims.map((c, i) => {
              const used = !pending.includes(c);
              return (
                <li key={c.key} class={`code ${used ? 'code--ok' : ''}`}>
                  <span class="code__lpn">{formatTag(c)}</span>
                  <span class="code__alpha">{formatAlpha(c)}</span>
                  {stepClaims && (
                    <button class="code__x" onClick={() => A.removeClaim(i)} aria-label="Quitar">
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {!stepClaims && (
          <div class="step step--active">
            <div class="step__head">
              <span class="step__num">2</span>
              <span class="step__label">
                Maletas: <strong>{pass.bags.filter((b) => b.status === 'match' || b.status === 'manual').length}</strong> / {pass.claims.length}
              </span>
            </div>
            <ul class="codes">
              {pass.bags.map((b, i) => (
                <li key={b.code.key} class={`code code--${b.status}`}>
                  <span class="code__lpn">{formatTag(b.code)}</span>
                  <span class="code__alpha">
                    {b.status === 'match' ? '✔' : b.status === 'manual' ? '✔ manual' : b.status === 'nomatch' ? '✖' : b.status === 'already' ? '⟲' : '?'}
                  </span>
                  <button class="code__x" onClick={() => A.removeBag(i)} aria-label="Quitar">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <footer class="actions">
        {stepClaims ? (
          <>
            <button class="btn btn--xl btn--primary" disabled={pass.claims.length === 0} onClick={A.goToBags}>
              MALETAS →
            </button>
            <div class="row">
              <button class="btn" onClick={() => setManual(true)}>
                ⌨ Manual
              </button>
              <button class="btn btn--warn" onClick={() => A.openIncident(config.incidentTypes[1])}>
                Sin resguardo
              </button>
              <button class="btn" onClick={() => A.openIncident()} aria-label="Nueva incidencia">
                ⚠
              </button>
            </div>
          </>
        ) : (
          <>
            <button class="btn btn--xl btn--primary" disabled={pass.bags.length === 0} onClick={() => A.finish()}>
              FINALIZAR
            </button>
            <div class="row">
              <button class="btn" onClick={() => setManual(true)}>
                ⌨ Manual
              </button>
              <button class="btn" onClick={A.nextPassenger}>
                ↺ Reiniciar
              </button>
              <button class="btn" onClick={() => A.openIncident()} aria-label="Nueva incidencia">
                ⚠
              </button>
            </div>
          </>
        )}
      </footer>

      <KeyboardWedge active={!overlay} onScan={(t) => A.handleInput(t, 'keyboard')} />

      {manual && (
        <ManualEntry
          title={stepClaims ? 'Resguardo (tarjeta de embarque)' : 'Etiqueta de maleta'}
          onSubmit={(raw) => {
            const ok = A.handleInput(raw, 'manual');
            if (ok && !stepClaims) setManual(false);
            return ok;
          }}
          onClose={() => setManual(false)}
        />
      )}

      {s.demoSim && !overlay && <DemoDrawer />}
      {pass.pendingPartial !== undefined && <PartialConfirm />}
      {pass.outcome && <ResultOverlay />}
      {menu && <Menu onClose={() => setMenu(false)} />}
    </div>
  );
}

/** Coincidencia parcial: el vigilante compara visualmente y decide. */
function PartialConfirm() {
  const { pass } = useApp();
  const bag = pass.bags[pass.pendingPartial!];
  const claim = bag.claimIndex !== undefined ? pass.claims[bag.claimIndex] : undefined;
  return (
    <div class="result result--partial" role="alertdialog" aria-label="Coincidencia parcial">
      <div class="result__icon">?</div>
      <h1 class="result__title">COMPROBAR</h1>
      <p class="result__sub">Coinciden aerolínea y serie, pero no el código completo. Compare visualmente la etiqueta y el resguardo.</p>
      <div class="compare">
        <div>
          <small>Resguardo</small>
          <strong>{claim ? formatTag(claim) : '—'}</strong>
        </div>
        <div>
          <small>Maleta</small>
          <strong>{formatTag(bag.code)}</strong>
        </div>
      </div>
      <div class="result__actions">
        <button class="btn btn--xl btn--ok" onClick={() => A.resolvePartial(true)}>
          ✔ SÍ COINCIDE (validación manual)
        </button>
        <button class="btn btn--xl btn--bad" onClick={() => A.resolvePartial(false)}>
          ✖ NO COINCIDE
        </button>
      </div>
    </div>
  );
}

function Menu({ onClose }: { onClose: () => void }) {
  const go = (r: Parameters<typeof navigate>[0]) => {
    onClose();
    navigate(r);
  };
  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Menú">
      <div class="sheet__head">
        <h2>Menú</h2>
        <button class="iconbtn" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>
      <div class="menu">
        <button class="btn btn--lg" onClick={() => go({ name: 'report' })}>
          📊 Resumen e informe del turno
        </button>
        <button class="btn btn--lg" onClick={() => go({ name: 'incident' })}>
          ⚠ Nueva incidencia
        </button>
        <button class="btn btn--lg" onClick={() => go({ name: 'demo' })}>
          🧪 Modo demostración
        </button>
        <button class="btn btn--lg" onClick={() => go({ name: 'settings' })}>
          ⚙ Configuración (PIN)
        </button>
        <button class="btn btn--lg" onClick={() => go({ name: 'help' })}>
          ❓ Ayuda e instalación
        </button>
        <button
          class="btn btn--lg btn--warn"
          onClick={() => {
            if (confirm('¿Cerrar el turno? Se generará el informe final.')) {
              onClose();
              void A.endShift();
            }
          }}
        >
          ⏹ Cerrar turno
        </button>
      </div>
    </div>
  );
}

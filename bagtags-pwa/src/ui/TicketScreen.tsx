/**
 * Ticket en curso.
 *   Paso 1 — RESGUARDOS: se escanean los resguardos del pasajero (y opcionalmente su tarjeta de embarque).
 *   Paso 2 — CINTA: cada maleta que pasa da un aviso inmediato (NO ES SUYA / ¡ES SUYA!).
 *            La cámara sigue leyendo durante los avisos: no hay que tocar nada entre maleta y maleta.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ReadConfirmer } from '../domain/confirm';
import { LINEAR_FORMATS } from '../domain/classify';
import { fmtClaim, fmtClaimAlpha, fmtTime } from '../domain/format';
import { pendingClaims, ticketFlight } from '../domain/ticket';
import { camera } from '../scanner/camera';
import { navigate, useApp } from '../app/store';
import * as A from '../app/actions';
import { ScannerView } from './ScannerView';
import { ManualEntry } from './ManualEntry';
import { KeyboardWedge } from './KeyboardWedge';
import { DemoDrawer } from './Demo';
import { unlockAudio } from '../feedback';

/** Duración de cada aviso en pantalla (ms). El negativo es corto: en la cinta pasan muchas maletas. */
const FLASH_MS = { nomatch: 1200, match: 3000, repeat: 1800, allfound: 2500 } as const;

export function TicketScreen() {
  const s = useApp();
  const { ticket: t, step, flash, partial, config } = s;
  const [manual, setManual] = useState(false);
  const [menu, setMenu] = useState(false);
  const confirmer = useMemo(() => new ReadConfirmer({ required: 2, windowMs: 1200, holdMs: 1500 }), []);

  useEffect(
    () =>
      camera.onDetect((dets) => {
        const now = performance.now();
        for (const d of dets) {
          const required = config.doubleRead && LINEAR_FORMATS.has(d.format) ? 2 : 1;
          if (confirmer.push(d.text, now, required)) A.handleInput(d.text, 'camera');
        }
      }),
    [config.doubleRead],
  );

  // Los avisos de la cinta desaparecen solos.
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => A.clearFlash(flash.seq), FLASH_MS[flash.kind]);
    return () => clearTimeout(id);
  }, [flash?.seq]);

  const blocking = manual || menu || !!partial;
  useEffect(() => camera.setPaused(blocking), [blocking]);
  useEffect(() => () => camera.setPaused(false), []);

  if (!t) return null;
  const pending = pendingClaims(t);
  const flight = ticketFlight(t);

  return (
    <div class={`screen screen--ticket ${flash ? `flash flash--${flash.kind}` : ''}`} onPointerDown={unlockAudio}>
      <header class="topbar">
        <button class="iconbtn" onClick={() => setMenu(true)} aria-label="Menú">
          ☰
        </button>
        <div class="topbar__title">
          <strong>{step === 'claims' ? '1 · Resguardos del pasajero' : '2 · Vigilando la cinta'}</strong>
          <span>
            {t.guard.guardId} · {t.guard.airport} {t.guard.terminal} {t.guard.post}
            {flight ? ` · ✈ ${flight}` : ''}
          </span>
        </div>
        {s.pendingCount > 0 && (
          <button class="badge badge--warn" onClick={() => navigate({ name: 'history' })} title="Tickets pendientes de envío">
            ✉ {s.pendingCount}
          </button>
        )}
      </header>

      <ScannerView
        compact={step === 'belt'}
        hint={step === 'claims' ? 'Escanee los resguardos de la tarjeta de embarque' : 'Escanee cada maleta que pase por la cinta'}
        onManual={() => setManual(true)}
      />

      {step === 'claims' ? (
        <section class="panel">
          <div class="panel__count">
            <strong>{t.claims.length}</strong> {t.claims.length === 1 ? 'resguardo leído' : 'resguardos leídos'}
          </div>
          {t.passenger && (
            <div class="muted small">
              Tarjeta de embarque: {t.passenger.name} · {t.passenger.flight} {t.passenger.from}→{t.passenger.to}
            </div>
          )}
          <ul class="codes">
            {t.claims.map((c, i) => (
              <li key={c.id} class="code">
                <span class="code__lpn">{fmtClaim(c)}</span>
                <span class="code__alpha">{fmtClaimAlpha(c)}</span>
                <button class="code__x" onClick={() => A.removeClaim(i)} aria-label="Quitar">
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {t.claims.length === 0 && <p class="muted">Enfoque el código de barras del resguardo pegado en la tarjeta de embarque. Puede leer varios seguidos.</p>}
        </section>
      ) : (
        <BeltPanel />
      )}

      <footer class="actions">
        {step === 'claims' ? (
          <>
            <button class="btn btn--xl btn--primary" disabled={t.claims.length === 0} onClick={A.startBelt}>
              VIGILAR CINTA →
            </button>
            <button class="btn" onClick={() => setManual(true)}>
              ⌨ Introducir a mano
            </button>
          </>
        ) : (
          <>
            <button class="btn btn--xl btn--close" onClick={() => A.closeNow()}>
              ⏹ CERRAR TICKET{pending.length ? ` (faltan ${pending.length})` : ''}
            </button>
            <div class="row">
              <button class="btn" onClick={() => setManual(true)}>
                ⌨ Manual
              </button>
              <button class="btn" onClick={A.backToClaims}>
                + Resguardo
              </button>
            </div>
          </>
        )}
      </footer>

      <KeyboardWedge active={!blocking} onScan={(x) => A.handleInput(x, 'keyboard')} />

      {manual && (
        <ManualEntry
          title={step === 'claims' ? 'Resguardo (tarjeta de embarque)' : 'Etiqueta de maleta en la cinta'}
          onSubmit={(raw) => {
            const ok = A.handleInput(raw, 'manual');
            if (ok && step === 'belt') setManual(false);
            return ok;
          }}
          onClose={() => setManual(false)}
        />
      )}
      {partial && <PartialConfirm />}
      {s.demoSim && !blocking && <DemoDrawer />}
      {menu && <Menu onClose={() => setMenu(false)} />}
      <span class="sr-only" aria-live="assertive">
        {flash?.kind === 'match' ? 'Es suya, recoger' : flash?.kind === 'nomatch' ? 'No es suya' : flash?.kind === 'allfound' ? 'Todas recogidas' : ''}
      </span>
    </div>
  );
}

/** Panel de la cinta: aviso grande de la última maleta + estado de las del pasajero. */
function BeltPanel() {
  const { ticket: t, flash } = useApp();
  if (!t) return null;
  const foundN = t.claims.filter((c) => c.foundAt).length;

  let big: preact.JSX.Element;
  if (flash?.kind === 'match') {
    const c = t.claims[flash.claimIndex];
    big = (
      <div class="belt belt--match" role="alert">
        <div class="belt__title">¡ES SUYA!</div>
        <div class="belt__sub">RECOGER</div>
        <div class="belt__code">{fmtClaim(c)}</div>
      </div>
    );
  } else if (flash?.kind === 'allfound') {
    big = (
      <div class="belt belt--match" role="alert">
        <div class="belt__title">✔ TODAS</div>
        <div class="belt__sub">Maletas recogidas · cerrando ticket…</div>
      </div>
    );
  } else if (flash?.kind === 'nomatch') {
    big = (
      <div class="belt belt--nomatch" role="alert">
        <div class="belt__title">✖ NO ES SUYA</div>
        <div class="belt__code">{flash.code}</div>
      </div>
    );
  } else if (flash?.kind === 'repeat') {
    const c = t.claims[flash.claimIndex];
    big = (
      <div class="belt belt--repeat" role="alert">
        <div class="belt__title">YA RECOGIDA</div>
        <div class="belt__code">
          {fmtClaim(c)} · {fmtTime(c.foundAt!)}
        </div>
      </div>
    );
  } else {
    big = (
      <div class="belt belt--idle">
        <div class="belt__count">
          <strong>{foundN}</strong> / {t.claims.length}
        </div>
        <div class="belt__sub">maletas recogidas · {t.negatives} descartadas</div>
      </div>
    );
  }

  return (
    <section class="panel panel--belt">
      {big}
      <ul class="codes">
        {t.claims.map((c) => (
          <li key={c.id} class={`code ${c.foundAt ? 'code--ok' : 'code--pending'}`}>
            <span class="code__lpn">{fmtClaim(c)}</span>
            <span class="code__alpha">{c.foundAt ? `✔ ${fmtTime(c.foundAt)}${c.manual ? ' manual' : ''}` : 'pendiente'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PartialConfirm() {
  const { ticket: t, partial } = useApp();
  if (!t || !partial) return null;
  const c = t.claims[partial.claimIndex];
  return (
    <div class="result result--partial" role="alertdialog" aria-label="Comprobar maleta">
      <div class="result__icon">?</div>
      <h1 class="result__title">¿ES SUYA?</h1>
      <p class="result__sub">Coinciden aerolínea y número de serie, pero no el código completo (etiqueta dañada o de reserva). Compare la etiqueta con el resguardo.</p>
      <div class="compare">
        <div>
          <small>Resguardo</small>
          <strong>{fmtClaim(c)}</strong>
        </div>
        <div>
          <small>Maleta</small>
          <strong>{partial.code}</strong>
        </div>
      </div>
      <div class="result__actions">
        <button class="btn btn--xl btn--ok" onClick={() => A.resolvePartial(true)}>
          ✔ SÍ, ES SUYA
        </button>
        <button class="btn btn--xl btn--bad" onClick={() => A.resolvePartial(false)}>
          ✖ NO ES SUYA
        </button>
      </div>
    </div>
  );
}

function Menu({ onClose }: { onClose: () => void }) {
  const { ticket } = useApp();
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
        <button class="btn btn--lg" onClick={() => go({ name: 'history' })}>
          🗂 Tickets enviados y pendientes
        </button>
        <button class="btn btn--lg" onClick={() => go({ name: 'guard' })}>
          👤 Cambiar datos del vigilante
        </button>
        <button class="btn btn--lg" onClick={() => go({ name: 'demo' })}>
          🧪 Demostración
        </button>
        <button class="btn btn--lg" onClick={() => go({ name: 'settings' })}>
          ⚙ Configuración
        </button>
        <button class="btn btn--lg" onClick={() => go({ name: 'help' })}>
          ❓ Ayuda
        </button>
        {ticket && (ticket.claims.length > 0 || ticket.passenger) && (
          <button
            class="btn btn--lg btn--warn"
            onClick={() => {
              if (confirm('¿Descartar este ticket sin enviarlo?')) {
                onClose();
                void A.discardTicket();
              }
            }}
          >
            🗑 Descartar ticket
          </button>
        )}
      </div>
    </div>
  );
}

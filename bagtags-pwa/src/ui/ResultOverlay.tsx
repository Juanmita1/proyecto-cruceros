/** Resultado a pantalla completa: colores, iconos y textos muy grandes. */
import { useEffect, useState } from 'preact/hooks';
import { formatAlpha, formatTag } from '../domain/lpn';
import { pendingClaims } from '../domain/matcher';
import { fmtTime } from '../domain/report';
import { useApp } from '../app/store';
import * as A from '../app/actions';

export function ResultOverlay() {
  const { pass, config } = useApp();
  const o = pass.outcome!;
  const [left, setLeft] = useState<number | null>(null);

  // Reinicio automático tras CORRECTO; apertura automática de la ficha tras NO COINCIDE.
  useEffect(() => {
    let secs = 0;
    let action: (() => void) | null = null;
    if (o.result === 'ok' && config.autoResetSec > 0) {
      secs = config.autoResetSec;
      action = A.nextPassenger;
    } else if (o.result === 'mismatch' && config.autoOpenIncident && !pass.incidentShown) {
      secs = 2;
      action = () => A.openIncident(config.incidentTypes[0]);
    }
    if (!action) return;
    setLeft(secs);
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const l = secs - Math.floor((Date.now() - t0) / 1000);
      if (l <= 0) {
        clearInterval(id);
        action!();
      } else setLeft(l);
    }, 200);
    return () => clearInterval(id);
  }, [o.result, o.controlId]);

  const nomatch = pass.bags.filter((b) => b.status === 'nomatch');
  const already = pass.bags.filter((b) => b.status === 'already');
  const pending = pendingClaims(pass.claims, pass.bags);
  const manual = pass.bags.some((b) => b.status === 'manual');

  const view = {
    ok: { cls: 'ok', icon: '✔', title: 'CORRECTO', sub: `${pass.bags.length} ${pass.bags.length === 1 ? 'maleta coincide' : 'maletas coinciden'}${manual ? ' · validación manual' : ''}` },
    incomplete_confirmed: { cls: 'ok', icon: '✔', title: 'CORRECTO', sub: 'Incompleto confirmado por el vigilante' },
    mismatch: { cls: 'bad', icon: '✖', title: 'NO COINCIDE', sub: 'Esta maleta no corresponde a ningún resguardo' },
    incomplete: {
      cls: 'warn',
      icon: '!',
      title: 'INCOMPLETO',
      sub: pass.bags.length === 0 ? 'No se ha escaneado ninguna maleta' : `${pending.length} ${pending.length === 1 ? 'resguardo' : 'resguardos'} sin maleta`,
    },
    already: { cls: 'neutral', icon: '⟲', title: 'YA CONTROLADA', sub: 'Esta maleta ya se verificó en este turno' },
  }[o.result];

  return (
    <div class={`result result--${view.cls}`} role="alertdialog" aria-live="assertive" aria-label={view.title}>
      <div class="result__icon" aria-hidden="true">
        {view.icon}
      </div>
      <h1 class="result__title">{view.title}</h1>
      <p class="result__sub">{view.sub}</p>

      {nomatch.length > 0 && (
        <ul class="result__list">
          {nomatch.map((b) => (
            <li key={b.code.key}>
              Maleta <strong>{formatTag(b.code)}</strong> <small>({formatAlpha(b.code)})</small>
            </li>
          ))}
        </ul>
      )}
      {already.length > 0 && (
        <ul class="result__list">
          {already.map((b) => (
            <li key={b.code.key}>
              <strong>{formatTag(b.code)}</strong> controlada a las <strong>{fmtTime(b.alreadyAt!, false)}</strong>
            </li>
          ))}
        </ul>
      )}
      {o.result === 'incomplete' && pending.length > 0 && (
        <ul class="result__list">
          {pending.map((c) => (
            <li key={c.key}>
              Sin maleta: <strong>{formatTag(c)}</strong>
            </li>
          ))}
        </ul>
      )}

      <div class="result__actions">
        {o.result === 'incomplete' && (
          <>
            <button class="btn btn--xl btn--ok" onClick={A.confirmIncomplete}>
              ✔ CONFIRMAR CORRECTO
            </button>
            <div class="row">
              <button class="btn btn--lg" onClick={A.continueScanning}>
                + Escanear otra maleta
              </button>
              <button class="btn btn--lg btn--warn" onClick={() => A.openIncident()}>
                ⚠ Incidencia
              </button>
            </div>
          </>
        )}
        {o.result === 'mismatch' && (
          <button class="btn btn--xl btn--light" onClick={() => A.openIncident(config.incidentTypes[0])}>
            ⚠ REGISTRAR INCIDENCIA{left ? ` (${left})` : ''}
          </button>
        )}
        {o.result === 'already' && (
          <button class="btn btn--lg" onClick={() => A.openIncident()}>
            ⚠ Registrar incidencia
          </button>
        )}
        <button class="btn btn--xl btn--next" onClick={A.nextPassenger}>
          SIGUIENTE PASAJERO{o.result === 'ok' && left ? ` (${left})` : ''}
        </button>
      </div>
    </div>
  );
}

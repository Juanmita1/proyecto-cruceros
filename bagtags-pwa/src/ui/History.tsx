/** Tickets guardados en el dispositivo: estado de envío, reenvío y borrado. */
import { useEffect, useState } from 'preact/hooks';
import { navigate, toast, useApp } from '../app/store';
import * as A from '../app/actions';
import type { Ticket } from '../domain/types';
import { fmtClaim, fmtDate, fmtTime, statusLabel } from '../domain/format';
import { pendingClaims, ticketFlight } from '../domain/ticket';
import { getTicket, listTickets } from '../storage/db';
import { canAutoSend } from '../send/send';

const SEND_LABEL: Record<Ticket['send']['status'], string> = {
  none: 'Sin enviar',
  pending: '✉ En cola',
  failed: '⚠ Error de envío',
  sent: '✔ Enviado',
  shared: '📤 Compartido',
};

const back = () => navigate({ name: 'ticket' });

export function History() {
  const { pendingCount, online, config } = useApp();
  const [list, setList] = useState<Ticket[]>([]);
  const reload = () => listTickets().then((l) => setList(l.filter((t) => t.status !== 'open')));
  useEffect(() => void reload(), [pendingCount]);

  return (
    <div class="screen screen--form">
      <header class="topbar">
        <button class="iconbtn" onClick={back} aria-label="Volver">
          ←
        </button>
        <div class="topbar__title">
          <strong>Tickets</strong>
          <span>
            {list.length} en el dispositivo · {pendingCount} pendientes de envío
          </span>
        </div>
      </header>
      <div class="form">
        {pendingCount > 0 && (
          <button
            class="btn btn--lg btn--primary"
            disabled={!online || !canAutoSend(config)}
            onClick={async () => {
              await A.processQueue();
              void reload();
            }}
          >
            {!canAutoSend(config) ? 'Configure Power Automate para enviar la cola' : online ? '✉ Reintentar envíos pendientes' : 'Sin conexión'}
          </button>
        )}
        {list.length === 0 && <p class="muted">Todavía no hay tickets cerrados.</p>}
        <ul class="list">
          {list.map((t) => (
            <li key={t.id}>
              <button class="list__item" onClick={() => navigate({ name: 'view', ticketId: t.id })}>
                <strong>
                  <span class={`tag tag--${t.status}`}>{statusLabel(t)}</span> {fmtDate(t.closedAt ?? t.createdAt)} {fmtTime(t.closedAt ?? t.createdAt)}
                </strong>
                <span>
                  {ticketFlight(t) ?? 'Sin vuelo'} · {t.claims.length} maleta(s) · {SEND_LABEL[t.send.status]}
                  {t.send.error && t.send.status !== 'sent' ? ` (${t.send.error})` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ViewTicket({ ticketId }: { ticketId: string }) {
  const { config } = useApp();
  const [t, setT] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = () => getTicket(ticketId).then((x) => setT(x ?? null));
  useEffect(() => void reload(), [ticketId]);
  if (!t) return <div class="screen" />;
  const missing = pendingClaims(t);

  return (
    <div class="screen screen--form">
      <header class="topbar">
        <button class="iconbtn" onClick={() => navigate({ name: 'history' })} aria-label="Volver">
          ←
        </button>
        <div class="topbar__title">
          <strong>{statusLabel(t)}</strong>
          <span>
            {fmtDate(t.closedAt ?? t.createdAt)} {fmtTime(t.closedAt ?? t.createdAt)} · {SEND_LABEL[t.send.status]}
          </span>
        </div>
      </header>
      <div class="form">
        <div class="card">
          <div>
            {t.guard.guardId} · {t.guard.airport} {t.guard.terminal} {t.guard.post}
          </div>
          <div>Vuelo: {ticketFlight(t) ?? '—'}</div>
          {t.passenger && t.includePassenger && <div>Pasajero: {t.passenger.name}</div>}
          <div>
            Recogidas {t.claims.length - missing.length}/{t.claims.length} · descartadas {t.negatives} · fotos {t.photos.length}
          </div>
          {t.notes && <div>Observaciones: {t.notes}</div>}
        </div>
        <ul class="codes">
          {t.claims.map((c) => (
            <li key={c.id} class={`code ${c.foundAt ? 'code--ok' : 'code--missing'}`}>
              <span class="code__lpn">{fmtClaim(c)}</span>
              <span class="code__alpha">{c.foundAt ? `✔ ${fmtTime(c.foundAt)}` : '✖ no aparecida'}</span>
            </li>
          ))}
        </ul>
      </div>
      <footer class="actions">
        {canAutoSend(config) && (
          <button
            class="btn btn--lg btn--primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await A.sendTicket(t);
              setBusy(false);
              toast(r === 'sent' ? 'Enviado' : 'No se pudo enviar: queda en cola', r === 'sent' ? 'ok' : 'warn');
              void reload();
            }}
          >
            ✉ {t.send.status === 'sent' ? 'Reenviar' : 'Enviar'} por email
          </button>
        )}
        <div class="row">
          <button
            class="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await A.shareViaPhone(t);
              setBusy(false);
              void reload();
            }}
          >
            📤 Compartir PDF
          </button>
          <button
            class="btn btn--bad"
            onClick={async () => {
              if (!confirm(t.send.status === 'sent' || t.send.status === 'shared' ? '¿Borrar este ticket del dispositivo?' : 'Este ticket NO se ha enviado. ¿Borrarlo igualmente?')) return;
              await A.deleteTicketById(t.id);
              navigate({ name: 'history' });
            }}
          >
            🗑 Borrar
          </button>
        </div>
      </footer>
    </div>
  );
}

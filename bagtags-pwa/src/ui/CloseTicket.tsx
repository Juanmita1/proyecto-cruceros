/**
 * Cierre del ticket: TODO OK o FALTAN maletas, observaciones, fotos y envío
 * del PDF a los destinatarios configurados.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { getState, toast, useApp } from '../app/store';
import * as A from '../app/actions';
import { fmtClaim, fmtClaimAlpha, fmtTime, statusLabel } from '../domain/format';
import { pendingClaims, ticketFlight } from '../domain/ticket';
import { canAutoSend } from '../send/send';
import { uid } from '../storage/db';
import { compressPhoto } from './photo';

export function CloseTicket() {
  const { ticket: t, config, online } = useApp();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | 'sent' | 'queued' | 'shared'>(null);

  const photoUrls = useMemo(() => (t?.photos ?? []).map((p) => URL.createObjectURL(p.blob)), [t?.photos]);
  useEffect(() => () => photoUrls.forEach((u) => URL.revokeObjectURL(u)), [photoUrls]);

  if (!t) return null;
  const ok = t.status === 'ok';
  const missing = pendingClaims(t);
  const auto = canAutoSend(config);

  const addPhoto = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    const added = [];
    for (const f of files) {
      try {
        added.push({ id: uid(), ...(await compressPhoto(f)) });
      } catch {
        toast('No se pudo procesar la foto', 'error');
      }
    }
    if (added.length) A.updateTicket({ photos: [...t.photos, ...added] });
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await A.sendTicket(getState().ticket!);
      if (r === 'sent') {
        setDone('sent');
      } else if (r === 'queued') {
        setDone('queued');
      } else if (await A.shareViaPhone(getState().ticket!)) setDone('shared');
    } catch (e) {
      toast(`Error al generar el PDF: ${e}`, 'error', 5000);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    try {
      if (await A.shareViaPhone(getState().ticket!)) setDone((d) => d ?? 'shared');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="screen screen--form">
      <div class={`closehead closehead--${ok ? 'ok' : 'missing'}`}>
        <div class="closehead__icon">{ok ? '✔' : '!'}</div>
        <h1>{statusLabel(t)}</h1>
        <p>
          {t.claims.length - missing.length} de {t.claims.length} maletas recogidas · {t.negatives} descartadas
          {ticketFlight(t) ? ` · ✈ ${ticketFlight(t)}` : ''}
        </p>
      </div>

      <div class="form">
        <ul class="codes">
          {t.claims.map((c) => (
            <li key={c.id} class={`code ${c.foundAt ? 'code--ok' : 'code--missing'}`}>
              <span class="code__lpn">{fmtClaim(c)}</span>
              <span class="code__alpha">
                {fmtClaimAlpha(c)} · {c.foundAt ? `✔ ${fmtTime(c.foundAt)}${c.manual ? ' (manual)' : ''}` : '✖ NO APARECIDA'}
              </span>
            </li>
          ))}
        </ul>

        <label class="field">
          <span>Observaciones</span>
          <textarea
            class="input"
            rows={3}
            value={t.notes}
            placeholder={ok ? '' : 'Ej.: pasajero derivado al mostrador de Lost & Found'}
            onInput={(e) => A.updateTicket({ notes: (e.target as HTMLTextAreaElement).value })}
          />
        </label>

        <fieldset>
          <legend>Fotos</legend>
          <div class="photos">
            {t.photos.map((p, i) => (
              <figure key={p.id}>
                <img src={photoUrls[i]} alt={`Foto ${i + 1}`} />
                <button class="code__x" onClick={() => A.updateTicket({ photos: t.photos.filter((x) => x.id !== p.id) })} aria-label="Quitar foto">
                  ✕
                </button>
              </figure>
            ))}
            <label class="photo-add">
              📷 Añadir foto
              <input type="file" accept="image/*" capture="environment" onChange={addPhoto} hidden />
            </label>
          </div>
        </fieldset>

        {t.passenger && (
          <div class="card">
            <div>
              <strong>{t.passenger.name}</strong> · PNR {t.passenger.pnr}
            </div>
            <div class="muted">
              {t.passenger.flight} {t.passenger.from}→{t.passenger.to} {t.passenger.date ?? ''}
            </div>
            <label class="check">
              <input type="checkbox" checked={t.includePassenger} onChange={(e) => A.updateTicket({ includePassenger: (e.target as HTMLInputElement).checked })} />
              Incluir los datos del pasajero en el PDF
            </label>
          </div>
        )}

        <p class="muted small">
          {auto
            ? `Destinatarios: ${config.recipients.join(', ')}${online ? '' : ' · sin conexión: se enviará automáticamente al recuperarla'}`
            : config.recipients.length
              ? `Sin Power Automate configurado: se abrirá el menú de compartir del móvil (destinatarios copiados al portapapeles: ${config.recipients.join(', ')}).`
              : 'No hay destinatarios configurados: se abrirá el menú de compartir del móvil.'}
        </p>
      </div>

      <footer class="actions">
        {done ? (
          <>
            <p class="notice">
              {done === 'sent'
                ? `✔ PDF enviado por correo a ${config.recipients.length} destinatario(s).`
                : done === 'queued'
                  ? `✉ En cola${t.send.error ? ` (${t.send.error})` : ''}: se enviará automáticamente en cuanto haya conexión.`
                  : '✔ PDF compartido.'}
            </p>
            <button class="btn btn--xl btn--primary" onClick={() => A.nextTicket()}>
              SIGUIENTE PASAJERO →
            </button>
            {done === 'queued' && (
              <button class="btn" disabled={busy} onClick={share}>
                📤 Compartir ahora desde el móvil
              </button>
            )}
          </>
        ) : (
          <>
            <button class="btn btn--xl btn--primary" disabled={busy} onClick={send}>
              {busy ? 'Generando PDF…' : auto ? '✉ ENVIAR PDF POR EMAIL' : '📤 ENVIAR PDF (COMPARTIR)'}
            </button>
            <div class="row">
              {auto && (
                <button class="btn" disabled={busy} onClick={share}>
                  📤 Compartir
                </button>
              )}
              <button class="btn" disabled={busy} onClick={() => A.reopen()}>
                ↩ Volver a la cinta
              </button>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}

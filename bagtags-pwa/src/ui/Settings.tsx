/** Configuración: destinatarios, Power Automate, lectura, aerolíneas y despliegue en JSON. */
import { useEffect, useState } from 'preact/hooks';
import { getState, navigate, setState, toast, useApp } from '../app/store';
import * as A from '../app/actions';
import { isValidEndpoint, parseRecipients, sanitizeConfig, type AppConfig } from '../domain/config';
import { validateAirline, type Airline } from '../domain/airlines';
import { newTicket } from '../domain/ticket';
import { savePrefs, uid, wipeTickets } from '../storage/db';
import { download } from '../report/share';
import { nativeSupport } from '../scanner/decoders';
import { sendViaPowerAutomate } from '../send/send';

export function Settings() {
  const app = useApp();
  const [draft, setDraft] = useState<AppConfig>(app.config);
  const [recipientsText, setRecipientsText] = useState(app.config.recipients.join('\n'));
  const [native, setNative] = useState('…');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void nativeSupport().then((s) => setNative(s.available ? `Sí (${s.formats.join(', ')})` : s.formats.length ? `Sin ITF (${s.formats.join(', ')})` : 'No disponible'));
  }, []);

  const set = <K extends keyof AppConfig>(k: K, v: AppConfig[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const rec = parseRecipients(recipientsText);
  const endpointOk = isValidEndpoint(draft.endpoint.trim());
  const merged = sanitizeConfig({ ...draft, recipients: rec.valid, endpoint: draft.endpoint.trim() }, app.config);
  const dirty = JSON.stringify(merged) !== JSON.stringify(app.config);
  const back = () => navigate({ name: app.prefs.guard ? (app.ticket && app.ticket.status !== 'open' ? 'close' : 'ticket') : 'guard' });

  const save = async () => {
    await A.updateConfig(merged);
    setRecipientsText(merged.recipients.join('\n'));
    toast('Configuración guardada', 'ok');
  };

  /** Envía un ticket de prueba al flujo para comprobar la configuración. */
  const test = async () => {
    setTesting(true);
    try {
      const g = app.prefs.guard ?? { guardId: 'PRUEBA', airport: 'MAD', terminal: '', post: '' };
      const t = { ...newTicket(uid(), g, Date.now()), status: 'ok' as const, closedAt: Date.now(), notes: 'Correo de prueba de la configuración de Bagtags' };
      t.claims = [{ id: '0075123456', lpn: '0075123456', key: '075123456', airlineIata: 'IB', foundAt: Date.now() }];
      await sendViaPowerAutomate(t, merged);
      toast('✔ Correo de prueba enviado', 'ok', 4000);
    } catch (e) {
      toast(`✖ ${(e as Error).message}`, 'error', 6000);
    } finally {
      setTesting(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(app.config, null, 2)], { type: 'application/json' });
    download(new File([blob], `bagtags-config-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' }));
  };

  const importJson = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const cfg = sanitizeConfig(JSON.parse(await f.text()), app.config);
      if (!confirm(`¿Aplicar la configuración importada?\n${cfg.recipients.length} destinatario(s), ${cfg.endpoint ? 'con' : 'sin'} Power Automate, ${cfg.airlines.length} aerolíneas.`)) return;
      await A.updateConfig(cfg);
      setDraft(cfg);
      setRecipientsText(cfg.recipients.join('\n'));
      toast('Configuración importada', 'ok');
    } catch {
      alert('El fichero no es un JSON de configuración válido');
    }
  };

  const wipe = async () => {
    if (!confirm('¿Borrar TODOS los tickets de este dispositivo, incluidos los no enviados? No se puede deshacer.')) return;
    await wipeTickets();
    const prefs = { ...getState().prefs, activeTicketId: undefined };
    await savePrefs(prefs);
    setState({ ticket: null, prefs, pendingCount: 0 });
    await A.ensureTicket();
    toast('Tickets borrados', 'ok');
  };

  return (
    <div class="screen screen--form">
      <header class="topbar">
        <button class="iconbtn" onClick={back} aria-label="Volver">
          ←
        </button>
        <div class="topbar__title">
          <strong>Configuración</strong>
          <span>Se guarda en este dispositivo</span>
        </div>
      </header>

      <div class="form">
        <section>
          <h3>Envío por email</h3>
          <label class="field">
            <span>Destinatarios (uno por línea o separados por comas)</span>
            <textarea class="input" rows={3} value={recipientsText} placeholder="supervisor@empresa.es" onInput={(e) => setRecipientsText((e.target as HTMLTextAreaElement).value)} />
            {rec.invalid.length > 0 && <small class="text-bad">No válidos: {rec.invalid.join(', ')}</small>}
          </label>
          <label class="field">
            <span>URL del flujo de Power Automate (opcional)</span>
            <input
              class="input"
              type="url"
              inputMode="url"
              value={draft.endpoint}
              placeholder="https://…logic.azure.com/workflows/…"
              onInput={(e) => set('endpoint', (e.target as HTMLInputElement).value)}
            />
            {!endpointOk && <small class="text-bad">Debe ser una dirección https://</small>}
            <small class="muted">
              Con URL: el PDF se envía automáticamente (y se pone en cola si no hay red). Sin URL: se usa el menú de compartir del móvil. Instrucciones para crear el flujo en el README.
            </small>
          </label>
          <button class="btn" disabled={testing || !merged.endpoint || merged.recipients.length === 0 || !endpointOk} onClick={test}>
            {testing ? 'Enviando…' : '✉ Enviar correo de prueba'}
          </button>
        </section>

        <section>
          <h3>Lectura y avisos</h3>
          <Toggle label="Sonidos" v={draft.sound} on={(v) => set('sound', v)} />
          <Toggle label="Vibración (no disponible en iPhone)" v={draft.vibration} on={(v) => set('vibration', v)} />
          <Toggle label="Exigir doble lectura idéntica en ITF / Code 128 (recomendado)" v={draft.doubleRead} on={(v) => set('doubleRead', v)} />
          <label class="field">
            <span>Motor de lectura</span>
            <select class="input" value={draft.decoder} onChange={(e) => set('decoder', (e.target as HTMLSelectElement).value as AppConfig['decoder'])}>
              <option value="auto">Automático (nativo si admite ITF, si no zxing)</option>
              <option value="native">Nativo (BarcodeDetector)</option>
              <option value="zxing">zxing-wasm (compatible con todo)</option>
            </select>
            <small class="muted">BarcodeDetector en este navegador: {native}</small>
          </label>
          <label class="field">
            <span>Tema</span>
            <select class="input" value={draft.theme} onChange={(e) => set('theme', (e.target as HTMLSelectElement).value as AppConfig['theme'])}>
              <option value="dark">Oscuro (poca luz)</option>
              <option value="light">Claro alto contraste (mucha luz)</option>
            </select>
          </label>
          <label class="field">
            <span>Días que se conservan los tickets ya enviados</span>
            <input class="input" type="number" min={1} max={365} value={draft.retentionDays} onInput={(e) => set('retentionDays', Number((e.target as HTMLInputElement).value))} />
          </label>
        </section>

        <AirlineEditor items={draft.airlines} onChange={(v) => set('airlines', v)} />

        <section>
          <h3>Desplegar en otros móviles</h3>
          <div class="row">
            <button class="btn" onClick={exportJson}>
              ⬇ Exportar JSON
            </button>
            <label class="btn">
              ⬆ Importar JSON
              <input type="file" accept="application/json,.json" hidden onChange={importJson} />
            </label>
          </div>
        </section>

        <section>
          <h3>Datos</h3>
          <button class="btn btn--bad" onClick={wipe}>
            🗑 Borrar todos los tickets del dispositivo
          </button>
        </section>
        <p class="muted">Versión {__APP_VERSION__}</p>
      </div>

      <footer class="actions">
        <button class="btn btn--xl btn--primary" disabled={!dirty || !endpointOk} onClick={save}>
          GUARDAR CAMBIOS
        </button>
      </footer>
    </div>
  );
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label class="toggle">
      <input type="checkbox" checked={v} onChange={(e) => on((e.target as HTMLInputElement).checked)} />
      <span>{label}</span>
    </label>
  );
}

function AirlineEditor({ items, onChange }: { items: Airline[]; onChange: (v: Airline[]) => void }) {
  const [a, setA] = useState<Airline>({ iata: '', numeric: '', name: '' });
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const err = a.iata || a.numeric ? validateAirline(a) : null;
  const shown = items.map((x, i) => [x, i] as const).filter(([x]) => !filter || `${x.iata} ${x.numeric} ${x.name ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <section>
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Aerolíneas (IATA ↔ código de 3 dígitos) · {items.length}</summary>
        <p class="muted">Se usa para convertir "IB 123456" en 0075123456 en la entrada manual. Verifique los códigos con cada aerolínea o handling.</p>
        <input class="input" placeholder="Buscar…" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
        <table class="table">
          <tbody>
            {shown.map(([x, i]) => (
              <tr key={x.iata + i}>
                <td>{x.iata}</td>
                <td>{x.numeric}</td>
                <td>{x.name}</td>
                <td>
                  <button class="iconbtn" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label={`Eliminar ${x.iata}`}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="row">
          <input class="input" style={{ maxWidth: '5em' }} placeholder="IB" maxLength={2} value={a.iata} onInput={(e) => setA({ ...a, iata: (e.target as HTMLInputElement).value.toUpperCase() })} />
          <input class="input" style={{ maxWidth: '5em' }} placeholder="075" maxLength={3} inputMode="numeric" value={a.numeric} onInput={(e) => setA({ ...a, numeric: (e.target as HTMLInputElement).value })} />
          <input class="input" placeholder="Nombre" value={a.name} onInput={(e) => setA({ ...a, name: (e.target as HTMLInputElement).value })} />
          <button
            class="btn"
            disabled={!a.iata || !!err}
            onClick={() => {
              onChange([{ ...a, iata: a.iata.toUpperCase() }, ...items.filter((x) => x.iata !== a.iata.toUpperCase())]);
              setA({ iata: '', numeric: '', name: '' });
            }}
          >
            +
          </button>
        </div>
        {err && <small class="text-bad">{err}</small>}
      </details>
    </section>
  );
}

/** Configuración (protegida con PIN de supervisor). */
import { useEffect, useState } from 'preact/hooks';
import { getState, navigate, requestPin, setState, toast, useApp } from '../app/store';
import * as A from '../app/actions';
import { sanitizeConfig, type AppConfig } from '../domain/config';
import { validateAirline, type Airline } from '../domain/airlines';
import { makePin, usesDefaultPin } from '../storage/pin';
import { savePrefs, wipeAllData } from '../storage/db';
import { download } from '../report/share';
import { nativeSupport } from '../scanner/decoders';
import { emptyPass, seen } from '../app/store';

export function Settings() {
  const app = useApp();
  const [unlocked, setUnlocked] = useState(false);
  const [draft, setDraft] = useState<AppConfig>(app.config);
  const [native, setNative] = useState('…');

  useEffect(() => {
    void requestPin('Acceso a Configuración').then((ok) => (ok ? setUnlocked(true) : navigate({ name: app.shift && !app.shift.endedAt ? 'control' : 'start' })));
    void nativeSupport().then((s) => setNative(s.available ? `Sí (${s.formats.join(', ')})` : s.formats.length ? `Sin ITF (${s.formats.join(', ')})` : 'No disponible'));
  }, []);

  if (!unlocked) return <div class="screen" />;

  const set = <K extends keyof AppConfig>(k: K, v: AppConfig[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const back = () => navigate({ name: app.shift && !app.shift.endedAt ? 'control' : 'start' });
  const dirty = JSON.stringify(draft) !== JSON.stringify(app.config);

  const save = async () => {
    await A.updateConfig(sanitizeConfig(draft, app.config));
    toast('Configuración guardada', 'ok');
  };

  const changePin = async () => {
    const p1 = prompt('Nuevo PIN de supervisor (4-8 dígitos):') ?? '';
    if (!/^\d{4,8}$/.test(p1)) return void (p1 && alert('El PIN debe tener entre 4 y 8 dígitos'));
    const p2 = prompt('Repita el nuevo PIN:') ?? '';
    if (p1 !== p2) return void alert('Los PIN no coinciden');
    const pin = await makePin(p1);
    const cfg = { ...getState().config, ...pin };
    await A.updateConfig(cfg);
    setDraft((d) => ({ ...d, ...pin }));
    toast('PIN cambiado', 'ok');
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
      const parsed = JSON.parse(await f.text());
      const cfg = sanitizeConfig(parsed, app.config);
      if (!confirm(`¿Aplicar la configuración importada?\n${cfg.incidentTypes.length} tipos de incidencia, ${cfg.actions.length} acciones, ${cfg.posts.length} puestos, ${cfg.airlines.length} aerolíneas.`)) return;
      await A.updateConfig(cfg);
      setDraft(cfg);
      toast('Configuración importada', 'ok');
    } catch {
      alert('El fichero no es un JSON de configuración válido');
    }
  };

  const wipe = async () => {
    if (!confirm('¿Borrar TODOS los turnos, controles e incidencias de este dispositivo? No se puede deshacer.')) return;
    if (!(await requestPin('Confirmar borrado total'))) return;
    await wipeAllData();
    seen.clear();
    const prefs = { ...getState().prefs, activeShiftId: undefined };
    await savePrefs(prefs);
    setState({ shift: null, counters: { controls: 0, incidents: 0 }, pass: emptyPass(), prefs });
    toast('Datos borrados', 'ok');
    navigate({ name: 'start' });
  };

  return (
    <div class="screen screen--form">
      <header class="topbar">
        <button class="iconbtn" onClick={back} aria-label="Volver">
          ←
        </button>
        <div class="topbar__title">
          <strong>Configuración</strong>
          <span>Supervisor</span>
        </div>
      </header>

      <div class="form">
        {usesDefaultPin(app.config) && <p class="notice notice--warn">⚠ Se está usando el PIN por defecto (1234). Cámbielo antes de desplegar.</p>}

        <section>
          <h3>Funcionamiento</h3>
          <label class="field">
            <span>Reinicio automático tras CORRECTO (segundos, 0 = no)</span>
            <input class="input" type="number" min={0} max={30} value={draft.autoResetSec} onInput={(e) => set('autoResetSec', Number((e.target as HTMLInputElement).value))} />
          </label>
          <Toggle label="Sonidos" v={draft.sound} on={(v) => set('sound', v)} />
          <Toggle label="Vibración (no disponible en iPhone)" v={draft.vibration} on={(v) => set('vibration', v)} />
          <Toggle label="Abrir la ficha de incidencia automáticamente tras NO COINCIDE" v={draft.autoOpenIncident} on={(v) => set('autoOpenIncident', v)} />
          <Toggle label="Finalizar automáticamente cuando todos los resguardos tienen maleta" v={draft.autoFinish} on={(v) => set('autoFinish', v)} />
          <Toggle label="Exigir doble lectura idéntica en ITF / Code 128 (recomendado)" v={draft.doubleRead} on={(v) => set('doubleRead', v)} />
          <Toggle
            label="Paso a maletas automático al volver a leer un resguardo ya leído (más rápido, pero un resguardo leído dos veces cuenta como maleta)"
            v={draft.autoAdvanceOnRepeat}
            on={(v) => set('autoAdvanceOnRepeat', v)}
          />
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
            <span>LPN en el CSV</span>
            <select class="input" value={draft.csvLpnFormat} onChange={(e) => set('csvLpnFormat', (e.target as HTMLSelectElement).value as AppConfig['csvLpnFormat'])}>
              <option value="excel">Excel (conserva ceros iniciales con ="…")</option>
              <option value="plain">Plano (Power Automate / SharePoint)</option>
            </select>
          </label>
        </section>

        <section>
          <h3>Privacidad — borrado automático</h3>
          <div class="row">
            <label class="field">
              <span>Controles (horas)</span>
              <input class="input" type="number" min={1} value={draft.retentionControlsHours} onInput={(e) => set('retentionControlsHours', Number((e.target as HTMLInputElement).value))} />
            </label>
            <label class="field">
              <span>Incidencias (días)</span>
              <input class="input" type="number" min={1} value={draft.retentionIncidentsDays} onInput={(e) => set('retentionIncidentsDays', Number((e.target as HTMLInputElement).value))} />
            </label>
          </div>
        </section>

        <ListEditor title="Tipos de incidencia" items={draft.incidentTypes} onChange={(v) => set('incidentTypes', v)} />
        <ListEditor title="Acciones tomadas" items={draft.actions} onChange={(v) => set('actions', v)} />
        <ListEditor title="Puestos" items={draft.posts} onChange={(v) => set('posts', v)} />
        <AirlineEditor items={draft.airlines} onChange={(v) => set('airlines', v)} />

        <section>
          <h3>Sincronización (próximamente)</h3>
          <p class="muted">Preparada para enviar los informes a un flujo HTTP de Power Automate / SharePoint. No implementada: la app no envía nada a la red.</p>
          <input class="input" disabled placeholder="https://prod-00.westeurope.logic.azure.com/…" value={draft.sync.endpoint} />
        </section>

        <section>
          <h3>Despliegue</h3>
          <div class="row">
            <button class="btn" onClick={exportJson}>
              ⬇ Exportar JSON
            </button>
            <label class="btn">
              ⬆ Importar JSON
              <input type="file" accept="application/json,.json" hidden onChange={importJson} />
            </label>
          </div>
          <button class="btn" onClick={changePin}>
            🔑 Cambiar PIN de supervisor
          </button>
        </section>

        <section>
          <h3>Datos</h3>
          <button class="btn btn--bad" onClick={wipe}>
            🗑 Borrar todos los datos del dispositivo
          </button>
        </section>
        <p class="muted">Versión {__APP_VERSION__}</p>
      </div>

      <footer class="actions">
        <button class="btn btn--xl btn--primary" disabled={!dirty} onClick={save}>
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

function ListEditor({ title, items, onChange }: { title: string; items: string[]; onChange: (v: string[]) => void }) {
  const [add, setAdd] = useState('');
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const n = [...items];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <section>
      <h3>{title}</h3>
      <ul class="edit-list">
        {items.map((it, i) => (
          <li key={it + i}>
            <input class="input" value={it} onChange={(e) => onChange(items.map((x, k) => (k === i ? (e.target as HTMLInputElement).value : x)))} />
            <button class="iconbtn" onClick={() => move(i, -1)} aria-label="Subir">
              ↑
            </button>
            <button class="iconbtn" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Eliminar">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div class="row">
        <input class="input" value={add} placeholder="Nuevo elemento" onInput={(e) => setAdd((e.target as HTMLInputElement).value)} />
        <button
          class="btn"
          onClick={() => {
            if (add.trim()) onChange([...items, add.trim()]);
            setAdd('');
          }}
        >
          Añadir
        </button>
      </div>
    </section>
  );
}

function AirlineEditor({ items, onChange }: { items: Airline[]; onChange: (v: Airline[]) => void }) {
  const [a, setA] = useState<Airline>({ iata: '', numeric: '', name: '' });
  const [filter, setFilter] = useState('');
  const err = a.iata || a.numeric ? validateAirline(a) : null;
  const shown = items.map((x, i) => [x, i] as const).filter(([x]) => !filter || `${x.iata} ${x.numeric} ${x.name ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <section>
      <h3>Aerolíneas (IATA ↔ código de 3 dígitos)</h3>
      <p class="muted">Se usa para convertir "IB 123456" en 0075123456. Verifique los códigos con cada aerolínea o handling.</p>
      <input class="input" placeholder="Buscar…" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
      <table class="table">
        <thead>
          <tr>
            <th>IATA</th>
            <th>Código</th>
            <th>Nombre</th>
            <th />
          </tr>
        </thead>
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
    </section>
  );
}

/** Inicio de turno: datos del vigilante, puesto y vuelos (opcional). */
import { useState } from 'preact/hooks';
import { navigate, useApp } from '../app/store';
import * as A from '../app/actions';
import { unlockAudio } from '../feedback';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export function ShiftStart() {
  const { prefs, config } = useApp();
  const [guardId, setGuardId] = useState(prefs.lastGuardId);
  const [airport, setAirport] = useState(prefs.lastAirport);
  const [terminal, setTerminal] = useState(prefs.lastTerminal);
  const [post, setPost] = useState(prefs.lastPost || config.posts[0] || '');
  const [start, setStart] = useState(toLocalInput(new Date()));
  const [flights, setFlights] = useState<string[]>([]);
  const [flightInput, setFlightInput] = useState('');

  const addFlight = (f: string) => {
    const v = f.replace(/\s+/g, '').toUpperCase();
    if (/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(v) && !flights.includes(v)) setFlights([...flights, v]);
    setFlightInput('');
  };

  const valid = guardId.trim() && airport.trim() && post.trim();

  return (
    <div class="screen screen--form" onPointerDown={unlockAudio}>
      <header class="topbar">
        <div class="topbar__title">
          <strong>Lector de Bagtags</strong>
          <span>Inicio de turno</span>
        </div>
        <button class="iconbtn" onClick={() => navigate({ name: 'help' })} aria-label="Ayuda">
          ❓
        </button>
      </header>

      <form
        class="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          void A.startShift({
            guardId: guardId.trim().toUpperCase(),
            airport: airport.trim().toUpperCase(),
            terminal: terminal.trim().toUpperCase(),
            post: post.trim(),
            flights,
            startedAt: new Date(start).getTime() || Date.now(),
          });
        }}
      >
        <label class="field">
          <span>Vigilante (TIP o código interno) *</span>
          <input class="input input--big" value={guardId} required autocomplete="off" autocapitalize="characters" onInput={(e) => setGuardId((e.target as HTMLInputElement).value)} />
        </label>
        <div class="row">
          <label class="field">
            <span>Aeropuerto *</span>
            <input class="input input--big" value={airport} required maxLength={4} placeholder="MAD" autocapitalize="characters" onInput={(e) => setAirport((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>Terminal</span>
            <input class="input input--big" value={terminal} maxLength={6} placeholder="T4S" autocapitalize="characters" onInput={(e) => setTerminal((e.target as HTMLInputElement).value)} />
          </label>
        </div>
        <label class="field">
          <span>Puesto *</span>
          <input class="input input--big" list="posts" value={post} required onInput={(e) => setPost((e.target as HTMLInputElement).value)} />
          <datalist id="posts">
            {config.posts.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <div class="choices">
          {config.posts.map((p) => (
            <button type="button" key={p} class={`chipbtn ${post === p ? 'chipbtn--on' : ''}`} onClick={() => setPost(p)}>
              {p}
            </button>
          ))}
        </div>
        <label class="field">
          <span>Fecha y hora de inicio</span>
          <input class="input" type="datetime-local" value={start} onInput={(e) => setStart((e.target as HTMLInputElement).value)} />
        </label>

        <fieldset>
          <legend>Vuelos controlados (opcional)</legend>
          <div class="row">
            <input
              class="input"
              value={flightInput}
              placeholder="IB3167"
              autocapitalize="characters"
              onInput={(e) => setFlightInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFlight(flightInput);
                }
              }}
            />
            <button type="button" class="btn" onClick={() => addFlight(flightInput)}>
              Añadir
            </button>
          </div>
          <div class="choices">
            {flights.map((f) => (
              <button type="button" key={f} class="chipbtn chipbtn--on" onClick={() => setFlights(flights.filter((x) => x !== f))}>
                {f} ✕
              </button>
            ))}
            {prefs.recentFlights
              .filter((f) => !flights.includes(f))
              .map((f) => (
                <button type="button" key={f} class="chipbtn" onClick={() => setFlights([...flights, f])}>
                  + {f}
                </button>
              ))}
          </div>
        </fieldset>

        <p class="privacy">
          🔒 Todos los datos se guardan solo en este dispositivo. En los controles correctos no se guardan nombres: solo el código de la etiqueta, la hora y el resultado. Borrado
          automático: controles {config.retentionControlsHours} h, incidencias {config.retentionIncidentsDays} días.
        </p>

        <div class="actions actions--inline">
          <button class="btn btn--xl btn--primary" disabled={!valid}>
            INICIAR TURNO
          </button>
          <div class="row">
            <button type="button" class="btn" onClick={() => navigate({ name: 'demo' })}>
              🧪 Demostración
            </button>
            <button type="button" class="btn" onClick={() => navigate({ name: 'settings' })}>
              ⚙ Configuración
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

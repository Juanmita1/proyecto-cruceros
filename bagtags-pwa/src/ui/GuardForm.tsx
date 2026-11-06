/** Datos del vigilante y del puesto (se confirman una vez al día). */
import { useState } from 'preact/hooks';
import { navigate, useApp } from '../app/store';
import * as A from '../app/actions';
import { unlockAudio } from '../feedback';

export function GuardForm() {
  const { prefs, config } = useApp();
  const g = prefs.guard;
  const [guardId, setGuardId] = useState(g?.guardId ?? '');
  const [airport, setAirport] = useState(g?.airport ?? '');
  const [terminal, setTerminal] = useState(g?.terminal ?? '');
  const [post, setPost] = useState(g?.post ?? '');
  const valid = guardId.trim() && airport.trim();

  return (
    <div class="screen screen--form" onPointerDown={unlockAudio}>
      <header class="topbar">
        <div class="topbar__title">
          <strong>Bagtags Aerovalue</strong>
          <span>{g ? 'Confirme sus datos' : 'Datos del vigilante'}</span>
        </div>
        <button class="iconbtn" onClick={() => navigate({ name: 'help' })} aria-label="Ayuda">
          ❓
        </button>
      </header>
      <form
        class="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid)
            void A.saveGuard({
              guardId: guardId.trim().toUpperCase(),
              airport: airport.trim().toUpperCase(),
              terminal: terminal.trim().toUpperCase(),
              post: post.trim(),
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
          <span>Puesto / cinta</span>
          <input class="input input--big" value={post} placeholder="Cinta 7" onInput={(e) => setPost((e.target as HTMLInputElement).value)} />
        </label>

        {config.recipients.length === 0 && (
          <p class="notice notice--warn">
            ⚠ No hay destinatarios de correo configurados. Puede trabajar igualmente y compartir los PDF desde el móvil, o configurarlos en{' '}
            <button type="button" class="linkbtn" onClick={() => navigate({ name: 'settings' })}>
              Configuración
            </button>
            .
          </p>
        )}

        <p class="privacy">
          🔒 Los tickets se guardan solo en este dispositivo y se borran {config.retentionDays} días después de enviarse. El PDF se envía únicamente a los destinatarios configurados.
        </p>

        <div class="actions actions--inline">
          <button class="btn btn--xl btn--primary" disabled={!valid}>
            {g ? 'CONTINUAR' : 'EMPEZAR'}
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

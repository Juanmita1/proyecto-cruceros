/** Enrutado de pantallas y elementos globales (aviso, actualización, PIN). */
import { useApp } from './app/store';
import { Control } from './ui/Control';
import { ShiftStart } from './ui/ShiftStart';
import { IncidentForm } from './ui/IncidentForm';
import { Report } from './ui/Report';
import { Settings } from './ui/Settings';
import { Demo } from './ui/Demo';
import { Help } from './ui/Help';
import { PinDialog } from './ui/PinDialog';
import { applyUpdate } from './pwa';

export function App() {
  const { route, toast, updateAvailable, shift } = useApp();

  let screen;
  switch (route.name) {
    case 'loading':
      screen = <div class="splash">Cargando…</div>;
      break;
    case 'start':
      screen = <ShiftStart />;
      break;
    case 'control':
      screen = shift ? <Control /> : <ShiftStart />;
      break;
    case 'incident':
      screen = <IncidentForm key={route.incidentId ?? 'new'} controlId={route.controlId} incidentId={route.incidentId} presetType={route.presetType} />;
      break;
    case 'report':
      screen = <Report />;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    case 'demo':
      screen = <Demo />;
      break;
    case 'help':
      screen = <Help />;
      break;
  }

  return (
    <>
      {screen}
      {toast && (
        <div class={`toast toast--${toast.kind}`} role="status" key={toast.id}>
          {toast.text}
        </div>
      )}
      {updateAvailable && route.name !== 'control' && (
        <div class="update">
          Nueva versión disponible
          <button class="btn" onClick={applyUpdate}>
            Actualizar
          </button>
        </div>
      )}
      <PinDialog />
    </>
  );
}

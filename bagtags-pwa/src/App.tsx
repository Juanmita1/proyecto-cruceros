/** Enrutado de pantallas y elementos globales (avisos, actualización). */
import { useApp } from './app/store';
import { GuardForm } from './ui/GuardForm';
import { TicketScreen } from './ui/TicketScreen';
import { CloseTicket } from './ui/CloseTicket';
import { History, ViewTicket } from './ui/History';
import { Settings } from './ui/Settings';
import { Demo } from './ui/Demo';
import { Help } from './ui/Help';
import { applyUpdate } from './pwa';

export function App() {
  const { route, toast, updateAvailable, ticket } = useApp();

  let screen;
  switch (route.name) {
    case 'loading':
      screen = <div class="splash">Cargando…</div>;
      break;
    case 'guard':
      screen = <GuardForm />;
      break;
    case 'ticket':
      screen = ticket ? <TicketScreen /> : <GuardForm />;
      break;
    case 'close':
      screen = ticket ? <CloseTicket /> : <GuardForm />;
      break;
    case 'history':
      screen = <History />;
      break;
    case 'view':
      screen = <ViewTicket ticketId={route.ticketId} />;
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
      {updateAvailable && route.name !== 'ticket' && (
        <div class="update">
          Nueva versión disponible
          <button class="btn" onClick={applyUpdate}>
            Actualizar
          </button>
        </div>
      )}
    </>
  );
}

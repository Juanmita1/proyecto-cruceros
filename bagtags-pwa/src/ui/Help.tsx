/** Ayuda rápida: uso, instalación y permisos. */
import { navigate, useApp } from '../app/store';

export function Help() {
  const { prefs } = useApp();
  return (
    <div class="screen screen--form">
      <header class="topbar">
        <button class="iconbtn" onClick={() => navigate({ name: prefs.guard ? 'ticket' : 'guard' })} aria-label="Volver">
          ←
        </button>
        <div class="topbar__title">
          <strong>Ayuda</strong>
          <span>Uso e instalación</span>
        </div>
      </header>
      <div class="form prose">
        <h3>Un ticket por pasajero</h3>
        <ol>
          <li>
            <strong>Resguardos</strong>: escanee los resguardos pegados en la tarjeta de embarque. Opcional: el código 2D de la tarjeta para añadir vuelo y datos del pasajero.
          </li>
          <li>
            Pulse <strong>VIGILAR CINTA →</strong> y escanee cada maleta que pase. No hay que tocar nada entre una y otra:
            <ul>
              <li>🔴 NO ES SUYA: aviso corto, siga escaneando.</li>
              <li>🟢 ¡ES SUYA! RECOGER: esa maleta pertenece al pasajero.</li>
              <li>🟡 ¿ES SUYA?: etiqueta dañada o de reserva; compárela y confirme.</li>
            </ul>
          </li>
          <li>
            Cuando salen todas, el ticket se cierra solo con <strong>TODO OK</strong>. Si la cinta termina antes, pulse <strong>CERRAR TICKET</strong>: quedará como <strong>FALTAN N MALETAS</strong>.
          </li>
          <li>Añada observaciones o fotos si hace falta y pulse <strong>ENVIAR PDF</strong>. Sin conexión, el envío queda en cola y sale solo al recuperar la red.</li>
        </ol>
        <h3>Consejos de lectura</h3>
        <ul>
          <li>Coloque el código dentro del marco, a 15-30 cm. Use el zoom en vez de acercarse demasiado.</li>
          <li>Con reflejos del plástico, incline ligeramente el móvil o apague la linterna.</li>
          <li>Si no se lee, use ⌨ Manual: 10 dígitos, o aerolínea + 6 dígitos ("IB" + 123456).</li>
          <li>Lector Bluetooth: emparéjelo como teclado; la lectura terminada en Enter entra directamente.</li>
        </ul>
        <h3>Instalar en el móvil</h3>
        <ul>
          <li>
            <strong>Android (Chrome):</strong> menú ⋮ → <em>Instalar aplicación</em>.
          </li>
          <li>
            <strong>iPhone (Safari):</strong> botón Compartir → <em>Añadir a pantalla de inicio</em>.
          </li>
          <li>Abra la app una vez con conexión: a partir de ahí funciona sin red.</li>
        </ul>
        <h3>Permiso de cámara</h3>
        <ul>
          <li>Android: candado de la barra de direcciones → Permisos → Cámara → Permitir.</li>
          <li>iPhone: Ajustes → Safari → Cámara → Permitir.</li>
        </ul>
      </div>
    </div>
  );
}

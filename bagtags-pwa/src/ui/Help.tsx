/** Ayuda rápida: uso, instalación y permisos. */
import { navigate, useApp } from '../app/store';

export function Help() {
  const { shift } = useApp();
  return (
    <div class="screen screen--form">
      <header class="topbar">
        <button class="iconbtn" onClick={() => navigate({ name: shift && !shift.endedAt ? 'control' : 'start' })} aria-label="Volver">
          ←
        </button>
        <div class="topbar__title">
          <strong>Ayuda</strong>
          <span>Uso e instalación</span>
        </div>
      </header>
      <div class="form prose">
        <h3>Control de un pasajero</h3>
        <ol>
          <li>
            Escanee el <strong>resguardo</strong> (o los resguardos) pegado en la tarjeta de embarque. Opcional: el código 2D de la tarjeta para asociar el vuelo.
          </li>
          <li>
            Pulse <strong>MALETAS →</strong> y escanee la etiqueta de cada maleta.
          </li>
          <li>
            🟢 CORRECTO se reinicia solo. 🔴 NO COINCIDE abre la ficha de incidencia. 🟠 INCOMPLETO: confirme si el pasajero espera otra maleta. ⚪ YA CONTROLADA indica la hora del control anterior.
          </li>
        </ol>
        <h3>Consejos de lectura</h3>
        <ul>
          <li>Coloque el código dentro del marco horizontal, a 15-30 cm. Use el zoom en vez de acercarse demasiado.</li>
          <li>Con reflejos en el plástico, incline ligeramente la etiqueta o apague la linterna.</li>
          <li>Etiqueta arrugada: estírela con la mano; si no se lee, use ⌨ Manual (10 dígitos, o aerolínea + 6 dígitos).</li>
          <li>Lector Bluetooth: emparéjelo como teclado; la lectura terminada en Enter entra directamente.</li>
        </ul>
        <h3>Instalar en el móvil</h3>
        <ul>
          <li>
            <strong>Android (Chrome):</strong> menú ⋮ → <em>Instalar aplicación</em> / <em>Añadir a pantalla de inicio</em>.
          </li>
          <li>
            <strong>iPhone (Safari):</strong> botón Compartir → <em>Añadir a pantalla de inicio</em>.
          </li>
          <li>Abra la app una vez con conexión: a partir de ahí funciona sin red.</li>
        </ul>
        <h3>Permiso de cámara</h3>
        <ul>
          <li>Android: candado de la barra de direcciones → Permisos → Cámara → Permitir.</li>
          <li>iPhone: Ajustes → Safari → Cámara → Permitir (o "aA" → Ajustes del sitio web).</li>
        </ul>
        <h3>Privacidad</h3>
        <p>
          Los datos se guardan solo en este dispositivo. En los controles se guardan únicamente los códigos de etiqueta, la hora, el resultado y el vuelo. Los datos del pasajero solo se guardan
          en las incidencias. Se borran automáticamente según la configuración (por defecto 72 h y 30 días).
        </p>
      </div>
    </div>
  );
}

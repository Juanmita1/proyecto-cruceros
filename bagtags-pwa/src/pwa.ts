/**
 * Registro del Service Worker (Workbox, generado por vite-plugin-pwa).
 * Estrategia "prompt": la nueva versión no se activa en mitad de un control;
 * se avisa fuera de la pantalla de control y el vigilante decide cuándo actualizar.
 */
import { registerSW } from 'virtual:pwa-register';
import { setState } from './app/store';

let update: ((reload?: boolean) => Promise<void>) | null = null;

export function setupPwa() {
  update = registerSW({
    immediate: true,
    onNeedRefresh() {
      setState({ updateAvailable: true });
    },
    onOfflineReady() {
      /* La app ya está disponible sin conexión. */
    },
  });
}

export function applyUpdate() {
  void update?.(true);
}

import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// BASE_PATH permite publicar en un subdirectorio (p. ej. GitHub Pages: /proyecto-cruceros/).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version} (${new Date().toISOString().slice(0, 10)})`),
  },
  worker: { format: 'es' },
  // zxing-wasm carga su .wasm con fetch: no debe pre-empaquetarse en desarrollo.
  optimizeDeps: { exclude: ['zxing-wasm'] },
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 1200 },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      manifest: {
        id: './',
        name: 'Lector de Bagtags — control de equipaje en cinta',
        short_name: 'Bagtags',
        description: 'Ticket de control de equipaje en cinta: avisa de qué maletas son del pasajero y envía el PDF por email. Funciona sin conexión.',
        lang: 'es',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0f14',
        theme_color: '#0b0f14',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache de TODO (incluido el .wasm de zxing, ~1 MB): la app funciona 100 % offline tras la primera carga.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest}'],
        // html2canvas / dompurify solo los usa jsPDF.html(), que no se utiliza.
        globIgnores: ['**/html2canvas*', '**/purify*'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Sin rutas de red en tiempo de ejecución: nada depende de la red.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
});

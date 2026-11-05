/// <reference lib="webworker" />
/**
 * Web Worker de decodificación con zxing-wasm (zxing-cpp compilado a
 * WebAssembly). Se usa en iOS Safari y en cualquier navegador sin
 * BarcodeDetector. Al ejecutarse fuera del hilo principal la interfaz
 * sigue fluida en móviles de gama baja.
 *
 * El .wasm se sirve desde la propia app (no desde CDN) para que funcione
 * offline: Vite lo copia a /assets y el Service Worker lo precachea.
 */
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? new URL(wasmUrl, self.location.href).href : prefix + path),
  },
  fireImmediately: true,
}).catch((e: unknown) => {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'error', error: String(e) });
});

const options: ReaderOptions = {
  formats: ['ITF', 'Code128', 'PDF417', 'QRCode', 'Aztec'],
  tryHarder: true,
  tryRotate: false, // el marco guía es horizontal: ahorra CPU
  tryInvert: false,
  tryDownscale: true,
  maxNumberOfSymbols: 4, // varios resguardos en el mismo encuadre
  minLineCount: 2,
};

export interface WorkerRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { id, width, height, buffer } = ev.data;
  try {
    const img = new ImageData(new Uint8ClampedArray(buffer), width, height);
    const res = await readBarcodes(img, options);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({
      type: 'result',
      id,
      results: res.filter((r) => r.isValid && r.text).map((r) => ({ text: r.text, format: r.format })),
    });
  } catch (e) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'result', id, results: [], error: String(e) });
  }
};

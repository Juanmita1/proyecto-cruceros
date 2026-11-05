/**
 * Motores de decodificación intercambiables:
 *  - NativeDecoder: API BarcodeDetector (Chrome Android). Rápido, acelerado por hardware.
 *  - ZxingDecoder:  zxing-wasm en un Web Worker (iOS Safari, Firefox, escritorio).
 */
import type { DecoderPref } from '../domain/config';

export interface Detection {
  text: string;
  /** Formato normalizado a nombres zxing: ITF, Code128, PDF417, QRCode, Aztec. */
  format: string;
}

export interface Decoder {
  readonly name: string;
  decode(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<Detection[]>;
  dispose(): void;
}

// --- BarcodeDetector (no está en lib.dom de TypeScript) ---
interface NativeBarcode {
  rawValue: string;
  format: string;
}
interface BarcodeDetectorLike {
  detect(src: CanvasImageSource): Promise<NativeBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}
const NativeBD = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

const NATIVE_FORMATS: Record<string, string> = {
  itf: 'ITF',
  code_128: 'Code128',
  pdf417: 'PDF417',
  qr_code: 'QRCode',
  aztec: 'Aztec',
};

export async function nativeSupport(): Promise<{ available: boolean; formats: string[] }> {
  if (!NativeBD) return { available: false, formats: [] };
  try {
    const f = await NativeBD.getSupportedFormats();
    return { available: f.includes('itf'), formats: f };
  } catch {
    return { available: false, formats: [] };
  }
}

class NativeDecoder implements Decoder {
  readonly name = 'BarcodeDetector nativo';
  private det: BarcodeDetectorLike;
  constructor(formats: string[]) {
    this.det = new NativeBD!({ formats: Object.keys(NATIVE_FORMATS).filter((f) => formats.includes(f)) });
  }
  async decode(canvas: HTMLCanvasElement): Promise<Detection[]> {
    const r = await this.det.detect(canvas);
    return r.map((b) => ({ text: b.rawValue, format: NATIVE_FORMATS[b.format] ?? b.format }));
  }
  dispose() {}
}

class ZxingDecoder implements Decoder {
  readonly name = 'zxing-wasm';
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, (d: Detection[]) => void>();

  constructor() {
    this.worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<{ type: string; id: number; results: Detection[] }>) => {
      if (ev.data.type !== 'result') return;
      const cb = this.pending.get(ev.data.id);
      this.pending.delete(ev.data.id);
      cb?.(ev.data.results);
    };
  }

  decode(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<Detection[]> {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      // Transferimos el buffer (sin copia).
      this.worker.postMessage({ id, width: img.width, height: img.height, buffer: img.data.buffer }, [img.data.buffer]);
      // Salvaguarda: si el worker no responde en 3 s, seguimos.
      setTimeout(() => {
        if (this.pending.delete(id)) resolve([]);
      }, 3000);
    });
  }

  dispose() {
    this.worker.terminate();
    this.pending.clear();
  }
}

export async function createDecoder(pref: DecoderPref): Promise<Decoder> {
  if (pref !== 'zxing') {
    const s = await nativeSupport();
    if (s.available) return new NativeDecoder(s.formats);
  }
  return new ZxingDecoder();
}

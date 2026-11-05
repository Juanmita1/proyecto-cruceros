/**
 * Servicio único de cámara + bucle de decodificación.
 *
 * - Cámara trasera (facingMode environment), 1280×720 o superior si existe.
 * - Solo se analiza la franja del marco guía horizontal (ROI): menos píxeles
 *   = más fotogramas por segundo en móviles de gama baja.
 * - Linterna y zoom si el dispositivo los expone (MediaTrackCapabilities).
 * - Al pasar la app a segundo plano se libera la cámara y se reanuda al volver.
 * - Mantiene la pantalla encendida (Screen Wake Lock) mientras escanea.
 */
import type { DecoderPref } from '../domain/config';
import { createDecoder, type Decoder, type Detection } from './decoders';

export type CameraState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'running'; engine: string; torch: boolean; zoom: { min: number; max: number; step: number; value: number } | null }
  | { status: 'error'; reason: 'denied' | 'nocamera' | 'insecure' | 'unsupported' | 'busy' | 'other'; message: string };

type DetectListener = (d: Detection[]) => void;
type StateListener = (s: CameraState) => void;

/** Fracción del área visible ocupada por el marco guía (debe coincidir con el CSS .guide). */
export const GUIDE = { width: 0.9, height: 0.42 };

interface TorchCaps extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
}

class CameraService {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private decoder: Decoder | null = null;
  private decoderPref: DecoderPref = 'auto';
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private timer: number | null = null;
  private paused = false;
  private wakeLock: WakeLockSentinel | null = null;
  private detectListeners = new Set<DetectListener>();
  private stateListeners = new Set<StateListener>();
  private _state: CameraState = { status: 'idle' };
  private torchOn = false;
  private wanted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.release();
      else if (this.wanted && this.video) void this.start(this.video);
    });
  }

  get state() {
    return this._state;
  }

  private setState(s: CameraState) {
    this._state = s;
    for (const l of this.stateListeners) l(s);
  }

  onState(l: StateListener) {
    this.stateListeners.add(l);
    l(this._state);
    return () => this.stateListeners.delete(l);
  }

  onDetect(l: DetectListener) {
    this.detectListeners.add(l);
    return () => this.detectListeners.delete(l);
  }

  /** Inyecta detecciones simuladas (modo demostración / pruebas sin cámara). */
  inject(d: Detection[]) {
    for (const l of this.detectListeners) l(d);
  }

  setDecoderPref(p: DecoderPref) {
    if (p === this.decoderPref) return;
    this.decoderPref = p;
    this.decoder?.dispose();
    this.decoder = null;
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  async start(video: HTMLVideoElement) {
    this.wanted = true;
    this.video = video;
    if (this.stream && this.stream.active) {
      if (video.srcObject !== this.stream) {
        video.srcObject = this.stream;
        await video.play().catch(() => {});
      }
      this.loop();
      return;
    }
    if (!window.isSecureContext) {
      this.setState({ status: 'error', reason: 'insecure', message: 'La cámara necesita HTTPS. Abra la app desde su dirección https://' });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setState({ status: 'error', reason: 'unsupported', message: 'Este navegador no permite usar la cámara. Use la entrada manual o un lector externo.' });
      return;
    }
    this.setState({ status: 'starting' });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // @ts-expect-error: propiedad no estándar admitida por Chrome Android
          focusMode: { ideal: 'continuous' },
        },
      });
    } catch (e) {
      const err = e as DOMException;
      const map: Record<string, CameraState> = {
        NotAllowedError: { status: 'error', reason: 'denied', message: 'Permiso de cámara denegado.' },
        SecurityError: { status: 'error', reason: 'denied', message: 'Permiso de cámara denegado.' },
        NotFoundError: { status: 'error', reason: 'nocamera', message: 'No se ha encontrado ninguna cámara.' },
        OverconstrainedError: { status: 'error', reason: 'nocamera', message: 'No se ha encontrado una cámara compatible.' },
        NotReadableError: { status: 'error', reason: 'busy', message: 'La cámara está en uso por otra aplicación.' },
      };
      this.setState(map[err?.name] ?? { status: 'error', reason: 'other', message: `No se pudo abrir la cámara (${err?.name ?? e}).` });
      return;
    }
    video.srcObject = this.stream;
    video.setAttribute('playsinline', 'true'); // iOS: no pasar a pantalla completa
    video.muted = true;
    await video.play().catch(() => {});
    if (!this.decoder) this.decoder = await createDecoder(this.decoderPref);
    this.torchOn = false;
    this.publishRunning();
    void this.acquireWakeLock();
    this.loop();
  }

  private track(): MediaStreamTrack | undefined {
    return this.stream?.getVideoTracks()[0];
  }

  private publishRunning() {
    const t = this.track();
    const caps = (t?.getCapabilities?.() ?? {}) as TorchCaps;
    const settings = (t?.getSettings?.() ?? {}) as MediaTrackSettings & { zoom?: number };
    this.setState({
      status: 'running',
      engine: this.decoder?.name ?? '—',
      torch: !!caps.torch,
      zoom: caps.zoom && caps.zoom.max > caps.zoom.min ? { ...caps.zoom, value: settings.zoom ?? caps.zoom.min } : null,
    });
  }

  get torchActive() {
    return this.torchOn;
  }

  async setTorch(on: boolean) {
    const t = this.track();
    if (!t) return false;
    try {
      await t.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      this.torchOn = on;
      return true;
    } catch {
      return false;
    }
  }

  async setZoom(z: number) {
    const t = this.track();
    if (!t) return;
    try {
      await t.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] });
    } catch {
      /* no admitido */
    }
  }

  private async acquireWakeLock() {
    try {
      this.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      this.wakeLock = null;
    }
  }

  /** Libera la cámara (segundo plano) pero recuerda que se quiere escanear. */
  private release() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    if (this._state.status === 'running') this.setState({ status: 'idle' });
  }

  stop() {
    this.wanted = false;
    this.release();
    if (this.video) this.video.srcObject = null;
  }

  /** Calcula la región de interés en coordenadas del vídeo, teniendo en cuenta object-fit: cover. */
  private roi(v: HTMLVideoElement) {
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const ew = v.clientWidth || vw;
    const eh = v.clientHeight || vh;
    const scale = Math.max(ew / vw, eh / vh);
    const visW = ew / scale;
    const visH = eh / scale;
    const w = visW * GUIDE.width;
    const h = Math.min(visH, Math.max(visH * GUIDE.height, w * 0.35));
    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
  }

  private loop = () => {
    if (this.timer) clearTimeout(this.timer);
    const tick = async () => {
      this.timer = null;
      const v = this.video;
      if (!this.stream || !v) return;
      const started = performance.now();
      if (!this.paused && this.decoder && v.readyState >= 2 && v.videoWidth > 0) {
        const r = this.roi(v);
        // Limitamos el ancho analizado: suficiente para ITF a 30-40 cm y mucho más rápido.
        const maxW = this.decoder.name.startsWith('zxing') ? 1280 : 1600;
        const k = Math.min(1, maxW / r.w);
        this.canvas.width = Math.round(r.w * k);
        this.canvas.height = Math.round(r.h * k);
        this.ctx.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, this.canvas.width, this.canvas.height);
        try {
          const found = await this.decoder.decode(this.canvas, this.ctx);
          if (found.length) for (const l of this.detectListeners) l(found);
        } catch {
          /* fotograma no decodificable */
        }
      }
      // Cadencia adaptativa: ~10 análisis/s como máximo, menos si el dispositivo es lento.
      const spent = performance.now() - started;
      if (this.stream) this.timer = window.setTimeout(tick, Math.max(40, 100 - spent));
    };
    this.timer = window.setTimeout(tick, 50);
  };
}

export const camera = new CameraService();

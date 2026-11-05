/** Vista de cámara con marco guía horizontal, linterna, zoom y gestión de errores de permiso. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { camera, type CameraState } from '../scanner/camera';

interface Props {
  /** Texto superpuesto sobre el marco (paso actual). */
  hint?: string;
  compact?: boolean;
  onManual?: () => void;
}

const HELP: Record<string, string> = {
  denied:
    'Para activarla: Android Chrome → candado de la barra de direcciones → Permisos → Cámara → Permitir. ' +
    'iPhone → Ajustes → Safari → Cámara → Permitir (o "aA" → Ajustes del sitio web). Si la app está instalada, borre y vuelva a conceder el permiso desde los ajustes del sistema.',
  insecure: 'Abra la app desde una dirección https:// (GitHub Pages, Netlify o Vercel ya lo son).',
  busy: 'Cierre otras apps que usen la cámara (cámara, WhatsApp, Teams…) y pulse Reintentar.',
};

export function ScannerView({ hint, compact, onManual }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [st, setSt] = useState<CameraState>(camera.state);
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    const off = camera.onState(setSt);
    if (videoRef.current) void camera.start(videoRef.current);
    return () => {
      off();
    };
  }, []);

  const toggleTorch = async () => {
    const ok = await camera.setTorch(!torch);
    if (ok) setTorch(!torch);
  };

  const err = st.status === 'error' ? st : null;

  return (
    <div class={`scanner ${compact ? 'scanner--compact' : ''}`}>
      <video ref={videoRef} playsInline muted autoplay aria-label="Vista de la cámara" />
      {!err && (
        <div class="guide" aria-hidden="true">
          <span class="guide__laser" />
        </div>
      )}
      {hint && !err && <div class="scanner__hint">{hint}</div>}
      {st.status === 'starting' && <div class="scanner__msg">Abriendo cámara…</div>}
      {st.status === 'idle' && (
        <div class="scanner__msg">
          <button class="btn" onClick={() => videoRef.current && camera.start(videoRef.current)}>
            Activar cámara
          </button>
        </div>
      )}
      {err && (
        <div class="scanner__error" role="alert">
          <strong>📷 {err.message}</strong>
          {HELP[err.reason] && <p>{HELP[err.reason]}</p>}
          <div class="row">
            <button class="btn" onClick={() => videoRef.current && camera.start(videoRef.current)}>
              Reintentar
            </button>
            {onManual && (
              <button class="btn btn--primary" onClick={onManual}>
                ⌨ Entrada manual
              </button>
            )}
          </div>
        </div>
      )}
      {st.status === 'running' && (
        <div class="scanner__tools">
          {st.torch && (
            <button class={`iconbtn ${torch ? 'iconbtn--on' : ''}`} onClick={toggleTorch} aria-pressed={torch} aria-label="Linterna">
              🔦
            </button>
          )}
          {st.zoom && (
            <input
              class="zoom"
              type="range"
              aria-label="Zoom"
              min={st.zoom.min}
              max={Math.min(st.zoom.max, st.zoom.min + 7)}
              step={st.zoom.step || 0.1}
              defaultValue={String(st.zoom.value)}
              onInput={(e) => camera.setZoom(parseFloat((e.target as HTMLInputElement).value))}
            />
          )}
          <span class="engine">{st.engine}</span>
        </div>
      )}
    </div>
  );
}

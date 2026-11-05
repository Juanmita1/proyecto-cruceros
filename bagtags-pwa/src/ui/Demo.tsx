/**
 * Modo demostración:
 *  - Muestra en pantalla resguardos, etiquetas y tarjetas de embarque de
 *    ejemplo, para escanearlos con otro móvil (o imprimirlos).
 *  - "Simulador": inyecta las lecturas en la pantalla de control sin cámara.
 */
import { useEffect, useState } from 'preact/hooks';
import { getState, navigate, setState, useApp } from '../app/store';
import * as A from '../app/actions';
import { demoScenarios, type DemoScenario } from '../demo/scenarios';
import { barcodeSvg } from '../demo/barcode';

function Barcode({ text, format, label }: { text: string; format: 'ITF' | 'PDF417' | 'QRCode' | 'Aztec'; label?: string }) {
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    barcodeSvg(text, format).then(setSvg, (e) => setErr(String(e)));
  }, [text, format]);
  return (
    <figure class={`barcode barcode--${format}`}>
      {svg ? <div class="barcode__svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <div class="barcode__svg muted">{err || 'Generando…'}</div>}
      <figcaption>{label ?? text}</figcaption>
    </figure>
  );
}

export function Demo() {
  const { shift } = useApp();
  const [sc] = useState(demoScenarios);
  const [bpFormat, setBpFormat] = useState<'PDF417' | 'QRCode' | 'Aztec'>('PDF417');

  const startSim = async () => {
    if (!getState().shift || getState().shift?.endedAt) {
      await A.startShift({ guardId: 'DEMO', airport: 'MAD', terminal: 'T4S', post: 'Demostración', flights: ['IB3167'], startedAt: Date.now() });
    }
    setState({ demoSim: true });
    navigate({ name: 'control' });
  };

  return (
    <div class="screen screen--form">
      <header class="topbar">
        <button class="iconbtn" onClick={() => navigate({ name: shift && !shift.endedAt ? 'control' : 'start' })} aria-label="Volver">
          ←
        </button>
        <div class="topbar__title">
          <strong>Demostración</strong>
          <span>Códigos ficticios de prueba</span>
        </div>
      </header>
      <div class="form">
        <p>
          Abra esta página en otro dispositivo (o imprímala) y escanee los códigos con la app. Orden: primero los <strong>resguardos</strong> (o la tarjeta de embarque), pulse{' '}
          <strong>MALETAS →</strong> y escanee las <strong>etiquetas</strong>.
        </p>
        <button class="btn btn--lg btn--primary" onClick={startSim}>
          ▶ Usar el simulador en la pantalla de control (sin cámara)
        </button>
        <div class="row">
          <span>Formato BCBP:</span>
          {(['PDF417', 'QRCode', 'Aztec'] as const).map((f) => (
            <button key={f} class={`chipbtn ${bpFormat === f ? 'chipbtn--on' : ''}`} onClick={() => setBpFormat(f)}>
              {f}
            </button>
          ))}
        </div>
        {sc.map((s) => (
          <section class="demo" key={s.id}>
            <h3>{s.title}</h3>
            <p class="muted">Resultado esperado: {s.expected}</p>
            {s.bcbp && (
              <>
                <h4>Tarjeta de embarque (BCBP)</h4>
                <Barcode text={s.bcbp} format={bpFormat} label="EJEMPLO/PASAJERO · IB3167 LHR→MAD" />
              </>
            )}
            {s.claims.length > 0 && <h4>Resguardos (tarjeta de embarque)</h4>}
            <div class="demo__grid">
              {s.claims.map((c, i) => (
                <Barcode key={c} text={c} format="ITF" label={`${c} · ${s.claimsAlpha[i]}`} />
              ))}
            </div>
            <h4>Etiquetas de maleta</h4>
            <div class="demo__grid">
              {s.bags.map((b) => (
                <Barcode key={b} text={b} format="ITF" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Panel del simulador que aparece en la pantalla de control. */
export function DemoDrawer() {
  const { pass } = useApp();
  const [open, setOpen] = useState(true);
  const [sc] = useState(demoScenarios);
  const send = (t: string) => A.handleInput(t, 'demo');
  if (!open)
    return (
      <button class="demo-fab" onClick={() => setOpen(true)}>
        🧪
      </button>
    );
  return (
    <div class="demo-drawer">
      <div class="row">
        <strong>Simulador</strong>
        <button class="iconbtn" onClick={() => setOpen(false)} aria-label="Ocultar">
          ▾
        </button>
        <button class="iconbtn" onClick={() => setState({ demoSim: false })} aria-label="Salir del simulador">
          ✕
        </button>
      </div>
      <div class="demo-drawer__list">
        {sc.map((s: DemoScenario) => (
          <div key={s.id} class="demo-drawer__sc">
            <span>{s.title}</span>
            {pass.step === 'claims'
              ? [
                  ...(s.bcbp ? [<button key="bp" class="chipbtn" onClick={() => send(s.bcbp!)}>BCBP</button>] : []),
                  ...s.claims.map((c, i) => (
                    <button key={c} class="chipbtn" onClick={() => send(c)}>
                      R{i + 1}
                    </button>
                  )),
                ]
              : s.bags.map((b, i) => (
                  <button key={b} class="chipbtn" onClick={() => send(b)}>
                    M{i + 1}
                  </button>
                ))}
          </div>
        ))}
      </div>
    </div>
  );
}

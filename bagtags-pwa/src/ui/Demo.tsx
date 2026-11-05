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
  const { prefs } = useApp();
  const [sc] = useState(demoScenarios);
  const [bpFormat, setBpFormat] = useState<'PDF417' | 'QRCode' | 'Aztec'>('PDF417');

  const startSim = async () => {
    setState({ demoSim: true });
    if (!getState().prefs.guard) return void A.saveGuard({ guardId: 'DEMO', airport: 'MAD', terminal: 'T4S', post: 'Cinta 7' });
    if (getState().ticket?.status !== 'open') await A.nextTicket();
    else navigate({ name: 'ticket' });
  };

  return (
    <div class="screen screen--form">
      <header class="topbar">
        <button class="iconbtn" onClick={() => navigate({ name: prefs.guard ? 'ticket' : 'guard' })} aria-label="Volver">
          ←
        </button>
        <div class="topbar__title">
          <strong>Demostración</strong>
          <span>Códigos ficticios de prueba</span>
        </div>
      </header>
      <div class="form">
        <p>
          Abra esta página en otro dispositivo (o imprímala) y escanee los códigos con la app: primero los <strong>resguardos</strong> (o la tarjeta de embarque), pulse{' '}
          <strong>VIGILAR CINTA →</strong> y escanee las <strong>maletas de la cinta</strong> en orden.
        </p>
        <button class="btn btn--lg btn--primary" onClick={startSim}>
          ▶ Usar el simulador (sin cámara)
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
            <h4>Maletas que pasan por la cinta (en orden)</h4>
            <div class="demo__grid">
              {s.belt.map((b, i) => (
                <Barcode key={b} text={b} format="ITF" label={`${i + 1}. ${b}`} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Panel del simulador que aparece en la pantalla del ticket. */
export function DemoDrawer() {
  const { step } = useApp();
  const [open, setOpen] = useState(true);
  const [sc] = useState(demoScenarios);
  const send = (t: string) => A.handleInput(t, 'demo');
  if (!open)
    return (
      <button class="demo-fab" onClick={() => setOpen(true)} aria-label="Mostrar simulador">
        🧪
      </button>
    );
  return (
    <div class="demo-drawer">
      <div class="row">
        <strong>Simulador · {step === 'claims' ? 'resguardos' : 'cinta'}</strong>
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
            {step === 'claims'
              ? [
                  ...(s.bcbp
                    ? [
                        <button key="bp" class="chipbtn" onClick={() => send(s.bcbp!)}>
                          BCBP
                        </button>,
                      ]
                    : []),
                  ...s.claims.map((c, i) => (
                    <button key={c} class="chipbtn" onClick={() => send(c)}>
                      R{i + 1}
                    </button>
                  )),
                ]
              : s.belt.map((b, i) => (
                  <button key={b} class="chipbtn" onClick={() => send(b)} title={b}>
                    {i + 1}
                  </button>
                ))}
          </div>
        ))}
      </div>
    </div>
  );
}

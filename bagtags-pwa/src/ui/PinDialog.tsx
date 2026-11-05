/** Diálogo de PIN de supervisor con teclado grande. */
import { useState } from 'preact/hooks';
import { useApp } from '../app/store';
import { checkPin } from '../storage/pin';

export function PinDialog() {
  const { pinRequest, config } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  if (!pinRequest) return null;

  const submit = async (p: string) => {
    if (await checkPin(p, config)) {
      setPin('');
      setError(false);
      pinRequest.resolve(true);
    } else {
      setError(true);
      setPin('');
    }
  };

  const press = (k: string) => {
    setError(false);
    const p = (pin + k).slice(0, 8);
    setPin(p);
  };

  return (
    <div class="sheet sheet--center" role="dialog" aria-modal="true" aria-label="PIN de supervisor">
      <div class="sheet__head">
        <h2>🔑 {pinRequest.reason}</h2>
      </div>
      <div class={`manual__display ${error ? 'text-bad' : ''}`} aria-live="polite">
        {error ? 'PIN incorrecto' : pin.replace(/./g, '●') || <span class="muted">PIN de supervisor</span>}
      </div>
      <div class="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <button key={k} onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button
          onClick={() => {
            setPin('');
            pinRequest.resolve(false);
          }}
          aria-label="Cancelar"
        >
          ✕
        </button>
        <button onClick={() => press('0')}>0</button>
        <button class="keypad__ok" disabled={pin.length < 4} onClick={() => submit(pin)}>
          OK
        </button>
      </div>
    </div>
  );
}

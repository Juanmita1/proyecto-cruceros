/**
 * Entrada manual con teclado numérico grande (usable con guantes) y
 * botones rápidos de aerolínea para el formato "IB 123456".
 */
import { useMemo, useState } from 'preact/hooks';
import { parseTag, formatTag, formatAlpha } from '../domain/lpn';
import { useApp } from '../app/store';

interface Props {
  title: string;
  onSubmit: (raw: string) => boolean;
  onClose: () => void;
}

const QUICK = ['IB', 'UX', 'VY', 'I2', 'FR', 'BA', 'LH', 'AF'];

export function ManualEntry({ title, onSubmit, onClose }: Props) {
  const { airlines } = useApp();
  const [prefix, setPrefix] = useState('');
  const [digits, setDigits] = useState('');
  const [text, setText] = useState<string | null>(null); // modo teclado del sistema

  const raw = text ?? (prefix ? `${prefix} ${digits}` : digits);
  const parsed = useMemo(() => (raw.trim() ? parseTag(raw, airlines, 'manual') : null), [raw, airlines]);
  const quick = QUICK.filter((q) => airlines.byIata.has(q)).slice(0, 6);
  const max = prefix ? 6 : 10;

  const press = (k: string) => setDigits((d) => (d.length < max ? d + k : d));
  const submit = () => {
    if (!parsed?.ok) return;
    if (onSubmit(raw)) {
      setDigits('');
      setPrefix('');
      setText(null);
    }
  };

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div class="sheet__head">
        <h2>{title}</h2>
        <button class="iconbtn" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>

      {text === null ? (
        <>
          <div class="manual__display" aria-live="polite">
            {prefix && <span class="manual__prefix">{prefix}</span>}
            <span>{digits || <span class="muted">{prefix ? '6 dígitos' : '10 dígitos'}</span>}</span>
          </div>
          <div class="manual__quick">
            {quick.map((q) => (
              <button
                key={q}
                class={`chipbtn ${prefix === q ? 'chipbtn--on' : ''}`}
                onClick={() => {
                  setPrefix(prefix === q ? '' : q);
                  setDigits((d) => d.slice(-6));
                }}
              >
                {q}
              </button>
            ))}
            <button class="chipbtn" onClick={() => setText(raw)}>
              ABC
            </button>
          </div>
          <div class="keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
              <button key={k} onClick={() => press(k)}>
                {k}
              </button>
            ))}
            <button onClick={() => setDigits((d) => d.slice(0, -1))} aria-label="Borrar">
              ⌫
            </button>
            <button onClick={() => press('0')}>0</button>
            <button class="keypad__ok" disabled={!parsed?.ok} onClick={submit}>
              OK
            </button>
          </div>
        </>
      ) : (
        <form
          class="stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            class="input input--big"
            value={text}
            autoFocus
            autocomplete="off"
            autocapitalize="characters"
            placeholder="IB 123456 o 0075123456"
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
          />
          <div class="row">
            <button type="button" class="btn" onClick={() => setText(null)}>
              123 Teclado numérico
            </button>
            <button class="btn btn--primary" disabled={!parsed?.ok}>
              Aceptar
            </button>
          </div>
        </form>
      )}

      <p class={`manual__info ${parsed && !parsed.ok ? 'text-bad' : ''}`}>
        {parsed == null
          ? 'Teclee los 10 dígitos, o elija la aerolínea y los 6 dígitos de serie. 9 dígitos = aerolínea + serie (etiqueta dañada).'
          : parsed.ok
            ? `→ ${formatTag(parsed.code)}  (${formatAlpha(parsed.code)})${parsed.code.assumedType ? ' · tipo supuesto 0' : ''}${parsed.code.lpn ? '' : ' · requerirá validación manual'}`
            : parsed.error}
      </p>
    </div>
  );
}

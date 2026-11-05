/**
 * Receptor para lectores de códigos Bluetooth/USB en modo teclado (HID).
 * Un campo con foco permanente y `inputmode="none"` (no abre el teclado
 * virtual) recibe la lectura y la entrega al pulsar Enter.
 */
import { useEffect, useRef } from 'preact/hooks';

interface Props {
  onScan: (text: string) => void;
  /** Mientras esté desactivado (p. ej. con un diálogo abierto) no recupera el foco. */
  active: boolean;
}

export function KeyboardWedge({ onScan, active }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!active) return;
    const focus = () => {
      const a = document.activeElement as HTMLElement | null;
      // No robar el foco a otros campos de texto.
      if (a && a !== ref.current && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
      ref.current?.focus({ preventScroll: true });
    };
    focus();
    const id = window.setInterval(focus, 1500);
    document.addEventListener('click', focus);
    return () => {
      clearInterval(id);
      document.removeEventListener('click', focus);
    };
  }, [active]);

  return (
    <input
      ref={ref}
      class="wedge"
      inputMode="none"
      autocomplete="off"
      autocapitalize="off"
      spellcheck={false}
      aria-label="Lector de códigos externo"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const el = e.currentTarget;
          const v = el.value.trim();
          el.value = '';
          if (v) onScan(v);
        }
      }}
    />
  );
}

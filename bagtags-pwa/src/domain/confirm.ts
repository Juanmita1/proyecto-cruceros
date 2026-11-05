/**
 * Confirmación por doble lectura.
 *
 * El ITF (Interleaved 2 of 5) no tiene dígito de control obligatorio y con
 * etiquetas arrugadas o reflejos puede devolver lecturas erróneas puntuales.
 * Un código solo se acepta cuando se ha leído N veces (por defecto 2) de forma
 * idéntica dentro de una ventana corta de tiempo.
 *
 * Además evita aceptar el mismo código una y otra vez mientras sigue delante
 * de la cámara: tras aceptarlo, se ignora hasta que deja de verse durante
 * `holdMs`. Si después vuelve a aparecer se considera una lectura nueva e
 * intencionada (p. ej. el vigilante enfoca ahora la maleta con el mismo LPN).
 */
export interface ConfirmOptions {
  /** Lecturas idénticas necesarias (1 = sin confirmación). */
  required: number;
  /** Tiempo máximo entre dos lecturas para considerarlas consecutivas. */
  windowMs: number;
  /** Tiempo sin ver un código aceptado tras el que se puede volver a aceptar. */
  holdMs: number;
}

interface Entry {
  count: number;
  lastSeen: number;
  accepted: boolean;
}

export class ReadConfirmer {
  private entries = new Map<string, Entry>();
  constructor(private opts: ConfirmOptions = { required: 2, windowMs: 1200, holdMs: 1500 }) {}

  setOptions(opts: Partial<ConfirmOptions>) {
    this.opts = { ...this.opts, ...opts };
  }

  /**
   * Registra una lectura. Devuelve true si en este momento queda aceptada.
   * @param required permite exigir menos lecturas a los códigos 2D (con corrección de errores).
   */
  push(text: string, now: number, required = this.opts.required): boolean {
    this.gc(now);
    const e = this.entries.get(text);
    if (!e) {
      const accepted = required <= 1;
      this.entries.set(text, { count: 1, lastSeen: now, accepted });
      return accepted;
    }
    const gap = now - e.lastSeen;
    e.lastSeen = now;
    if (e.accepted) return false; // sigue a la vista: ya aceptado
    e.count = gap <= this.opts.windowMs ? e.count + 1 : 1;
    if (e.count >= required) {
      e.accepted = true;
      return true;
    }
    return false;
  }

  /** Olvida un código (p. ej. al reiniciar el flujo para el siguiente pasajero). */
  forget(text?: string) {
    if (text === undefined) this.entries.clear();
    else this.entries.delete(text);
  }

  private gc(now: number) {
    for (const [k, e] of this.entries) {
      const limit = e.accepted ? this.opts.holdMs : Math.max(this.opts.windowMs, this.opts.holdMs);
      if (now - e.lastSeen > limit) this.entries.delete(k);
    }
  }
}

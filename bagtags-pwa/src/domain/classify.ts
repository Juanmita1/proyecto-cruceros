/** Clasifica una lectura (cámara, teclado o lector BT) en etiqueta LPN, tarjeta de embarque o lectura no válida. */
import type { AirlineIndex } from './airlines';
import { parseBcbp, looksLikeBcbp, type BcbpData } from './bcbp';
import { parseTag, type CodeSource, type TagCode } from './lpn';

export type Classified =
  | { kind: 'tag'; code: TagCode }
  | { kind: 'bcbp'; data: BcbpData }
  | { kind: 'invalid'; error: string; raw: string };

/** Formatos lineales: requieren doble lectura. */
export const LINEAR_FORMATS = new Set(['ITF', 'Code128', 'itf', 'code_128']);

export function classify(raw: string, airlines: AirlineIndex, source: CodeSource, now = new Date()): Classified {
  const text = raw.replace(/[\r\n]+$/, '');
  if (looksLikeBcbp(text)) {
    const r = parseBcbp(text, now);
    return r.ok ? { kind: 'bcbp', data: r.data } : { kind: 'invalid', error: r.error, raw };
  }
  const t = parseTag(text, airlines, source);
  return t.ok ? { kind: 'tag', code: t.code } : { kind: 'invalid', error: t.error, raw };
}

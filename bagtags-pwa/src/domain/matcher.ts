/**
 * Lógica de comparación maleta ↔ resguardos de un pasajero.
 *
 * Reglas:
 *  - Coincidencia exacta: los 10 dígitos del LPN son iguales.
 *  - Coincidencia parcial: coinciden aerolínea + 6 dígitos de serie (clave de
 *    9 dígitos) pero falta o difiere el dígito de tipo. Ocurre con etiquetas
 *    dañadas, entrada manual "IB 123456" o lecturas incompletas. Requiere
 *    confirmación visual del vigilante → queda marcada como "validación manual".
 *  - Sin coincidencia: ningún resguardo comparte la clave.
 *  - Ya controlada: la maleta se verificó antes en este turno.
 */
import type { TagCode } from './lpn';
import { tagId } from './lpn';

export type BagStatus = 'match' | 'partial' | 'manual' | 'nomatch' | 'already';

export type Outcome = 'ok' | 'mismatch' | 'incomplete' | 'already';

/** Resultado almacenado. `incomplete_confirmed` = INCOMPLETO validado por el vigilante. */
export type ControlResult = Outcome | 'incomplete_confirmed';

export interface BagEval {
  code: TagCode;
  status: BagStatus;
  /** Índice del resguardo con el que coincide (match/partial/manual). */
  claimIndex?: number;
  /** Hora (epoch ms) del control anterior si status = already. */
  alreadyAt?: number;
}

export interface MatchResult {
  status: 'match' | 'partial' | 'nomatch';
  claimIndex?: number;
}

/** Busca el resguardo de una maleta. Prefiere resguardos aún no usados y coincidencias exactas. */
export function matchBag(bag: TagCode, claims: TagCode[], used: ReadonlySet<number> = new Set()): MatchResult {
  const order = claims.map((_, i) => i).sort((a, b) => Number(used.has(a)) - Number(used.has(b)));
  for (const i of order) {
    const c = claims[i];
    if (bag.lpn && c.lpn && bag.lpn === c.lpn) return { status: 'match', claimIndex: i };
  }
  for (const i of order) {
    if (claims[i].key === bag.key) return { status: 'partial', claimIndex: i };
  }
  return { status: 'nomatch' };
}

/** Índices de resguardos ya emparejados con alguna maleta (exacta o validada). */
export function usedClaims(bags: BagEval[]): Set<number> {
  const s = new Set<number>();
  for (const b of bags) {
    if ((b.status === 'match' || b.status === 'manual' || b.status === 'partial') && b.claimIndex !== undefined) s.add(b.claimIndex);
  }
  return s;
}

/** true si un código ya está en la lista (misma clave de 9 dígitos). */
export function containsCode(list: TagCode[], code: TagCode): boolean {
  return list.some((c) => c.key === code.key && (c.lpn === code.lpn || !c.lpn || !code.lpn));
}

/**
 * Resultado global del pasajero. Prioridad: NO COINCIDE > YA CONTROLADA > INCOMPLETO > CORRECTO.
 * Devuelve null mientras quede alguna coincidencia parcial pendiente de confirmar.
 */
export function computeOutcome(claims: TagCode[], bags: BagEval[]): Outcome | null {
  if (bags.some((b) => b.status === 'partial')) return null;
  if (bags.some((b) => b.status === 'nomatch')) return 'mismatch';
  if (bags.some((b) => b.status === 'already')) return 'already';
  if (bags.length === 0 || claims.length === 0) return 'incomplete';
  const used = usedClaims(bags);
  if (claims.some((_, i) => !used.has(i))) return 'incomplete';
  return 'ok';
}

/** Resguardos sin maleta escaneada. */
export function pendingClaims(claims: TagCode[], bags: BagEval[]): TagCode[] {
  const used = usedClaims(bags);
  return claims.filter((_, i) => !used.has(i));
}

/**
 * ¿Se puede cerrar ya el pasajero sin que el vigilante pulse "Finalizar"?
 * Sí si hay una maleta que no coincide, una ya controlada, o si todos los
 * resguardos tienen maleta.
 */
export function shouldAutoFinish(claims: TagCode[], bags: BagEval[]): boolean {
  if (bags.some((b) => b.status === 'partial')) return false;
  if (bags.some((b) => b.status === 'nomatch' || b.status === 'already')) return true;
  return claims.length > 0 && pendingClaims(claims, bags).length === 0;
}

/**
 * Registro de maletas ya verificadas en el turno, indexado por la clave de
 * 9 dígitos para detectar también repeticiones con lectura parcial.
 */
export class SeenRegistry {
  private byKey = new Map<string, { ts: number; id: string }>();

  add(code: Pick<TagCode, 'key' | 'lpn'>, ts: number) {
    const prev = this.byKey.get(code.key);
    if (!prev || prev.ts > ts) this.byKey.set(code.key, { ts, id: tagId(code) });
  }

  addId(id: string, ts: number) {
    if (/^\d{10}$/.test(id)) this.add({ key: id.slice(1), lpn: id }, ts);
    else if (/^\d{9}$/.test(id)) this.add({ key: id, lpn: null }, ts);
  }

  get(code: Pick<TagCode, 'key'>): number | undefined {
    return this.byKey.get(code.key)?.ts;
  }

  clear() {
    this.byKey.clear();
  }

  get size() {
    return this.byKey.size;
  }
}

/** Evalúa una maleta nueva en el contexto del pasajero actual. */
export function evaluateBag(bag: TagCode, claims: TagCode[], prevBags: BagEval[], seen: SeenRegistry): BagEval {
  const at = seen.get(bag);
  if (at !== undefined) return { code: bag, status: 'already', alreadyAt: at };
  const m = matchBag(bag, claims, usedClaims(prevBags));
  return { code: bag, status: m.status, claimIndex: m.claimIndex };
}

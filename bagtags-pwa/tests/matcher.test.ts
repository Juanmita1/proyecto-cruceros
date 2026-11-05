import { describe, expect, it } from 'vitest';
import { buildAirlineIndex, DEFAULT_AIRLINES } from '../src/domain/airlines';
import { parseTag, type TagCode } from '../src/domain/lpn';
import { computeOutcome, evaluateBag, matchBag, pendingClaims, SeenRegistry, shouldAutoFinish, type BagEval } from '../src/domain/matcher';
import { SAMPLE } from './samples';

const idx = buildAirlineIndex(DEFAULT_AIRLINES);
const t = (raw: string, src: 'camera' | 'manual' = 'camera'): TagCode => {
  const r = parseTag(raw, idx, src);
  if (!r.ok) throw new Error(r.error);
  return r.code;
};

describe('matchBag', () => {
  it('coincidencia exacta', () => {
    expect(matchBag(t(SAMPLE.ib1), [t(SAMPLE.ux1), t(SAMPLE.ib1)])).toEqual({ status: 'match', claimIndex: 1 });
  });
  it('sin coincidencia', () => {
    expect(matchBag(t(SAMPLE.vy1), [t(SAMPLE.ib1)]).status).toBe('nomatch');
  });
  it('parcial si solo difiere el dígito de tipo', () => {
    expect(matchBag(t(SAMPLE.ib1Fallback), [t(SAMPLE.ib1)])).toEqual({ status: 'partial', claimIndex: 0 });
  });
  it('parcial con entrada manual de 9 dígitos', () => {
    expect(matchBag(t('075123456', 'manual'), [t(SAMPLE.ib1)]).status).toBe('partial');
  });
  it('alfanumérico convertido coincide exactamente con tipo 0', () => {
    expect(matchBag(t(SAMPLE.ib1), [t('IB 123456', 'manual')]).status).toBe('match');
  });
  it('prefiere resguardos no usados', () => {
    const claims = [t(SAMPLE.ib1), t('IB 123456', 'manual')];
    expect(matchBag(t(SAMPLE.ib1), claims, new Set([0])).claimIndex).toBe(1);
  });
});

describe('computeOutcome', () => {
  const claims = [t(SAMPLE.ib1), t(SAMPLE.ib2)];
  const seen = new SeenRegistry();
  const run = (bags: string[]) => {
    const evals: BagEval[] = [];
    for (const b of bags) evals.push(evaluateBag(t(b), claims, evals, seen));
    return evals;
  };

  it('CORRECTO cuando todas las maletas tienen resguardo', () => {
    const bags = run([SAMPLE.ib2, SAMPLE.ib1]);
    expect(computeOutcome(claims, bags)).toBe('ok');
    expect(shouldAutoFinish(claims, bags)).toBe(true);
  });
  it('INCOMPLETO cuando falta una maleta', () => {
    const bags = run([SAMPLE.ib1]);
    expect(computeOutcome(claims, bags)).toBe('incomplete');
    expect(pendingClaims(claims, bags).map((c) => c.lpn)).toEqual([SAMPLE.ib2]);
    expect(shouldAutoFinish(claims, bags)).toBe(false);
  });
  it('INCOMPLETO sin maletas o sin resguardos', () => {
    expect(computeOutcome(claims, [])).toBe('incomplete');
    expect(computeOutcome([], [])).toBe('incomplete');
  });
  it('NO COINCIDE tiene prioridad', () => {
    const bags = run([SAMPLE.ib1, SAMPLE.vy1]);
    expect(computeOutcome(claims, bags)).toBe('mismatch');
    expect(shouldAutoFinish(claims, bags)).toBe(true);
  });
  it('pendiente (null) mientras haya una parcial sin confirmar', () => {
    const bags = run([SAMPLE.ib1Fallback]);
    expect(bags[0].status).toBe('partial');
    expect(computeOutcome(claims, bags)).toBeNull();
    expect(shouldAutoFinish(claims, bags)).toBe(false);
    bags[0].status = 'manual';
    expect(computeOutcome(claims, bags)).toBe('incomplete');
  });
  it('YA CONTROLADA si la maleta se verificó antes en el turno', () => {
    const s = new SeenRegistry();
    s.add(t(SAMPLE.ib1), 1000);
    const e = evaluateBag(t(SAMPLE.ib1Fallback), claims, [], s);
    expect(e).toMatchObject({ status: 'already', alreadyAt: 1000 });
    expect(computeOutcome(claims, [e])).toBe('already');
  });
  it('SeenRegistry conserva la primera hora', () => {
    const s = new SeenRegistry();
    s.addId(SAMPLE.ib1, 2000);
    s.addId(SAMPLE.ib1, 1000);
    s.addId(SAMPLE.ib1, 3000);
    expect(s.get(t(SAMPLE.ib1))).toBe(1000);
  });
});

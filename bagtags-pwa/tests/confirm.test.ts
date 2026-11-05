import { describe, expect, it } from 'vitest';
import { ReadConfirmer } from '../src/domain/confirm';

describe('ReadConfirmer', () => {
  it('exige dos lecturas idénticas dentro de la ventana', () => {
    const c = new ReadConfirmer({ required: 2, windowMs: 1000, holdMs: 1500 });
    expect(c.push('A', 0)).toBe(false);
    expect(c.push('A', 300)).toBe(true);
  });
  it('no acepta si la segunda lectura llega tarde', () => {
    const c = new ReadConfirmer({ required: 2, windowMs: 1000, holdMs: 1500 });
    expect(c.push('A', 0)).toBe(false);
    expect(c.push('A', 1200)).toBe(false);
    expect(c.push('A', 1500)).toBe(true);
  });
  it('una lectura errónea distinta no se acepta sola', () => {
    const c = new ReadConfirmer({ required: 2, windowMs: 1000, holdMs: 1500 });
    c.push('0075123456', 0);
    expect(c.push('0075123458', 100)).toBe(false);
    expect(c.push('0075123456', 200)).toBe(true);
  });
  it('no repite la aceptación mientras el código sigue a la vista', () => {
    const c = new ReadConfirmer({ required: 2, windowMs: 1000, holdMs: 1500 });
    c.push('A', 0);
    expect(c.push('A', 100)).toBe(true);
    for (let t = 200; t < 5000; t += 200) expect(c.push('A', t)).toBe(false);
    // Deja de verse más de holdMs → vuelve a ser una lectura nueva
    expect(c.push('A', 7000)).toBe(false);
    expect(c.push('A', 7100)).toBe(true);
  });
  it('required = 1 para códigos 2D', () => {
    const c = new ReadConfirmer();
    expect(c.push('QR', 0, 1)).toBe(true);
    expect(c.push('QR', 10, 1)).toBe(false);
  });
  it('forget permite volver a aceptar inmediatamente', () => {
    const c = new ReadConfirmer({ required: 1, windowMs: 1000, holdMs: 1500 });
    expect(c.push('A', 0)).toBe(true);
    c.forget();
    expect(c.push('A', 10)).toBe(true);
  });
});

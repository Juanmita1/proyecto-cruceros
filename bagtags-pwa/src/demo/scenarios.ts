/**
 * Escenarios de demostración con códigos FICTICIOS para probar sin maletas reales.
 */
import { buildBcbp } from '../domain/bcbp';

export interface DemoScenario {
  id: string;
  title: string;
  expected: string;
  claims: string[];
  /** Texto impreso junto al resguardo (formato alfanumérico). */
  claimsAlpha: string[];
  bags: string[];
  bcbp?: string;
}

function julianToday(): number {
  const d = new Date();
  const start = Date.UTC(d.getFullYear(), 0, 0);
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000);
}

export function demoScenarios(): DemoScenario[] {
  return [
    {
      id: 'ok2',
      title: 'Pasajero con 2 maletas',
      expected: 'CORRECTO',
      claims: ['0075123456', '0075123457'],
      claimsAlpha: ['IB 123456', 'IB 123457'],
      bags: ['0075123456', '0075123457'],
    },
    {
      id: 'mismatch',
      title: 'Maleta de otro pasajero',
      expected: 'NO COINCIDE',
      claims: ['0996654321'],
      claimsAlpha: ['UX 654321'],
      bags: ['0030111222'],
    },
    {
      id: 'incomplete',
      title: 'Espera una segunda maleta',
      expected: 'INCOMPLETO',
      claims: ['0075200001', '0075200002'],
      claimsAlpha: ['IB 200001', 'IB 200002'],
      bags: ['0075200001'],
    },
    {
      id: 'partial',
      title: 'Etiqueta de reserva (fallback, tipo 1)',
      expected: 'COMPROBAR → validación manual',
      claims: ['0075300001'],
      claimsAlpha: ['IB 300001'],
      bags: ['1075300001'],
    },
    {
      id: 'bcbp',
      title: 'Tarjeta de embarque con LPN en el BCBP',
      expected: 'CORRECTO (vuelo IB3167 asociado)',
      claims: [],
      claimsAlpha: [],
      bags: ['0075400001', '0075400002'],
      bcbp: buildBcbp({
        name: 'EJEMPLO/PASAJERO',
        pnr: 'DEMO12',
        from: 'LHR',
        to: 'MAD',
        carrier: 'IB',
        flight: '3167',
        julian: julianToday(),
        seat: '023C',
        seq: 42,
        bagTags: ['0075400001001'],
      }),
    },
  ];
}

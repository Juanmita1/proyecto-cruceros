/**
 * Escenarios de demostración con códigos FICTICIOS para probar sin maletas reales.
 * `belt` es el orden en que las maletas pasan por la cinta (mezcla de ajenas y del pasajero).
 */
import { buildBcbp } from '../domain/bcbp';

export interface DemoScenario {
  id: string;
  title: string;
  expected: string;
  claims: string[];
  /** Texto impreso junto al resguardo (formato alfanumérico). */
  claimsAlpha: string[];
  belt: string[];
  bcbp?: string;
}

function julianToday(): number {
  const d = new Date();
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
}

export function demoScenarios(): DemoScenario[] {
  return [
    {
      id: 'ok2',
      title: 'Pasajero con 2 maletas',
      expected: 'TODO OK (se cierra solo al salir la segunda)',
      claims: ['0075123456', '0075123457'],
      claimsAlpha: ['IB 123456', 'IB 123457'],
      belt: ['0996654321', '0030111222', '0075123456', '0220998877', '0075123457'],
    },
    {
      id: 'missing',
      title: 'Una maleta no aparece',
      expected: 'FALTA 1 MALETA (cerrar ticket al terminar la cinta)',
      claims: ['0075200001', '0075200002'],
      claimsAlpha: ['IB 200001', 'IB 200002'],
      belt: ['0030111223', '0075200001', '0996000111', '0224555666'],
    },
    {
      id: 'partial',
      title: 'Etiqueta de reserva (fallback, tipo 1)',
      expected: '¿ES SUYA? → confirmación manual → TODO OK',
      claims: ['0075300001'],
      claimsAlpha: ['IB 300001'],
      belt: ['0057444555', '1075300001'],
    },
    {
      id: 'bcbp',
      title: 'Tarjeta de embarque con LPN en el BCBP',
      expected: 'TODO OK con vuelo IB3167 y datos del pasajero',
      claims: [],
      claimsAlpha: [],
      belt: ['0125777888', '0075400002', '0075400001'],
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

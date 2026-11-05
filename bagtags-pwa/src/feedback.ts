/**
 * Sonido y vibración distintos por resultado. Los tonos se generan con
 * WebAudio (sin ficheros de audio). iOS exige desbloquear el audio con un
 * toque del usuario: `unlockAudio()` se llama en el primer toque.
 * La vibración (navigator.vibrate) no existe en iOS Safari.
 */
/**
 * scan     resguardo leído
 * match    ¡ES SUYA! (maleta del pasajero en la cinta)
 * nomatch  NO ES SUYA (breve: en la cinta pasan muchas)
 * repeat   maleta ya recogida antes
 * partial  hay que comprobar a mano
 * ok       todas las maletas recogidas
 * missing  ticket cerrado con maletas sin aparecer
 */
export type Cue = 'scan' | 'match' | 'nomatch' | 'repeat' | 'partial' | 'ok' | 'missing' | 'error';

let ac: AudioContext | null = null;
let soundOn = true;
let vibrationOn = true;

export function setFeedback(opts: { sound: boolean; vibration: boolean }) {
  soundOn = opts.sound;
  vibrationOn = opts.vibration;
}

export function unlockAudio() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!ac && Ctor) ac = new Ctor();
    void ac?.resume();
  } catch {
    /* sin audio */
  }
}

/** [frecuencia Hz, duración ms, pausa ms][] */
const TONES: Record<Cue, [number, number, number][]> = {
  scan: [[1800, 50, 0]],
  match: [
    [880, 110, 40],
    [1175, 110, 40],
    [1568, 260, 0],
  ],
  nomatch: [
    [240, 120, 50],
    [240, 120, 0],
  ],
  repeat: [[620, 200, 0]],
  partial: [
    [740, 120, 60],
    [560, 200, 0],
  ],
  ok: [
    [880, 120, 40],
    [1175, 120, 40],
    [1568, 120, 40],
    [1760, 380, 0],
  ],
  missing: [
    [440, 250, 120],
    [330, 450, 0],
  ],
  error: [[300, 160, 0]],
};

const VIBRATION: Record<Cue, number[]> = {
  scan: [30],
  match: [300, 100, 300],
  nomatch: [70],
  repeat: [150],
  partial: [100, 80, 100, 80, 100],
  ok: [200, 100, 200, 100, 500],
  missing: [500, 150, 500],
  error: [60, 60, 60],
};

export function cue(c: Cue) {
  if (vibrationOn && 'vibrate' in navigator) {
    try {
      navigator.vibrate(VIBRATION[c]);
    } catch {
      /* ignorado */
    }
  }
  if (!soundOn || !ac) return;
  let t = ac.currentTime + 0.01;
  for (const [f, d, gap] of TONES[c]) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = c === 'nomatch' || c === 'missing' ? 'square' : 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(c === 'nomatch' ? 0.25 : 0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d / 1000);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + d / 1000 + 0.02);
    t += (d + gap) / 1000;
  }
}

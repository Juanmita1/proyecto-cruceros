/**
 * Sonido y vibración distintos por resultado. Los tonos se generan con
 * WebAudio (sin ficheros de audio). iOS exige desbloquear el audio con un
 * toque del usuario: `unlockAudio()` se llama en el primer toque.
 * La vibración (navigator.vibrate) no existe en iOS Safari.
 */
export type Cue = 'scan' | 'ok' | 'mismatch' | 'incomplete' | 'already' | 'error' | 'partial';

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
  ok: [
    [880, 90, 30],
    [1320, 160, 0],
  ],
  mismatch: [
    [220, 300, 80],
    [220, 300, 80],
    [220, 500, 0],
  ],
  incomplete: [
    [660, 140, 90],
    [660, 140, 0],
  ],
  already: [[520, 350, 0]],
  partial: [
    [740, 120, 60],
    [560, 200, 0],
  ],
  error: [[300, 160, 0]],
};

const VIBRATION: Record<Cue, number[]> = {
  scan: [30],
  ok: [80],
  mismatch: [400, 120, 400, 120, 600],
  incomplete: [150, 100, 150],
  already: [250, 100, 80],
  partial: [100, 80, 100, 80, 100],
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
    o.type = c === 'mismatch' ? 'square' : 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(c === 'mismatch' ? 0.5 : 0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d / 1000);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + d / 1000 + 0.02);
    t += (d + gap) / 1000;
  }
}

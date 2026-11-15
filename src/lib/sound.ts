// Synthesised sound effects and ambient music (Web Audio). No audio files to download.

let ctx: AudioContext | null = null;
let muted = localStorage.getItem('uaa.muted') === '1';
let music: { stop: () => void } | null = null;

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.07, delay = 0, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

export const sfx = {
  bid() { tone(740, 0.08, 'triangle', 0.07); tone(1110, 0.12, 'triangle', 0.05, 0.06); },
  tick() { tone(980, 0.045, 'square', 0.025); },
  reveal() { tone(320, 0.28, 'sawtooth', 0.035, 0, 960); },
  clue() { tone(520, 0.12, 'sine', 0.05); },
  sold() { tone(170, 0.12, 'square', 0.1); tone(110, 0.22, 'square', 0.09, 0.1); tone(660, 0.16, 'triangle', 0.06, 0.26); tone(990, 0.3, 'triangle', 0.06, 0.4); },
  unsold() { tone(300, 0.3, 'sawtooth', 0.045, 0, 140); },
  error() { tone(150, 0.14, 'square', 0.05); },
  click() { tone(600, 0.03, 'sine', 0.03); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i === 4 ? 0.9 : 0.22, 'triangle', 0.08, i * 0.16)); tone(262, 1.4, 'sine', 0.05, 0.64); },
};

export const isMuted = () => muted;
export function setMuted(v: boolean) {
  muted = v;
  localStorage.setItem('uaa.muted', v ? '1' : '0');
  if (v) stopMusic();
}

export const musicOn = () => !!music;
export function startMusic() {
  const a = ac();
  if (!a || music) return;
  const master = a.createGain();
  master.gain.value = 0.022;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.connect(master).connect(a.destination);
  const chords = [[110, 164.8, 220], [98, 146.8, 196], [87.3, 130.8, 174.6], [98, 146.8, 233]];
  const oscs = [0, 1, 2].map((i) => {
    const o = a.createOscillator();
    o.type = i === 0 ? 'sawtooth' : 'triangle';
    o.detune.value = (i - 1) * 6;
    o.connect(filter);
    o.start();
    return o;
  });
  let step = 0;
  const apply = () => {
    const c = chords[step++ % chords.length];
    oscs.forEach((o, i) => o.frequency.setTargetAtTime(c[i], a.currentTime, 0.6));
  };
  apply();
  const id = setInterval(apply, 4000);
  music = {
    stop() {
      clearInterval(id);
      master.gain.setTargetAtTime(0.0001, a.currentTime, 0.2);
      setTimeout(() => oscs.forEach((o) => o.stop()), 600);
    },
  };
}
export function stopMusic() {
  music?.stop();
  music = null;
}

export function buzz(pattern: number | number[] = 12) {
  try { navigator.vibrate?.(pattern); } catch { /* haptics unsupported */ }
}

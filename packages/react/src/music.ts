/*
 * The tree's music: a calm melody while someone looks around, and a quicker
 * one while the years play.
 *
 * Nothing here is a recording. The browser plays every note itself, from the
 * melodies written out below, so there is no file to load and nothing to
 * license. Each melody keeps to one of the five-note scales of Japanese music,
 * and is played on a plucked koto string, a breathy bamboo flute and a water
 * bell, each of them made here from nothing but arithmetic.
 * Author: George Khananaev
 */

export type Mood = 'calm' | 'lively';

/* ---------- The melodies ---------- */

/*
 * How they are written. A note is written as a musician writes it, 'D5' or
 * 'Bb4', and a dot is a rest. A line is sixteen steps, read left to right.
 * 'A4^' is a string pressed after it is plucked, so that the note leans up and
 * comes back. 'D5:8' is a flute note held for eight steps.
 *
 * Each melody has the koto's line, a deep koto under it, a flute, and the
 * drops of a water bell. Most use only some of them.
 */
interface Line {
  koto?: string;
  deep?: string;
  flute?: string;
  drop?: string;
}

interface Written {
  id: string;
  name: string;
  about: string;
  pace: number;        // steps a minute
  scale: string;       // its five notes, upward from the note it comes home to
  hold: string;        // the notes held softly underneath, or none: a plucked melody is better for the room between its notes
  lines: readonly Line[];
}

const WRITTEN: readonly Written[] = [
  {
    id: 'morning-mist',
    name: 'Morning mist',
    about: 'A flute over a rolling koto. Warm and unhurried.',
    pace: 132,
    scale: 'D4 E4 G4 A4 B4',
    hold: 'D3 A3',
    lines: [
      { koto: 'D4 . A4 . B4 . A4 . D4 . A4 . B4 . A4 .' },
      { koto: 'D4 . A4 . B4 . A4 . D4 . A4 . B4 . A4 .', flute: 'B4:6 . . . . . A4:4 . . . G4:2 . A4:4 . . .' },
      { koto: 'E4 . A4 . B4 . A4 . E4 . G4 . B4 . G4 .', flute: 'E5:8 . . . . . . . D5:3 . . B4:5 . . . .' },
      { koto: 'G3 . D4 . G4 . D4 . G3 . D4 . A4 . G4 .', flute: 'A4:4 . . . B4:2 . D5:6 . . . . . . . . .' },
      { koto: 'A3 . E4 . A4 . E4 . A3 . E4 . B4 . A4 .', flute: 'B4:3 . . A4:3 . . G4:2 . E4:8 . . . . . . .' },
      { koto: 'D4 . A4 . B4 . A4 . D4 . A4 . D5 . A4 .', flute: '. . . . D5:4 . . . E5:4 . . . D5:4 . . .' },
      { koto: 'B3 . G4 . B4 . G4 . B3 . G4 . A4 . G4 .', flute: 'B4:6 . . . . . G4:2 . A4:8 . . . . . . .' },
      { koto: 'G3 . D4 . G4 . D4 . A3 . E4 . A4 . E4 .', flute: 'G4:4 . . . A4:4 . . . B4:4 . . . A4:4 . . .' },
      { koto: 'D4 . A4 . B4 . A4 . D4 . A4 . B4 . A4 .', flute: 'D5:10 . . . . . . . . . . . . . . .' },
      { koto: 'D4 . A4 . D5 . A4 . D4 . . . . . . .' },
    ],
  },
  {
    id: 'koto-garden',
    name: 'Koto in the garden',
    about: 'A koto alone, with room between the notes. The old, wistful scale.',
    pace: 126,
    scale: 'D4 Eb4 G4 A4 Bb4',
    hold: '',
    lines: [
      { koto: 'D5 . . . A4 . Bb4 A4 . . . . G4 . . .', deep: 'D3 . . . . . . . . . . . . . . .' },
      { koto: 'A4 . . Bb4 A4 . G4 . . . D4 . . . . .', deep: 'G3 . . . . . . . . . D3 . . . . .' },
      { koto: 'D4 . Eb4 . G4 . . . A4 . Bb4 . A4 . . .', deep: 'D3 . . . . . . . A3 . . . . . . .' },
      { koto: 'G4 . . . Eb4 . D4 . . . . . . . . .', deep: '. . . . . . . . D3 . . . A3 . D3 .' },
      { koto: 'D5 . . Eb5 D5 . Bb4 . A4 . . . . . . .', deep: 'D3 . . . . . . . . . . . . . . .' },
      { koto: 'Bb4 A4 G4 . . . A4 . . . D5 . . . . .', deep: 'G3 . . . . . . . . . D3 . . . . .' },
      { koto: 'G5 . . . D5 . Eb5 D5 . . Bb4 . A4 . . .', deep: 'G3 . . . . . . . A3 . . . . . . .' },
      { koto: 'A4 . . Bb4 . . A4^ . . . . . G4 . . .', deep: 'A3 . . . . . . . . . . . . . . .' },
      { koto: 'Eb4 . D4 . . . G4 . A4 . . . D5 . . .', deep: 'D3 . . . . . . . . . . . D3 . . .' },
      { koto: 'A4 . . . G4 . Eb4 . D4 . . . . . . .', deep: '. . . . . . . . D3 . A3 . D4 . . .' },
    ],
  },
  {
    id: 'bamboo-wind',
    name: 'Bamboo wind',
    about: 'A bamboo flute, slow and breathing, with a deep string now and then.',
    pace: 100,
    scale: 'D4 F4 G4 A4 C5',
    hold: 'D3 A3',
    lines: [
      { flute: 'D5:8 . . . . . . . . . C5:2 . D5:4 . . .', deep: 'D3 . . . . . . . . . . . . . . .' },
      { flute: 'F5:6 . . . . . D5:2 . C5:6 . . . . . . .', deep: '. . . . . . . . A3 . . . . . D3 .' },
      { flute: 'A4:4 . . . C5:2 . D5:8 . . . . . . . . .', deep: 'G3 . . . . . . . . . . . D3 . . .' },
      { flute: '. . . . G5:4 . . . F5:2 . D5:6 . . . . .', deep: 'D3 . . . . . . . . . A3 . . . . .' },
      { flute: 'A5:6 . . . . . G5:2 . F5:2 . D5:6 . . . . .', deep: 'F3 . . . . . . . . . . . C4 . . .' },
      { flute: 'C5:4 . . . D5:4 . . . F5:2 . G5:6 . . . . .', deep: 'G3 . . . . . . . D3 . . . . . . .' },
      { flute: 'A5:3 . . G5:3 . . F5:2 . D5:8 . . . . . . .', deep: 'A3 . . . . . . . D3 . . . . . . .' },
      { flute: 'C5:2 . A4:6 . . . . . . . D5:6 . . . . .', deep: '. . . . . . D3 . . . . . . . A3 .' },
    ],
  },
  {
    id: 'water-garden',
    name: 'Water garden',
    about: 'Drops ringing in a water bell, and a string far off. The quietest one.',
    pace: 108,
    scale: 'G4 A4 C5 D5 E5',
    hold: 'G2 D3',
    lines: [
      { drop: 'E5 . . . . . D5 . . . . G5 . . . .', koto: 'G3 . . . D4 . . . . . . . . . . .' },
      { drop: '. . A5 . . . . . G5 . . . . D5 . .', koto: '. . . . . . C4 . . . G4 . . . . .' },
      { drop: 'C5 . . . . E5 . . . . . . A5 . . .', koto: 'E3 . . . . . . . D4 . . . . . . .' },
      { drop: '. . . D5 . . . . . G5 . E5 . . . .', koto: 'G3 . . . . . . . . . . . . D4 . .' },
      { drop: 'G5 . . . . . . C6 . . . . . A5 . .', koto: 'C4 . . . G4 . . . . . . . E4 . . .' },
      { drop: '. . . . E5 . . . D5 . . . . . . .', koto: 'D3 . . . . . A3 . . . . . D4 . . .' },
      { drop: 'A5 . . . . . . G5 . . E5 . . . . .', koto: '. . . . C4 . . . . . . . G3 . . .' },
      { drop: 'D5 . . . . . . . . . G5 . . . . .', koto: 'G3 . . . D4 . . . G4 . . . . . . .' },
    ],
  },
  {
    id: 'island-song',
    name: 'Island song',
    about: 'A lilting tune in the bright scale of the southern islands.',
    pace: 144,
    scale: 'D4 F#4 G4 A4 C#5',
    hold: '',
    lines: [
      { koto: 'D4 . F#4 G4 A4 . . . C#5 . D5 . A4 . . .', deep: 'D3 . . . . . . . A3 . . . . . . .' },
      { koto: 'G4 . A4 . F#4 . D4 . . . F#4 . G4 . . .', deep: 'G3 . . . . . . . D3 . . . . . . .' },
      { koto: 'A4 . C#5 D5 . . C#5 . A4 . G4 . F#4 . . .', deep: 'A3 . . . . . . . D3 . . . . . . .' },
      { koto: 'G4 . F#4 . D4 . . . . . . . . . . .', deep: '. . . . . . D3 . A3 . D4 . . . . .' },
      { koto: 'D5 . . C#5 D5 . F#5 . G5 . F#5 . D5 . . .', deep: 'D3 . . . . . . . G3 . . . . . . .' },
      { koto: 'C#5 . D5 . A4 . . . G4 . A4 . F#4 . . .', deep: 'A3 . . . . . . . D3 . . . . . . .' },
      { koto: 'G4 . A4 . C#5 . D5 . . . A4 . G4 . F#4 .', deep: 'G3 . . . . . . . A3 . . . . . . .' },
      { koto: 'D4 . . . F#4 G4 A4 . D5 . . . . . . .', deep: 'D3 . . . A3 . . . D3 . . . . . . .' },
    ],
  },
];

/* A melody, as a list to choose from shows it. */
export interface Melody {
  id: string;
  name: string;
  about: string;
}

export const MELODIES: readonly Melody[] = WRITTEN.map(({ id, name, about }) => ({ id, name, about }));

const STEPS = 16;
const QUICK_TEMPO = 132;    // beats a minute while the years play, four steps to the beat

/* While the years play, a koto runs up and down a ladder of the scale. These are the rungs it takes, step by step, in two shapes. */
const RISE = [0, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6, 5, 4, 3, 2];
const WAVE = [0, 3, 4, 5, 3, 4, 5, 6, 4, 5, 6, 5, 4, 5, 4, 3];
/* The steps of a bar that are leaned on: three, three and two. It is what makes the quick tune dance. */
const PULSE: ReadonlySet<number> = new Set([0, 3, 6, 8, 11, 14]);
/* Where on the scale each bar's ladder starts: home, the fifth, the note below it, the fifth again. */
const LADDER_STARTS = [0, 3, 2, 3];
/* The flute's two notes in each bar, as rungs of that bar's ladder. */
const SUNG = [[4, 5], [6, 5], [4, 6], [5, 4]];

const SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/* One written note: how fast it vibrates, in hertz, whether its string is pressed, and how many steps it is held. */
export interface Sound {
  pitch: number;
  lean: boolean;
  steps: number;
}

function soundOf(written: string): Sound | null {
  if (written === '.') return null;
  const found = /^([A-G])([#b]?)(\d)(\^?)(?::(\d+))?$/.exec(written);
  const above = found ? SEMITONES[found[1] ?? ''] : undefined;
  if (!found || above === undefined) throw new Error(`"${written}" is not a note.`);
  const fromA4 = above + (found[2] === '#' ? 1 : found[2] === 'b' ? -1 : 0) + 12 * (Number(found[3]) - 4) - 9;
  return { pitch: 440 * 2 ** (fromA4 / 12), lean: found[4] === '^', steps: Number(found[5] ?? 1) };
}

const bar = (written = ''): (Sound | null)[] => (written ? written.split(' ').map(soundOf) : Array.from({ length: STEPS }, () => null));
const pitches = (written: string): number[] => bar(written).flatMap((sound) => (sound ? [sound.pitch] : []));

export interface Score {
  pace: number;
  scale: number[];
  hold: number[];
  lines: Record<keyof Line, (Sound | null)[]>[];
}

/* A melody as pitches. Read when the music first starts, so a slip of the pen in one costs the music and nothing else. An unknown name gives the first. */
export function readScore(id?: string): Score {
  const written = WRITTEN.find((melody) => melody.id === id) ?? WRITTEN[0];
  if (!written) throw new Error('There is no melody to play.');
  return {
    pace: written.pace,
    scale: pitches(written.scale),
    hold: pitches(written.hold),
    lines: written.lines.map((line) => ({ koto: bar(line.koto), deep: bar(line.deep), flute: bar(line.flute), drop: bar(line.drop) })),
  };
}

/* ---------- The instruments ---------- */

const LEVEL = 0.62;         // how loud the whole thing is. It is there to be heard under a conversation, not over one.
const AHEAD = 0.5;          // seconds of music written out in advance, so a busy page never makes it stumble
const HALL_SECONDS = 3.4;
const KOTO = 0.38;
const FLUTE = 0.07;
const BELL = 0.17;
const QUICK = 0.7;          // the quick tune has many more notes, so each is played softer, or it would be far louder than the calm one

/* The tones a water bell rings with: [how many times the note's own pitch, how strong, how much of the ring it lasts]. */
const BELL_TONES: readonly (readonly [times: number, strength: number, share: number])[] = [[1, 1, 1], [2.4, 0.28, 0.4], [4.1, 0.1, 0.18]];
/* A flute's tone is its own note and a little of the three above it. */
const FLUTE_TONES: readonly (readonly [times: number, strength: number])[] = [[1, 1], [2, 0.3], [3, 0.1], [4, 0.035]];

/* The same run of chance every time, so a melody sounds the same on every visit. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/* The sound of a large, soft room: a hiss that dies away. Notes played into it keep ringing after they stop. */
function hallOf(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * HALL_SECONDS), hall = ctx.createBuffer(2, length, ctx.sampleRate), chance = seeded(7);
  for (const side of [0, 1]) {
    const samples = hall.getChannelData(side);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      smooth += 0.4 * (chance() * 2 - 1 - smooth);
      samples[i] = smooth * (1 - i / length) ** 3;
    }
  }
  return hall;
}

/* Two seconds of plain hiss: the breath in a flute and the skin of a drum are cut from it. */
function hissOf(ctx: BaseAudioContext): AudioBuffer {
  const hiss = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), samples = hiss.getChannelData(0), chance = seeded(11);
  for (let i = 0; i < samples.length; i++) samples[i] = chance() * 2 - 1;
  return hiss;
}

/*
 * A plucked string, worked out sample by sample. A burst of hiss goes round a
 * loop as long as one swing of the string, and loses a little of its edge on
 * every pass. What comes out starts bright and mellows as it dies, the way a
 * real string does. (The method is Karplus and Strong's.)
 */
function stringOf(ctx: BaseAudioContext, pitch: number, chance: () => number): AudioBuffer {
  const rate = ctx.sampleRate, seconds = Math.min(4, Math.max(1.6, 1.2 + 520 / pitch)), length = Math.floor(rate * seconds);
  const string = ctx.createBuffer(1, length, rate), samples = string.getChannelData(0);
  // The loop is a whole number of samples long. What is left of one swing is made up by the softening and by a fine tuning, below.
  const swing = rate / pitch, soften = 0.44;
  const whole = Math.max(2, Math.floor(swing - soften - 0.1)), rest = swing - soften - whole, tune = (1 - rest) / (1 + rest);
  // The pluck: hiss, a little softened, with the hollow a plectrum leaves when it strikes a fifth of the way along the string
  const burst = new Float32Array(whole), loop = new Float32Array(whole), pick = Math.max(1, Math.round(whole / 5));
  let smooth = 0, middle = 0;
  for (let i = 0; i < whole; i++) {
    smooth += 0.42 * (chance() * 2 - 1 - smooth);
    burst[i] = smooth;
  }
  for (let i = 0; i < whole; i++) {
    loop[i] = (burst[i] ?? 0) - (burst[(i + pick) % whole] ?? 0);
    middle += (loop[i] ?? 0) / whole;
  }
  for (let i = 0; i < whole; i++) loop[i] = (loop[i] ?? 0) - middle;
  // How much is kept on each pass, so that the note has all but died when its time is up
  const keep = 10 ** (-3 / (seconds * 0.9 * pitch));
  let at = 0, before = 0, tunedIn = 0, tunedOut = 0, peak = 0;
  for (let n = 0; n < length; n++) {
    const now = loop[at] ?? 0, soft = keep * ((1 - soften) * now + soften * before);
    const tuned = tune * soft + tunedIn - tune * tunedOut;
    before = now;
    tunedIn = soft;
    tunedOut = tuned;
    loop[at] = tuned;
    samples[n] = now;
    peak = Math.max(peak, Math.abs(now));
    at = (at + 1) % whole;
  }
  // Every string as loud as the next, with no click at either end
  const lift = 0.9 / (peak || 1), opening = Math.floor(rate * 0.0015), closing = Math.floor(rate * 0.08);
  for (let n = 0; n < length; n++) {
    samples[n] = (samples[n] ?? 0) * lift * Math.min(1, (n + 1) / opening, (length - n) / closing);
  }
  return string;
}

/* One of the two tunes: where its sound goes, and where it has got to. */
interface Part {
  bus: GainNode;              // everything the tune plays, so it can fade as one
  warm: BiquadFilterNode;     // its held notes pass through here, to stay soft under the rest
  stepSeconds: number;
  step: number;
  next: number;               // when the next step is due, on the audio clock
  play(step: number, at: number): void;
}

/* ---------- The player ---------- */

export class TreeMusic {
  private readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private readonly hiss: AudioBuffer;
  private readonly parts: Record<Mood, Part>;
  private readonly score: Score;
  /* The scale the quick tune runs up and down, three octaves of it, lowest first. */
  private readonly rungs: number[];
  private readonly strings = new Map<number, AudioBuffer>();
  private readonly chance = seeded(20261113);
  private mood: Mood = 'calm';
  private timer: ReturnType<typeof setInterval> | null = null;
  private rest: ReturnType<typeof setTimeout> | null = null;

  /*
   * `melody` is the calm one. `quickMelody` is the one the quick tune is made from: the same, unless another is named.
   * Made on a click, a tap or a key, or the browser keeps it silent. A test hands in a context that renders to memory.
   */
  constructor(melody?: string, quickMelody: string | undefined = melody, ctx: BaseAudioContext = new AudioContext()) {
    this.ctx = ctx;
    this.score = readScore(melody);
    this.rungs = [1, 2, 4].flatMap((octave) => readScore(quickMelody).scale.map((pitch) => pitch * octave));
    this.hiss = hissOf(ctx);
    // A soft ceiling, for the moments when many notes ring at once
    const ceiling = ctx.createDynamicsCompressor();
    ceiling.threshold.value = -10;
    ceiling.knee.value = 6;
    ceiling.ratio.value = 6;
    ceiling.attack.value = 0.005;
    ceiling.release.value = 0.25;
    ceiling.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ceiling);
    const hall = ctx.createConvolver();
    hall.buffer = hallOf(ctx);
    hall.connect(this.master);

    const part = (stepSeconds: number, level: number, echo: number, play: Part['play']): Part => {
      const bus = ctx.createGain(), send = ctx.createGain(), warm = ctx.createBiquadFilter();
      bus.gain.value = level;
      send.gain.value = echo;
      warm.type = 'lowpass';
      warm.frequency.value = 620;
      warm.Q.value = 0.4;
      warm.connect(bus);
      bus.connect(this.master);
      bus.connect(send).connect(hall);
      return { bus, warm, stepSeconds, step: 0, next: 0, play };
    };
    this.parts = {
      calm: part(60 / this.score.pace, 1, 0.5, (step, at) => this.calm(step, at)),
      lively: part(60 / QUICK_TEMPO / 4, 0, 0.3, (step, at) => this.lively(step, at)),
    };
  }

  /* Start, or carry on from where it rested. */
  play(): void {
    const { ctx } = this;
    if (ctx instanceof AudioContext && ctx.state !== 'running') void ctx.resume();
    if (this.rest !== null) clearTimeout(this.rest);
    this.rest = null;
    if (this.timer !== null) return;
    const now = ctx.currentTime, part = this.parts[this.mood];
    this.master.gain.setTargetAtTime(LEVEL, now, 0.5);
    // While it rested the clock may have run on: carry on from now, and do not hurry through what was missed
    if (part.next < now + 0.15) part.next = now + 0.15;
    this.timer = setInterval(() => this.fill(ctx.currentTime + AHEAD), 100);
    this.fill(now + AHEAD);
  }

  /* Fade out and rest. */
  pause(): void {
    const { ctx } = this;
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    // Once it has faded, the clock stops too, and the page does no work for music nobody hears
    if (ctx instanceof AudioContext) this.rest = setTimeout(() => void ctx.suspend(), 1600);
  }

  /* Change from one tune to the other. The one playing fades, and the other starts from its beginning. */
  setMood(mood: Mood, at: number = this.ctx.currentTime): void {
    if (mood === this.mood) return;
    const from = this.parts[this.mood], to = this.parts[mood], { rungs } = this;
    this.mood = mood;
    to.step = 0;
    if (mood === 'lively') {
      // The years begin: the calm tune fades under a quick run up the strings, and the quick tune comes in on its heels
      from.bus.gain.setTargetAtTime(0, at, 0.22);
      to.bus.gain.setTargetAtTime(QUICK, at, 0.03);
      const run = rungs.slice(0, 6);
      run.forEach((pitch, index) => this.pluck(to.bus, at + 0.03 + index * 0.055, pitch, 0.5 + index * 0.08, index % 2 ? 0.3 : -0.3, false, 0.5));
      to.next = at + 0.03 + run.length * 0.055;
    } else {
      // The years have stopped: the quick tune lets go, the strings are stroked once from the bottom, and the calm tune begins again
      from.bus.gain.setTargetAtTime(0, at, 0.3);
      to.bus.gain.setTargetAtTime(1, at, 0.05);
      const home = [(rungs[0] ?? 0) / 2, (rungs[3] ?? 0) / 2, rungs[0], rungs[3], rungs[5]];
      home.forEach((pitch, index) => { if (pitch) this.pluck(to.bus, at + 0.2 + index * 0.09, pitch, 0.7, index * 0.15 - 0.3); });
      to.next = at + 2.2;
    }
  }

  /*
   * Write out every step that is due before `until`, on the audio clock. While
   * the music plays this is called ten times a second. A test calls it once, to
   * render a stretch of music to memory.
   */
  fill(until: number): void {
    const part = this.parts[this.mood];
    while (part.next < until) {
      part.play(part.step, part.next);
      part.step += 1;
      part.next += part.stepSeconds;
    }
  }

  /* Stop for good and give the sound card back. */
  close(): void {
    if (this.timer !== null) clearInterval(this.timer);
    if (this.rest !== null) clearTimeout(this.rest);
    this.timer = this.rest = null;
    if (this.ctx instanceof AudioContext) void this.ctx.close();
  }

  /* Nobody plays exactly on the beat, or every note as loud as the last. A little of each keeps it from sounding like a machine. */
  private early(): number {
    return (this.chance() - 0.5) * 0.022;
  }

  private touch(): number {
    return 0.85 + this.chance() * 0.3;
  }

  private calm(step: number, at: number): void {
    const part = this.parts.calm, { lines, hold } = this.score, place = step % STEPS;
    const line = lines[Math.floor(step / STEPS) % lines.length];
    if (!line) return;
    if (place === 0 && hold.length) this.held(part, at, hold, STEPS * part.stepSeconds, 0.011, 2.4);
    const koto = line.koto[place], deep = line.deep[place], flute = line.flute[place], drop = line.drop[place];
    if (koto) this.pluck(part.bus, at + this.early(), koto.pitch, this.touch(), 0.18, koto.lean);
    if (deep) this.pluck(part.bus, at + this.early(), deep.pitch, 0.8 * this.touch(), -0.22, deep.lean);
    if (flute) this.flute(part.bus, at, flute.pitch, flute.steps * part.stepSeconds, this.touch());
    if (drop) this.bell(part.bus, at + this.early(), drop.pitch, this.touch(), this.chance() * 0.8 - 0.4);
  }

  private lively(step: number, at: number): void {
    const part = this.parts.lively, place = step % STEPS, count = Math.floor(step / STEPS), turn = count % LADDER_STARTS.length;
    const ladder = this.rungs.slice(LADDER_STARTS[turn], (LADDER_STARTS[turn] ?? 0) + 7), rung = ladder[(count % 2 ? WAVE : RISE)[place] ?? 0];
    if (!rung) return;
    if (place === 0) this.held(part, at, [(ladder[0] ?? rung) / 2, (ladder[3] ?? rung) / 2], STEPS * part.stepSeconds, 0.014, 0.3);
    // It grows as the family does: the running koto first, then a deep string and a drum, then a flute on top, then a sparkle above it all
    const leaned = PULSE.has(place), side = place % 2 ? 0.3 : -0.3;
    this.pluck(part.bus, at, rung, (leaned ? 0.62 : 0.38) * Math.min(1, 0.72 + count * 0.07), side, false, 0.3);
    if (count >= 1 && place % 6 === 0) this.pluck(part.bus, at, (ladder[place === 12 ? 3 : 0] ?? rung) / 2, place ? 0.55 : 0.75, 0, false, 0.5);
    if (count >= 1 && place % 8 === 0) this.drum(part.bus, at, place ? 0.6 : 1);
    const sung = ladder[SUNG[turn]?.[place / 8] ?? -1];
    if (count >= 2 && sung) this.flute(part.bus, at, sung, 7.4 * part.stepSeconds, 1.15, 0.05);
    if (count >= 4 && leaned) this.pluck(part.bus, at, rung * 2, 0.22, -side, false, 0.25);
  }

  /* One plucked string. `lean` presses it after the pluck, so the note bends up and comes back. `stop` lays a finger on it after that many seconds. */
  private pluck(to: AudioNode, at: number, pitch: number, loud: number, side = 0, lean = false, stop = 0): void {
    const { ctx } = this, key = Math.round(pitch * 8), string = ctx.createBufferSource(), out = ctx.createGain(), place = ctx.createStereoPanner();
    let made = this.strings.get(key);
    if (!made) {
      made = stringOf(ctx, pitch, this.chance);
      this.strings.set(key, made);
    }
    string.buffer = made;
    out.gain.value = KOTO * loud;
    if (stop) out.gain.setTargetAtTime(0, at + stop, 0.07);
    place.pan.value = side;
    if (lean) {
      string.playbackRate.setValueAtTime(1, at + 0.12);
      string.playbackRate.linearRampToValueAtTime(2 ** (1 / 12), at + 0.34);
      string.playbackRate.setValueAtTime(2 ** (1 / 12), at + 0.6);
      string.playbackRate.linearRampToValueAtTime(1, at + 1);
    }
    string.connect(out).connect(place).connect(to);
    string.start(at);
  }

  /*
   * One breath of a bamboo flute. It comes in from just under the note, the
   * breath is heard before the tone is, and once it has settled it begins to
   * waver, as a player lets it.
   */
  private flute(to: AudioNode, at: number, pitch: number, seconds: number, loud: number, side = -0.1): void {
    const { ctx } = this, end = at + seconds, out = ctx.createGain(), place = ctx.createStereoPanner();
    out.gain.setValueAtTime(0, at);
    out.gain.linearRampToValueAtTime(FLUTE * loud, at + 0.16);
    out.gain.setTargetAtTime(0, end - 0.12, 0.14);
    place.pan.value = side;
    out.connect(place).connect(to);

    const waver = ctx.createOscillator(), depth = ctx.createGain();
    waver.frequency.value = 4.6 + this.chance() * 0.6;
    depth.gain.setValueAtTime(0, at + 0.4);
    depth.gain.linearRampToValueAtTime(1, at + 1.1);
    waver.connect(depth);
    waver.start(at);
    waver.stop(end + 1);

    for (const [times, strength] of FLUTE_TONES) {
      const tone = ctx.createOscillator(), share = ctx.createGain(), sway = ctx.createGain(), pitched = pitch * times;
      tone.frequency.setValueAtTime(pitched * 0.972, at);
      tone.frequency.exponentialRampToValueAtTime(pitched, at + 0.18);
      sway.gain.value = pitched * 0.0055;
      depth.connect(sway).connect(tone.frequency);
      share.gain.value = strength;
      tone.connect(share).connect(out);
      tone.start(at);
      tone.stop(end + 1);
    }

    const breath = ctx.createBufferSource(), narrow = ctx.createBiquadFilter(), air = ctx.createGain();
    breath.buffer = this.hiss;
    breath.loop = true;
    narrow.type = 'bandpass';
    narrow.frequency.value = pitch * 2;
    narrow.Q.value = 1.6;
    air.gain.setValueAtTime(0.9, at);
    air.gain.setTargetAtTime(0.3, at + 0.05, 0.12);
    breath.connect(narrow).connect(air).connect(out);
    breath.start(at, this.chance());
    breath.stop(end + 1);
  }

  /* A drop in a water bell: it starts a shade sharp, as a drop does, and its high tones die first. */
  private bell(to: AudioNode, at: number, pitch: number, loud: number, side = 0): void {
    const { ctx } = this, out = ctx.createGain(), place = ctx.createStereoPanner(), ring = 3.6;
    out.gain.value = BELL * loud;
    place.pan.value = side;
    out.connect(place).connect(to);
    for (const [times, strength, share] of BELL_TONES) {
      const tone = ctx.createOscillator(), swell = ctx.createGain(), lasts = ring * share;
      tone.frequency.setValueAtTime(pitch * times * 1.025, at);
      tone.frequency.exponentialRampToValueAtTime(pitch * times, at + 0.05);
      swell.gain.setValueAtTime(0, at);
      swell.gain.linearRampToValueAtTime(strength, at + 0.004);
      swell.gain.setTargetAtTime(0, at + 0.004, lasts / 5);
      tone.connect(swell).connect(out);
      tone.start(at);
      tone.stop(at + lasts * 1.3);
    }
  }

  /* A soft drum: a low note that falls as it sounds, and the brush of the skin. */
  private drum(to: AudioNode, at: number, loud: number): void {
    const { ctx } = this, tone = ctx.createOscillator(), body = ctx.createGain(), skin = ctx.createBufferSource(), dull = ctx.createBiquadFilter(), brush = ctx.createGain();
    tone.frequency.setValueAtTime(128, at);
    tone.frequency.exponentialRampToValueAtTime(54, at + 0.17);
    body.gain.setValueAtTime(0, at);
    body.gain.linearRampToValueAtTime(0.34 * loud, at + 0.004);
    body.gain.setTargetAtTime(0, at + 0.03, 0.1);
    tone.connect(body).connect(to);
    tone.start(at);
    tone.stop(at + 0.8);
    skin.buffer = this.hiss;
    dull.type = 'lowpass';
    dull.frequency.value = 850;
    brush.gain.setValueAtTime(0.12 * loud, at);
    brush.gain.setTargetAtTime(0, at, 0.025);
    skin.connect(dull).connect(brush).connect(to);
    skin.start(at, this.chance());
    skin.stop(at + 0.2);
  }

  /* Notes held under the rest: they swell in, stay for the line, and let go as the next line's arrive. */
  private held(part: Part, at: number, notes: readonly number[], seconds: number, level: number, swellSeconds: number): void {
    const { ctx } = this, hold = ctx.createGain();
    hold.gain.setValueAtTime(0, at);
    hold.gain.linearRampToValueAtTime(level, at + swellSeconds);
    hold.gain.setTargetAtTime(0, at + seconds, 0.7);
    hold.connect(part.warm);
    // Two of each note, a hair apart in pitch, which is what makes a held note shimmer. The lowest is left whole: split, it would only wobble.
    notes.forEach((pitch, index) => {
      for (const cents of index ? [-2.5, 2.5] : [0]) {
        const tone = ctx.createOscillator();
        tone.type = 'triangle';
        tone.frequency.value = pitch;
        tone.detune.value = cents;
        tone.connect(hold);
        tone.start(at);
        tone.stop(at + seconds + 4.5);
      }
    });
  }
}

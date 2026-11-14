/*
 * The page's sound: one AudioContext for as long as the page is open, woken
 * at the moment a visitor asks for music.
 *
 * Two rules of the iPhone's browser decide how. A page may start its sound
 * only inside a tap, a click or a key press: not a moment later, when the
 * page has caught up with it. So `wake()` is called from inside that event,
 * and the context it wakes is kept, since a new one made later would stay
 * silent. And a page's sound counts as background noise, which the silent
 * switch mutes, unless the page says it is playing music on purpose. It says
 * so when the visitor asked for it, and lets go again once it has stopped,
 * so that it does not keep the phone from their own music.
 */

/* What Safari calls the kind of sound a page makes. Other browsers have none. */
interface AudioSession {
  type: string;
}

type Waking = Pick<AudioContext, 'state' | 'resume' | 'suspend' | 'close'>;

/* How long the sound waits after it has gone quiet before it lets go of the speaker. Long enough for the music to fade. */
const LET_GO = 1600;

const sessionOf = (): AudioSession | undefined => (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { audioSession?: AudioSession }).audioSession);

export class PageSound<Context extends Waking = AudioContext> {
  private ctx: Context | null = null;
  private resting: ReturnType<typeof setTimeout> | null = null;
  /* The kind of sound the page made before it said "music", to go back to. */
  private before: string | null = null;

  /* A test hands in a context and a session of its own. */
  constructor(
    private readonly make: () => Context = () => new AudioContext() as unknown as Context,
    private readonly session: AudioSession | undefined = sessionOf(),
  ) {}

  /* The context, once a visitor has woken it. Until then there is no sound to make. */
  get context(): Context | null {
    return this.ctx;
  }

  /*
   * Call this inside the tap, click or key press. `asked` is true when the
   * visitor asked for music themselves, which lets it play through the silent
   * switch. Music that starts by itself on a first click does not.
   */
  wake(asked: boolean): void {
    this.hold();
    if (asked && this.session) {
      this.before ??= this.session.type;
      this.session.type = 'playback';
    }
    this.ctx ??= this.make();
    // resume() is asked for now, inside the event. When it is done does not matter.
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
  }

  /* Music is playing again: it must not be put to rest. */
  hold(): void {
    if (this.resting !== null) clearTimeout(this.resting);
    this.resting = null;
  }

  /* The music has stopped. Once it has faded the clock stops too, and the phone's own music may play again. */
  rest(): void {
    if (!this.ctx || this.resting !== null) return;
    this.resting = setTimeout(() => {
      this.resting = null;
      this.ctx?.suspend().catch(() => undefined);
      if (this.session && this.before !== null) this.session.type = this.before;
      this.before = null;
    }, LET_GO);
  }

  /* The page is going: give the speaker back for good. */
  close(): void {
    this.hold();
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    if (this.session && this.before !== null) this.session.type = this.before;
    this.before = null;
  }
}

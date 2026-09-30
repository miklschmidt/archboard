// Frames reach the encoder in order, whichever page drew them first (TASK-382).
//
// A talk is rendered by several pages at once, and each takes the screenshots of its own
// seconds of the video. ffmpeg takes one stream of frames, in order, so a frame that arrives
// before its turn is held until every frame before it has gone. A page may run only so far ahead
// of the encoder, which bounds how many frames are held.

/** Where the frames go, in order. */
interface FrameSink {
	/**
	 * Take the next frame.
	 * @param jpeg The frame.
	 * @returns Once it is taken.
	 */
	readonly writeFrame: (jpeg: Uint8Array) => Promise<void>;
}

/** A page waiting for room to draw a frame. */
interface Waiting {
	readonly frame: number;
	readonly resolve: () => void;
}

/** Frames put in any order, handed on in order. */
class FrameOrder {
	readonly #sink: FrameSink;
	readonly #ahead: number;
	readonly #held = new Map<number, Uint8Array>();
	readonly #waiting = new Set<Waiting>();
	#next = 0;
	#handing: Promise<void> = Promise.resolve();

	/**
	 * Hand frames on to a sink.
	 * @param sink Where they go.
	 * @param ahead How far past the next frame to hand on a frame may be put.
	 */
	constructor(sink: FrameSink, ahead: number) {
		this.#sink = sink;
		this.#ahead = ahead;
	}

	/**
	 * How many frames have been handed on.
	 * @returns The count.
	 */
	handed(): number {
		return this.#next;
	}

	/**
	 * Wait until a frame is near enough its turn to be put.
	 * @param frame The frame.
	 * @param signal Stops the wait.
	 * @returns Once there is room for it.
	 * @throws {unknown} The signal's reason, when it aborts first.
	 */
	async room(frame: number, signal: AbortSignal): Promise<void> {
		signal.throwIfAborted();
		if (frame < this.#next + this.#ahead) return;
		await new Promise<void>((resolve, reject) => {
			const waiting = { frame, resolve };
			this.#waiting.add(waiting);
			signal.addEventListener(
				"abort",
				() => {
					this.#waiting.delete(waiting);
					reject(signal.reason);
				},
				{ once: true },
			);
		});
	}

	/**
	 * Put a frame, and hand on every frame whose turn has come.
	 * @param frame The frame's number.
	 * @param jpeg The frame.
	 * @returns Once every frame that could be handed on has been.
	 */
	async put(frame: number, jpeg: Uint8Array): Promise<void> {
		this.#held.set(frame, jpeg);
		this.#handing = this.#handing.then(async () => this.#handOn());
		await this.#handing;
	}

	/** Hand on the frames held from the next onwards, as long as they follow on. */
	async #handOn(): Promise<void> {
		for (let jpeg = this.#held.get(this.#next); jpeg !== undefined;) {
			this.#held.delete(this.#next);
			// oxlint-disable-next-line no-await-in-loop -- the frames reach the encoder one after another
			await this.#sink.writeFrame(jpeg);
			this.#next += 1;
			this.#wake();
			jpeg = this.#held.get(this.#next);
		}
	}

	/** Let every page go on whose frame now has room. */
	#wake(): void {
		for (const waiting of this.#waiting) {
			if (waiting.frame < this.#next + this.#ahead) {
				this.#waiting.delete(waiting);
				waiting.resolve();
			}
		}
	}
}

export { FrameOrder, type FrameSink };

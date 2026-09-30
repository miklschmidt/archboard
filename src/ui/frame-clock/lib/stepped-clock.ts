// A clock that moves only when it is stepped, for rendering a picture frame by frame.
//
// Time stands still until the renderer says where it is now. Timers run at the
// times they were due, frames are run when the renderer asks, and every
// animation the browser runs by itself is paused and set to where this clock
// says it is. A picture's traffic runs on each picture's own SVG clock, which
// is paused and set too, carried from where it was last stood.
//
// A frame anything on the page asks of the browser, a library's included, is
// run by this clock instead, at this clock's time. An animation on a timeline
// it cannot stand is a picture the renderer cannot reproduce, so the clock
// records it as a violation instead of letting it pass.

import {
	syncAnimation,
	syncPicture,
	type DrivenAnimation,
	type DrivenPicture,
	type SvgAdoption,
} from "@/ui/frame-clock/lib/animation-sync";
import type { FrameClock } from "@/ui/frame-clock/lib/clock";

/** Something that moved outside the clock. */
interface ClockViolation {
	/** The clock's time when it was noticed, in milliseconds. */
	readonly at: number;
	/** What happened. */
	readonly what: string;
}

/** A document, as far as the clock drives what moves in it. */
interface AnimatedDocument {
	/** The timeline its animations run on. */
	readonly timeline: object;
	/**
	 * The animations running in it.
	 * @returns Them.
	 */
	readonly getAnimations: () => readonly DrivenAnimation[];
	/**
	 * Its pictures, outermost and nested.
	 * @param selectors The selector for pictures.
	 * @returns Them.
	 */
	readonly querySelectorAll: (selectors: "svg") => Iterable<DrivenPicture>;
}

/** A window, as far as the clock takes its frames away. */
type FramedWindow = Pick<Window, "requestAnimationFrame" | "cancelAnimationFrame">;

/** A timer waiting to fall due. */
interface Timer {
	readonly due: number;
	readonly callback: () => void;
}

/**
 * The timer that falls due first by a time, the one set first on a tie.
 * @param timers The timers, in the order they were set.
 * @param by The time.
 * @returns The timer's number, or null when none is due.
 */
function firstDue(timers: ReadonlyMap<number, Timer>, by: number): number | null {
	let first: [number, Timer] | null = null;
	for (const entry of timers) {
		if (entry[1].due <= by && (first === null || entry[1].due < first[1].due)) first = entry;
	}
	return first === null ? null : first[0];
}

/** A clock that stands at a time until the renderer steps it. */
class SteppedClock implements FrameClock {
	readonly animates = true;
	#time: number;
	#requests = 0;
	readonly #frames = new Map<number, (time: number) => void>();
	readonly #timers = new Map<number, Timer>();
	readonly #pictures = new WeakMap<DrivenPicture, SvgAdoption>();
	readonly #animations = new WeakMap<DrivenAnimation, number>();
	readonly #finished = new WeakSet<DrivenAnimation>();
	readonly #noticed: ClockViolation[] = [];
	#browserFrame: ((callback: FrameRequestCallback) => number) | null = null;

	/**
	 * A clock standing at a time.
	 * @param start Where it stands, in milliseconds.
	 */
	constructor(start: number) {
		this.#time = start;
	}

	/**
	 * The time the clock stands at.
	 * @returns Milliseconds.
	 */
	now(): number {
		return this.#time;
	}

	/**
	 * Ask for the next frame the renderer runs.
	 * @param callback Run once, with the frame's time.
	 * @returns The request.
	 */
	requestFrame(callback: (time: number) => void): number {
		this.#requests += 1;
		this.#frames.set(this.#requests, callback);
		return this.#requests;
	}

	/**
	 * Take back a frame asked for.
	 * @param request The request.
	 */
	cancelFrame(request: number): void {
		this.#frames.delete(request);
	}

	/**
	 * Run something once the clock has moved on this far.
	 * @param ms How far, in milliseconds.
	 * @param callback What to run.
	 * @returns The timer.
	 */
	after(ms: number, callback: () => void): number {
		this.#requests += 1;
		this.#timers.set(this.#requests, { due: this.#time + Math.max(0, ms), callback });
		return this.#requests;
	}

	/**
	 * Take back a timer.
	 * @param timer The timer.
	 */
	cancelAfter(timer: number): void {
		this.#timers.delete(timer);
	}

	/**
	 * Where a picture's own clock stands by this one.
	 * @param root The picture's root.
	 * @returns Its time, in seconds.
	 */
	svgTime(root: DrivenPicture): number {
		const { base, at } = this.#adoptionOf(root);
		return base + (this.#time - at) / 1000;
	}

	/**
	 * Stand a picture's own clock somewhere, from now.
	 * @param root The picture's root.
	 * @param seconds Where.
	 */
	setSvgTime(root: DrivenPicture, seconds: number): void {
		this.#pictures.set(root, { base: seconds, at: this.#time });
	}

	/**
	 * Move the clock on, running every timer that falls due on the way at its own time.
	 * @param to Where the clock is now, in milliseconds; never earlier than it was.
	 */
	advanceTo(to: number): void {
		if (to < this.#time) {
			throw new RangeError(`The clock stands at ${this.#time} ms and cannot go back to ${to} ms.`);
		}
		for (let id = firstDue(this.#timers, to); id !== null; id = firstDue(this.#timers, to)) {
			const timer = this.#timers.get(id)!;
			this.#timers.delete(id);
			this.#time = timer.due;
			timer.callback();
		}
		this.#time = to;
	}

	/** Run every frame asked for so far, at the clock's time; one asked for meanwhile waits for the next. */
	runFrame(): void {
		const due = [...this.#frames.values()];
		this.#frames.clear();
		for (const callback of due) callback(this.#time);
	}

	/**
	 * Stand every animation and picture clock in a document where this clock says it is.
	 * @param document The document.
	 */
	syncAnimations(document: AnimatedDocument): void {
		const book = {
			now: this.#time,
			timeline: document.timeline,
			animations: this.#animations,
			finished: this.#finished,
		};
		for (const animation of document.getAnimations()) {
			const outcome = syncAnimation(animation, book);
			if (outcome !== null) this.#notice(outcome);
		}
		for (const root of document.querySelectorAll("svg")) {
			if (root.ownerSVGElement === null) syncPicture(root, this.#adoptionOf(root), this.#time);
		}
	}

	/**
	 * What moved outside the clock so far.
	 * @returns The violations, oldest first.
	 */
	violations(): readonly ClockViolation[] {
		return [...this.#noticed];
	}

	/**
	 * Take the browser's own frames over for a window: a frame asked of the
	 * browser there is run by this clock instead, at this clock's time.
	 * @param window The window.
	 */
	install(window: FramedWindow): void {
		this.#browserFrame = window.requestAnimationFrame.bind(window);
		window.requestAnimationFrame = this.requestFrame.bind(this);
		window.cancelAnimationFrame = this.cancelFrame.bind(this);
	}

	/**
	 * Wait for the browser to draw once.
	 * @returns Once it has.
	 */
	async paint(): Promise<void> {
		const ask = this.#browserFrame ?? requestAnimationFrame;
		await new Promise<void>((resolve) => {
			ask(() => {
				resolve();
			});
		});
	}

	/**
	 * Record what moved outside the clock.
	 * @param what What happened.
	 */
	#notice(what: string): void {
		this.#noticed.push({ at: this.#time, what });
	}

	/**
	 * Where a picture's clock was stood, standing it at nought now when it never was.
	 * @param root The picture's root.
	 * @returns Its adoption.
	 */
	#adoptionOf(root: DrivenPicture): SvgAdoption {
		const known = this.#pictures.get(root);
		if (known !== undefined) return known;
		const adopted = { base: 0, at: this.#time };
		this.#pictures.set(root, adopted);
		return adopted;
	}
}

/**
 * A clock that stands at a time until it is stepped.
 * @param start Where it stands, in milliseconds.
 * @returns The clock.
 */
function createSteppedClock(start: number): SteppedClock {
	return new SteppedClock(start);
}

export { createSteppedClock, type ClockViolation, type SteppedClock };

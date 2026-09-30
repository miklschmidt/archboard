// The clock a recording's frames are rendered on.
//
// What these catch: a timer that runs early, late, out of order or after it was
// taken back; a frame that runs twice or with another time than the clock's; an
// animation or a picture's traffic that is not standing where the clock says,
// or a finished one not finished exactly once; and a frame asked of the browser
// that runs behind the clock instead of on it.

import { describe, expect, test } from "bun:test";

import { createSteppedClock } from "@/ui/frame-clock/replay";

/** A timeline the fakes run on, told apart by identity alone. */
type FakeTimeline = object;

/**
 * A timeline of its own.
 * @returns It.
 */
function timelineOf(): FakeTimeline {
	return {};
}

/** An animation the browser would run, reduced to what the clock touches. */
class FakeAnimation {
	playbackRate = 1;
	currentTime: number | null = null;
	pauses = 0;
	finishes = 0;
	readonly effect: FakeEffect;

	/**
	 * An animation.
	 * @param timeline The timeline it runs on.
	 * @param endTime Where it ends in its own time, in milliseconds.
	 */
	constructor(
		readonly timeline: FakeTimeline,
		endTime: number,
	) {
		this.effect = new FakeEffect(endTime);
	}

	/** Pause it. */
	pause(): void {
		this.pauses += 1;
	}

	/** Finish it. */
	finish(): void {
		this.finishes += 1;
	}
}

/** What an animation animates, reduced to where it ends. */
class FakeEffect {
	/**
	 * An effect.
	 * @param endTime Where it ends, in milliseconds.
	 */
	constructor(readonly endTime: number) {}

	/**
	 * Its timing.
	 * @returns Where it ends.
	 */
	getComputedTiming(): { readonly endTime: number } {
		return { endTime: this.endTime };
	}
}

/** A picture's root, reduced to its own animation clock. */
class FakePicture {
	time: number | null = null;
	paused = false;

	/**
	 * A picture, outermost or inside another.
	 * @param ownerSVGElement The picture it is inside, or null.
	 */
	constructor(readonly ownerSVGElement: FakePicture | null = null) {}

	/** Pause its animations. */
	pauseAnimations(): void {
		this.paused = true;
	}

	/**
	 * Stand its clock.
	 * @param seconds Where.
	 */
	setCurrentTime(seconds: number): void {
		this.time = seconds;
	}
}

/** A document holding some animations and pictures. */
class FakeDocument {
	/**
	 * A document.
	 * @param timeline Its timeline.
	 * @param animations Its animations.
	 * @param pictures Its pictures.
	 */
	constructor(
		readonly timeline: FakeTimeline,
		readonly animations: readonly FakeAnimation[],
		readonly pictures: readonly FakePicture[] = [],
	) {}

	/**
	 * Its animations.
	 * @returns Them.
	 */
	getAnimations(): readonly FakeAnimation[] {
		return this.animations;
	}

	/**
	 * Its pictures.
	 * @returns Them.
	 */
	querySelectorAll(): readonly FakePicture[] {
		return this.pictures;
	}
}

describe("a stepped clock", () => {
	test("runs each timer once, at its own time, in the order they fall due", () => {
		const clock = createSteppedClock(0);
		const ran: string[] = [];
		/**
		 * A timer that notes when it ran.
		 * @param name Its name.
		 * @returns What it runs.
		 */
		function note(name: string): () => void {
			return (): void => {
				ran.push(`${name}@${clock.now()}`);
			};
		}
		clock.after(300, note("late"));
		clock.after(100, note("first"));
		clock.after(100, note("second"));
		const dropped = clock.after(200, note("dropped"));
		clock.after(150, () => {
			clock.after(50, note("set on the way"));
		});
		clock.cancelAfter(dropped);
		clock.advanceTo(99);
		expect(ran).toEqual([]);
		clock.advanceTo(400);
		expect(ran).toEqual(["first@100", "second@100", "set on the way@200", "late@300"]);
		expect(clock.now()).toBe(400);
		clock.advanceTo(1000);
		expect(ran).toHaveLength(4);
		expect(() => {
			clock.advanceTo(999);
		}).toThrow(RangeError);
	});

	test("runs a frame asked for once, at the clock's time, and one asked for meanwhile on the next", () => {
		const clock = createSteppedClock(1000);
		const times: number[] = [];
		/**
		 * A frame that asks for the next.
		 * @param time The frame's time.
		 */
		function tick(time: number): void {
			times.push(time);
			clock.requestFrame(tick);
		}
		clock.requestFrame(tick);
		clock.cancelFrame(clock.requestFrame(tick));
		clock.runFrame();
		clock.advanceTo(1033);
		clock.runFrame();
		expect(times).toEqual([1000, 1033]);
	});

	test("stands an animation where it has run since it was first seen, and finishes it once", () => {
		const timeline = timelineOf();
		const clock = createSteppedClock(0);
		const brief = new FakeAnimation(timeline, 150);
		const endless = new FakeAnimation(timeline, Number.POSITIVE_INFINITY);
		const document = new FakeDocument(timeline, [brief, endless]);
		clock.advanceTo(1000);
		clock.syncAnimations(document);
		expect([brief.currentTime, endless.currentTime]).toEqual([0, 0]);
		clock.advanceTo(1100);
		clock.syncAnimations(document);
		expect([brief.currentTime, endless.currentTime]).toEqual([100, 100]);
		clock.advanceTo(1200);
		clock.syncAnimations(document);
		clock.advanceTo(5000);
		clock.syncAnimations(document);
		expect(brief.finishes).toBe(1);
		expect(endless.currentTime).toBe(4000);
		expect(endless.pauses).toBe(4);
		expect(clock.violations()).toEqual([]);
	});

	test("refuses an animation on a timeline it does not drive", () => {
		const clock = createSteppedClock(0);
		const elsewhere = new FakeAnimation(timelineOf(), 100);
		clock.syncAnimations(new FakeDocument(timelineOf(), [elsewhere]));
		expect(clock.violations()).toHaveLength(1);
		expect(elsewhere.currentTime).toBeNull();
	});

	test("runs each picture's traffic on from where it was stood, and leaves nested pictures to their root", () => {
		const clock = createSteppedClock(0);
		const first = new FakePicture();
		const nested = new FakePicture(first);
		clock.advanceTo(500);
		clock.syncAnimations(new FakeDocument(timelineOf(), [], [first, nested]));
		clock.advanceTo(2500);
		clock.syncAnimations(new FakeDocument(timelineOf(), [], [first, nested]));
		expect(first.paused).toBe(true);
		expect(first.time).toBe(2);
		expect(nested.time).toBeNull();
		// The same picture put up again carries the clock of the one it replaces.
		const again = new FakePicture();
		clock.setSvgTime(again, clock.svgTime(first));
		clock.advanceTo(3000);
		clock.syncAnimations(new FakeDocument(timelineOf(), [], [again]));
		expect(again.time).toBe(2.5);
	});

	test("runs a frame asked of the browser on the clock, and still waits for the browser to draw", async () => {
		const clock = createSteppedClock(500);
		const drawn: FrameRequestCallback[] = [];
		const window = {
			/**
			 * Keep a frame to draw by hand.
			 * @param callback The frame.
			 * @returns Its number.
			 */
			requestAnimationFrame: (callback: FrameRequestCallback): number => drawn.push(callback),
			/**
			 * Nothing to take back: the browser's frames are the clock's once it is installed.
			 * @param _request The frame.
			 * @returns Nothing.
			 */
			cancelAnimationFrame: (_request: number): void => undefined,
		};
		clock.install(window);
		const times: number[] = [];
		window.requestAnimationFrame((time) => {
			times.push(time);
		});
		window.cancelAnimationFrame(
			window.requestAnimationFrame(() => {
				times.push(-1);
			}),
		);
		expect(drawn).toHaveLength(0);
		clock.runFrame();
		expect(times).toEqual([500]);
		const painted = clock.paint();
		expect(drawn).toHaveLength(1);
		drawn[0]!(0);
		await painted;
	});
});

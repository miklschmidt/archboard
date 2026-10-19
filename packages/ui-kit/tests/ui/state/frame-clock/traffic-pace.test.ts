// The pace of a picture's traffic while the camera moves.
//
// What this catches: a hold that stops anything but running traffic, or a
// resume that starts over traffic which had finished; traffic that comes back
// at its full speed at once rather than gathering it; a hold taken while it is
// coming back that leaves it running, or that misses the traffic of a picture
// put up again meanwhile; a hold that looks through the whole
// picture again for every frame of a drag; and traffic left standing still
// where the picture goes away.

import { afterEach, beforeEach, expect, test } from "bun:test";

import { PICTURE_CLOCK, driveFramesFrom } from "#ui/state/frame-clock/clock.ts";
import { paceTraffic } from "#ui/state/frame-clock/traffic-pace.ts";
import { createSteppedClock, type SteppedClock } from "#ui/state/frame-clock/stepped-clock.ts";

/** An animation reduced to what pacing touches. */
class FakeAnimation {
	playbackRate = 1;

	/**
	 * An animation.
	 * @param id Its id: the picture clock's for traffic.
	 * @param playState Where it stands.
	 */
	constructor(
		readonly id: string,
		public playState: AnimationPlayState,
	) {}

	/** Stop it where it is. */
	pause(): void {
		this.playState = "paused";
	}

	/** Run it, from where it stands; a finished one starts over. */
	play(): void {
		this.playState = "running";
	}
}

/** An element holding some animations, and how often it was asked for them. */
class FakeElement {
	asked = 0;

	/**
	 * An element.
	 * @param animations Its animations.
	 */
	constructor(readonly animations: readonly FakeAnimation[]) {}

	/**
	 * Its animations.
	 * @returns Them.
	 */
	getAnimations(): readonly FakeAnimation[] {
		this.asked += 1;
		return this.animations;
	}
}

const RAMP_MS = 1000;
let clock: SteppedClock;
let release: () => void;

beforeEach(() => {
	clock = createSteppedClock(0);
	release = driveFramesFrom(clock);
});

afterEach(() => {
	release();
});

/**
 * Let the clock run on and draw a frame there.
 * @param to Where the clock is, in milliseconds.
 */
function frameAt(to: number): void {
	clock.advanceTo(to);
	clock.runFrame();
}

test("a hold stops the running traffic and a resume runs only that again", () => {
	const running = new FakeAnimation(PICTURE_CLOCK, "running");
	const finished = new FakeAnimation(PICTURE_CLOCK, "finished");
	const flight = new FakeAnimation("", "running");
	const pace = paceTraffic(new FakeElement([running, finished, flight]));

	pace.hold();
	expect([running.playState, finished.playState, flight.playState]).toEqual([
		"paused",
		"finished",
		"running",
	]);

	flight.pause();
	pace.resume(RAMP_MS);
	frameAt(RAMP_MS);
	expect([running.playState, finished.playState, flight.playState]).toEqual([
		"running",
		"finished",
		"paused",
	]);
});

test("traffic comes back from standing still and gathers speed until it is at its own", () => {
	const traffic = new FakeAnimation(PICTURE_CLOCK, "running");
	const pace = paceTraffic(new FakeElement([traffic]));
	pace.hold();
	pace.resume(RAMP_MS);
	expect(traffic.playbackRate).toBe(0);

	const rates: number[] = [];
	for (const at of [100, 250, 500, 750, 900, RAMP_MS]) {
		frameAt(at);
		rates.push(traffic.playbackRate);
	}

	expect(rates.toSorted((a, b) => a - b)).toEqual(rates);
	expect(rates[0]).toBeLessThan(0.1);
	expect(rates[2]).toBeCloseTo(0.5, 5);
	expect(rates.at(-1)).toBe(1);
});

test("a hold taken while traffic is coming back stands it still, and it comes back again from nothing", () => {
	const traffic = new FakeAnimation(PICTURE_CLOCK, "running");
	const pace = paceTraffic(new FakeElement([traffic]));
	pace.hold();
	pace.resume(RAMP_MS);
	frameAt(600);
	expect(traffic.playbackRate).toBeGreaterThan(0.5);

	pace.hold();
	frameAt(900);
	expect(traffic.playState).toBe("paused");

	pace.resume(RAMP_MS);
	expect(traffic.playbackRate).toBe(0);
	frameAt(900 + RAMP_MS);
	expect([traffic.playState, traffic.playbackRate]).toEqual(["running", 1]);
});

test("a hold after the picture was put up again while its traffic came back stands the new traffic still", () => {
	const replaced = new FakeAnimation(PICTURE_CLOCK, "running");
	const animations = [replaced];
	const pace = paceTraffic(new FakeElement(animations));
	pace.hold();
	pace.resume(RAMP_MS);
	frameAt(300);

	// The picture is put up again: its old traffic is cancelled, and the new picture runs its own.
	replaced.playState = "idle";
	const fresh = new FakeAnimation(PICTURE_CLOCK, "running");
	animations.push(fresh);
	pace.hold();

	expect(fresh.playState).toBe("paused");
});

test("holding again, as every frame of a drag does, looks through the picture once", () => {
	const element = new FakeElement([new FakeAnimation(PICTURE_CLOCK, "running")]);
	const pace = paceTraffic(element);

	for (let move = 0; move < 20; move += 1) pace.hold();

	expect(element.asked).toBe(1);
});

test("a picture with no traffic asks for no frames when it is resumed", () => {
	let asked = 0;
	const request = clock.requestFrame.bind(clock);
	/**
	 * Ask for a frame, and count it.
	 * @param callback Run once, with the frame's time.
	 * @returns The request.
	 */
	clock.requestFrame = (callback) => {
		asked += 1;
		return request(callback);
	};
	const pace = paceTraffic(new FakeElement([new FakeAnimation("", "running")]));

	pace.hold();
	pace.resume(RAMP_MS);

	expect(asked).toBe(0);
});

test("letting go runs the traffic at its own speed at once", () => {
	const traffic = new FakeAnimation(PICTURE_CLOCK, "running");
	const pace = paceTraffic(new FakeElement([traffic]));
	pace.hold();
	pace.resume(RAMP_MS);
	frameAt(300);

	pace.release();

	expect([traffic.playState, traffic.playbackRate]).toEqual(["running", 1]);
	// Nothing is left asking for frames that would change its speed again.
	frameAt(600);
	expect(traffic.playbackRate).toBe(1);
});

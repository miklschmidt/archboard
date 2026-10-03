// Holding a picture's traffic while the picture is dragged.
//
// What this catches: a release that starts over traffic which had finished, or
// that runs an animation the hold never stopped, such as a picture's flight;
// and a hold that stops anything but running traffic.

import { expect, test } from "bun:test";

import { PICTURE_CLOCK, holdTraffic } from "@/ui/frame-clock";

/** An animation reduced to what a hold touches. */
class FakeAnimation {
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

/** An element holding some animations. */
class FakeElement {
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
		return this.animations;
	}
}

test("a drag holds the running traffic and runs only that again", () => {
	const running = new FakeAnimation(PICTURE_CLOCK, "running");
	const finished = new FakeAnimation(PICTURE_CLOCK, "finished");
	const flight = new FakeAnimation("", "running");
	const release = holdTraffic(new FakeElement([running, finished, flight]));

	expect([running.playState, finished.playState, flight.playState]).toEqual([
		"paused",
		"finished",
		"running",
	]);

	flight.pause();
	release();

	expect([running.playState, finished.playState, flight.playState]).toEqual([
		"running",
		"finished",
		"paused",
	]);
});

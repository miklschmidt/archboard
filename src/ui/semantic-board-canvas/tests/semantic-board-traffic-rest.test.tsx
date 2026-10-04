// The traffic of a picture while its camera is moved by a hand.
//
// What this catches: traffic that keeps running under a drag, or that comes
// back the moment a drag is let go, while the thrown picture is still coasting;
// traffic that jumps to its full speed once the picture has stopped, rather than
// gathering it; and a camera the stage moves itself, which never needs the
// traffic stood still.

import { act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { EXPLORING_MS } from "@/shared/timing/timing";
import { PICTURE_CLOCK } from "@/ui/frame-clock";
import { cameraNow, pointerAt, takeFrames } from "@/ui/semantic-board-canvas/tests/camera-probes";
import {
	drawing,
	mountStage,
	server,
	settle,
	surface,
	viewport,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** A moving mark of traffic, reduced to what pacing touches. */
class FakeTraffic {
	readonly id = PICTURE_CLOCK;
	playbackRate = 1;
	playState: AnimationPlayState = "running";

	/** Stop it where it is. */
	pause(): void {
		this.playState = "paused";
	}

	/** Run it from where it stands. */
	play(): void {
		this.playState = "running";
	}
}

/**
 * The animations of an element that has none.
 * @returns None.
 */
function noAnimations(): [] {
	return [];
}

// This DOM runs no animations, so the page is told that it can list them.
let listed = true;

beforeEach(() => {
	const dom = Element.prototype as { getAnimations?: unknown };
	listed = "getAnimations" in dom;
	if (!listed) dom.getAnimations = noAnimations;
});

afterEach(() => {
	if (!listed) delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
});

/**
 * Mount a pane and give its picture some traffic.
 * @returns The traffic.
 */
async function mountWithTraffic(): Promise<FakeTraffic> {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const traffic = new FakeTraffic();
	/**
	 * The surface's animations: the traffic.
	 * @returns Them.
	 */
	function trafficOnSurface(): FakeTraffic[] {
		return [traffic];
	}
	Object.assign(surface(), { getAnimations: trafficOnSurface });
	return traffic;
}

/** Drag the picture fast, and keep the pointer down. */
function dragPicture(): void {
	// 200 pixels in 80 milliseconds, let go at once: 2.5 pixels a millisecond.
	pointerAt("pointerdown", { x: 100, t: 1000 });
	for (let step = 1; step <= 5; step += 1) {
		pointerAt("pointermove", { x: 100 + step * 40, t: 1000 + step * 16 });
	}
}

test("traffic stands still under a drag and a throw, and comes back gently once the picture rests", async () => {
	const traffic = await mountWithTraffic();
	const frames = takeFrames();
	try {
		dragPicture();
		expect(traffic.playState).toBe("paused");

		pointerAt("pointerup", { x: 300, t: 1082 });
		// Coasting: the picture moves on, and the traffic is still for as long as it does.
		const letGo = cameraNow().x;
		let waited = 0;
		for (; waited < 4000 && traffic.playState === "paused"; waited += 16) frames.run(16);
		expect(cameraNow().x).toBeGreaterThan(letGo + 50);
		expect(waited).toBeGreaterThan(EXPLORING_MS.cameraFling * 3);

		// The traffic came back as a creep, and the picture had stopped for good before it did.
		expect(traffic.playState).toBe("running");
		expect(traffic.playbackRate).toBeLessThan(0.05);
		const stopped = cameraNow().x;
		frames.run(100);
		expect(cameraNow().x).toBe(stopped);

		frames.run(EXPLORING_MS.trafficStart / 2);
		expect(traffic.playbackRate).toBeGreaterThan(0.3);
		expect(traffic.playbackRate).toBeLessThan(0.7);
		frames.run(EXPLORING_MS.trafficStart / 2 + 100);
		expect(traffic.playbackRate).toBe(1);
	} finally {
		frames.restore();
	}
});

test("a drag that rests with the pointer held down keeps the traffic still", async () => {
	const traffic = await mountWithTraffic();
	const frames = takeFrames();
	try {
		dragPicture();
		frames.run(EXPLORING_MS.trafficRest * 4);

		expect(traffic.playState).toBe("paused");
	} finally {
		frames.restore();
	}
});

test("a key that moves the camera stands the traffic still until the camera has settled", async () => {
	const traffic = await mountWithTraffic();
	const frames = takeFrames();
	try {
		act(() => {
			fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
		});
		frames.run(32);
		expect(traffic.playState).toBe("paused");

		frames.run(3000);
		expect([traffic.playState, traffic.playbackRate]).toEqual(["running", 1]);
	} finally {
		frames.restore();
	}
});

test("a camera the stage moves itself leaves the traffic running", async () => {
	const traffic = await mountWithTraffic();
	const frames = takeFrames();
	try {
		act(() => {
			fireEvent.keyDown(viewport(), { key: "0" });
		});
		frames.run(EXPLORING_MS.cameraFit + 100);

		expect([traffic.playState, traffic.playbackRate]).toEqual(["running", 1]);
	} finally {
		frames.restore();
	}
});

// How the camera moves between a gesture and rest.
//
// What these catch: a pinch that zooms by hundreds of times per second because
// every event zooms by a fixed step, a zoom that drifts sideways on its way in,
// a move that lands somewhere else when the frames are slower, and two fingers
// that pinch with the picture sliding out from between them.

import { describe, expect, test } from "bun:test";

import {
	STILL,
	easeMotion,
	pinchCamera,
	stepMotion,
	wheelZoomFactor,
	zoomMotion,
	type Motion,
} from "@/ui/semantic-board-canvas/transitions";

type Camera = { x: number; y: number; scale: number };

const START: Camera = { x: 30, y: 20, scale: 0.8 };

/**
 * Run a motion until it rests, frame by frame.
 * @param from The camera at the start.
 * @param motion What it does.
 * @param frame How long a frame is, in milliseconds.
 * @param watch Called with the camera after each frame.
 * @returns The camera at rest, and how many frames it took.
 */
function runToRest(
	from: Camera,
	motion: Motion,
	frame = 16,
	watch: (camera: Camera) => void = () => undefined,
): { camera: Camera; frames: number } {
	let camera = from;
	let moving: Motion | null = motion;
	let frames = 0;
	while (moving !== null && frames < 2000) {
		const stepped = stepMotion(camera, moving, frame);
		camera = stepped.camera;
		moving = stepped.motion;
		frames += 1;
		watch(camera);
	}
	return { camera, frames };
}

/** A point, in whatever units its user means. */
type Point = { x: number; y: number };

/**
 * The diagram point under a point of the viewport.
 * @param camera Where the camera is.
 * @param at The viewport point.
 * @returns The diagram point.
 */
function under(camera: Camera, at: Point): Point {
	return { x: (at.x - camera.x) / camera.scale, y: (at.y - camera.y) / camera.scale };
}

/**
 * How far across an ease of 100 pixels has got after some time.
 * @param time How long it has run, in milliseconds.
 * @param frame How long a frame is, in milliseconds.
 * @returns How far across the camera has moved, in pixels.
 */
function easedAfter(time: number, frame: number): number {
	let camera = START;
	let moving: Motion | null = easeMotion(STILL, 100, 0);
	for (let ran = 0; ran < time && moving !== null; ran += frame) {
		const stepped = stepMotion(camera, moving, frame);
		camera = stepped.camera;
		moving = stepped.motion;
	}
	return camera.x - START.x;
}

/**
 * The zoom factor of one turn of a mouse wheel.
 * @param deltaY How far it turned.
 * @param extra Whether it counts lines or pages, or Control is held.
 * @returns The factor.
 */
function turn(
	deltaY: number,
	extra: Partial<{ deltaMode: number; ctrlKey: boolean }> = {},
): number {
	return wheelZoomFactor({ deltaY, deltaMode: 0, ctrlKey: false, ...extra });
}

describe("a turn of the wheel", () => {
	test("zooms by how far it turned, and a notch is the step a key zooms by", () => {
		expect(turn(-100)).toBeCloseTo(1.1, 9);
		expect(turn(100)).toBeCloseTo(1 / 1.1, 9);
		expect(turn(-50)).toBeCloseTo(Math.sqrt(1.1), 9);
		expect(turn(0)).toBe(1);
	});

	test("a pinch turns far less to zoom as much, and no one event zooms past a few notches", () => {
		expect(turn(-10, { ctrlKey: true })).toBeCloseTo(1.1, 9);
		expect(turn(-100000)).toBeCloseTo(1.1 ** 3, 9);
	});

	test("counts a line and a page for more than a pixel", () => {
		expect(turn(-3, { deltaMode: 1 })).toBeCloseTo(1.1 ** 0.99, 9);
		expect(turn(-0.25, { deltaMode: 2 })).toBeCloseTo(1.1, 9);
	});
});

describe("a zoom", () => {
	const POINTER = { x: 400, y: 250 };

	test("keeps the part of the diagram under the pointer under it on every frame", () => {
		const held = under(START, POINTER);
		const motion = zoomMotion(START, STILL, 2.5, POINTER);
		runToRest(START, motion, 16, (camera) => {
			const now = under(camera, POINTER);
			expect(now.x).toBeCloseTo(held.x, 6);
			expect(now.y).toBeCloseTo(held.y, 6);
		});
	});

	test("lands exactly on the magnification asked for, however fast the frames come", () => {
		const motion = zoomMotion(START, STILL, 2.5, POINTER);
		const smooth = runToRest(START, motion, 8).camera;
		const slow = runToRest(START, motion, 50).camera;
		expect(smooth.scale).toBeCloseTo(START.scale * 2.5, 9);
		expect(slow.scale).toBeCloseTo(START.scale * 2.5, 9);
		expect(slow.x).toBeCloseTo(smooth.x, 6);
		expect(slow.y).toBeCloseTo(smooth.y, 6);
	});

	test("runs toward the target rather than jumping to it", () => {
		const motion = zoomMotion(START, STILL, 2, POINTER);
		const first = stepMotion(START, motion, 16);
		expect(first.camera.scale).toBeGreaterThan(START.scale);
		expect(first.camera.scale).toBeLessThan(START.scale * 2);
		expect(first.motion).not.toBeNull();
	});

	test("adds to the zoom under way, so a hard flick is one long ease", () => {
		const first = zoomMotion(START, STILL, 1.1, POINTER);
		const midway = stepMotion(START, first, 16).camera;
		const second = zoomMotion(midway, first, 1.1, POINTER);
		const { camera } = runToRest(midway, second);
		expect(camera.scale).toBeCloseTo(START.scale * 1.21, 9);
	});

	test("goes no further than the limits, and a camera at a limit is not set moving", () => {
		const far = runToRest(START, zoomMotion(START, STILL, 1000, POINTER)).camera;
		expect(far.scale).toBe(8);
		expect(zoomMotion(far, STILL, 2, POINTER)).toBe(STILL);
		const near = runToRest(START, zoomMotion(START, STILL, 1e-6, POINTER)).camera;
		expect(near.scale).toBe(0.05);
	});
});

describe("an ease", () => {
	test("covers exactly the distance it was asked for, and adds to a move under way", () => {
		const { camera } = runToRest(START, easeMotion(easeMotion(STILL, 64, 0), 64, -32));
		expect(camera.x).toBeCloseTo(START.x + 128, 6);
		expect(camera.y).toBeCloseTo(START.y - 32, 6);
		expect(camera.scale).toBe(START.scale);
	});

	test("gets there at the same pace whatever the frame rate", () => {
		expect(easedAfter(160, 8)).toBeCloseTo(easedAfter(160, 32), 0);
	});

	test("moves a zoom's held point along with it", () => {
		const POINTER = { x: 400, y: 250 };
		const zoom = zoomMotion(START, STILL, 2, POINTER);
		const both = easeMotion(zoom, 50, 0);
		const { camera } = runToRest(START, both);
		// The part under the pointer when the zoom began is now 50 pixels to the right of it.
		const was = under(START, POINTER);
		expect(camera.x + was.x * camera.scale).toBeCloseTo(POINTER.x + 50, 6);
	});
});

describe("two fingers that pinch", () => {
	test("grow the picture by as much as they spread, and keep the part between them between them", () => {
		const held = under(START, { x: 150, y: 100 });
		const camera = pinchCamera(
			START,
			[
				{ x: 100, y: 100 },
				{ x: 200, y: 100 },
			],
			[
				{ x: 50, y: 100 },
				{ x: 250, y: 100 },
			],
		);
		expect(camera.scale).toBeCloseTo(START.scale * 2, 9);
		const now = under(camera, { x: 150, y: 100 });
		expect(now.x).toBeCloseTo(held.x, 9);
		expect(now.y).toBeCloseTo(held.y, 9);
	});

	test("carry the picture with them when they move together, at the same size", () => {
		const camera = pinchCamera(
			START,
			[
				{ x: 100, y: 100 },
				{ x: 200, y: 140 },
			],
			[
				{ x: 130, y: 110 },
				{ x: 230, y: 150 },
			],
		);
		expect(camera.scale).toBeCloseTo(START.scale, 9);
		expect(camera.x).toBeCloseTo(START.x + 30, 9);
		expect(camera.y).toBeCloseTo(START.y + 10, 9);
	});

	test("go no further than the limits", () => {
		const camera = pinchCamera(
			START,
			[
				{ x: 100, y: 100 },
				{ x: 101, y: 100 },
			],
			[
				{ x: 0, y: 100 },
				{ x: 1000, y: 100 },
			],
		);
		expect(camera.scale).toBe(8);
	});
});

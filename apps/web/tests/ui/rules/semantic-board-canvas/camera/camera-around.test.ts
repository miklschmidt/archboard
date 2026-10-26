// How the camera fits a subject with the parts around it, as a step through a
// design question's answer asks.
//
// What these catch: a step whose parts lie far apart zoomed out until no card
// on screen reads, and a far part that pushes a near one out of the frame.

import { expect, test } from "bun:test";

import {
	READ_SCALE,
	cameraFor,
	type Camera,
	type Rect,
} from "#ui/rules/semantic-board-canvas/camera/camera.ts";

const VIEWPORT = { width: 1200, height: 800 };
const SUBJECT: Rect = { x: 0, y: 0, width: 200, height: 80 };

/**
 * The camera for the subject with parts around it.
 * @param around Where the parts around it lie.
 * @returns The camera.
 */
function fitted(around: readonly Rect[]): Camera {
	const camera = cameraFor(VIEWPORT, { kind: "around", subject: SUBJECT, around });
	if (camera === null) throw new Error("the viewport has room to fit");
	return camera;
}

/**
 * Whether a rectangle of the diagram lies across the viewport, left to right.
 * @param camera Where the camera is.
 * @param box The rectangle, in the diagram's units.
 * @returns True when all of it does.
 */
function inSight(camera: Camera, box: Rect): boolean {
	const left = camera.x + box.x * camera.scale;
	return left >= 0 && left + box.width * camera.scale <= VIEWPORT.width;
}

test("parts around that read are framed with the subject, centred", () => {
	const camera = fitted([{ x: 1200, y: 0, width: 200, height: 80 }]);
	expect(camera.scale).toBeGreaterThanOrEqual(READ_SCALE);
	expect(camera.x + 700 * camera.scale).toBeCloseTo(VIEWPORT.width / 2);
});

test("the nearer part is taken in first, and the one that would take the camera past the size cards read is left out", () => {
	// Either part fits with the subject at that size, and both together do not.
	const near = { x: -1000, y: 0, width: 200, height: 80 };
	const far = { x: 1600, y: 0, width: 200, height: 80 };
	const camera = fitted([far, near]);
	// At that size, not closer, so as much beyond the near part as reads is in sight too.
	expect(camera.scale).toBe(READ_SCALE);
	expect(inSight(camera, SUBJECT)).toBe(true);
	expect(inSight(camera, near)).toBe(true);
	expect(inSight(camera, far)).toBe(false);
});

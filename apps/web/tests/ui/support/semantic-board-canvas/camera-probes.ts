// Reading a pane's camera back off its surface, and moving it the way a
// pointer does, for the stage tests.

import { act, fireEvent } from "@testing-library/react";

import { createSteppedClock, driveFramesFrom } from "@archboard/ui-kit/frame-clock";
import { surface, viewport } from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

/** How long a camera that was moved by hand is given to come to rest, in milliseconds. */
const REST_MS = 1500;

/** A frame, in milliseconds. */
const FRAME_MS = 16;

/** The frame clock, taken for a test and run by hand. */
interface FramesByHand {
	/**
	 * Run frames, in the page's act, for this long.
	 * @param ms How long, in milliseconds.
	 */
	readonly run: (ms: number) => void;
	/**
	 * How many frames have been asked for so far.
	 * @returns The count.
	 */
	readonly asked: () => number;
	/** Give the browser's frames back. */
	readonly restore: () => void;
}

/**
 * Take the frame clock, so a move that runs over many frames can be run to its end.
 * @returns How to run it, how many frames were asked of it, and how to give it back.
 */
function takeFrames(): FramesByHand {
	const clock = createSteppedClock(0);
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
	const restore = driveFramesFrom(clock);
	let now = 0;
	return {
		/**
		 * Run frames for this long.
		 * @param ms How long, in milliseconds.
		 */
		run: (ms) => {
			for (const end = now + ms; now < end;) {
				now += FRAME_MS;
				act(() => {
					clock.advanceTo(now);
					clock.runFrame();
				});
			}
		},
		/**
		 * How many frames have been asked for.
		 * @returns The count.
		 */
		asked: () => asked,
		restore,
	};
}

/**
 * Press a key at the viewport and let the camera it moves come to rest.
 * @param key The key.
 */
function pressKey(key: string): void {
	const frames = takeFrames();
	try {
		act(() => {
			fireEvent.keyDown(viewport(), { key });
		});
		frames.run(REST_MS);
	} finally {
		frames.restore();
	}
}

/** Where the pane is looking, read back off the surface. */
interface ReadCamera {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
}

/**
 * Where the pane is looking, as the surface's transform says.
 * @returns The camera.
 */
function cameraNow(): ReadCamera {
	const said = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
		surface().style.transform,
	);
	if (said === null) {
		throw new Error(`The surface is not transformed: "${surface().style.transform}"`);
	}
	return { x: Number(said[1]), y: Number(said[2]), scale: Number(said[3]) };
}

/**
 * A wheel notch over one point of the viewport.
 *
 * The coordinates are attached rather than passed in: this DOM's `WheelEvent`
 * drops the mouse half of its initialiser, and where the pointer is, is the
 * whole of what a zoom about it depends on. So is Control, which is how a
 * trackpad says it is pinching.
 * @param deltaY How far the wheel turned; negative comes closer.
 * @param at Where the pointer is, in the viewport.
 * @param pinch Whether it is a pinch on a trackpad: a wheel with Control held.
 * @returns The event to dispatch.
 */
function wheelAt(deltaY: number, at: readonly [number, number], pinch = false): WheelEvent {
	const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
	Object.defineProperty(event, "clientX", { value: at[0] });
	Object.defineProperty(event, "clientY", { value: at[1] });
	Object.defineProperty(event, "ctrlKey", { value: pinch });
	return event;
}

/**
 * Send a pointer event to the viewport as it would arrive at a moment.
 *
 * The moment is attached rather than passed in, for the reason the wheel's
 * coordinates are: this DOM stamps an event with the time it was made, and how
 * fast a drag was going when it was let go is the whole of what a throw
 * depends on.
 * @param type The event, such as "pointermove".
 * @param at The pointer's place in the viewport, and the moment in milliseconds.
 * @param at.x Across.
 * @param at.t When.
 */
function pointerAt(type: string, at: { readonly x: number; readonly t: number }): void {
	const event = new PointerEvent(type, {
		pointerId: 1,
		button: 0,
		buttons: type === "pointerup" ? 0 : 1,
		clientX: at.x,
		clientY: 100,
		bubbles: true,
		cancelable: true,
	});
	Object.defineProperty(event, "timeStamp", { value: at.t });
	act(() => {
		viewport().dispatchEvent(event);
	});
}

/**
 * Which point of the diagram is under one point of the viewport.
 * @param camera Where the pane is looking.
 * @param at The viewport point.
 * @returns The diagram point.
 */
function diagramPointUnder(camera: ReadCamera, at: readonly [number, number]): [number, number] {
	return [(at[0] - camera.x) / camera.scale, (at[1] - camera.y) / camera.scale];
}

export {
	REST_MS,
	cameraNow,
	diagramPointUnder,
	pointerAt,
	pressKey,
	takeFrames,
	wheelAt,
	type FramesByHand,
	type ReadCamera,
};

// Reading a pane's camera back off its surface, and moving it the way a
// pointer does, for the stage tests.

import { surface } from "@/ui/semantic-board-canvas/tests/stage-harness";

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
 * whole of what a zoom about it depends on.
 * @param deltaY How far the wheel turned; negative comes closer.
 * @param at Where the pointer is, in the viewport.
 * @returns The event to dispatch.
 */
function wheelAt(deltaY: number, at: readonly [number, number]): WheelEvent {
	const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
	Object.defineProperty(event, "clientX", { value: at[0] });
	Object.defineProperty(event, "clientY", { value: at[1] });
	return event;
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

export { cameraNow, diagramPointUnder, wheelAt, type ReadCamera };

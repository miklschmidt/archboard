import { EXPLORING_MS } from "@archboard/timing";
import type { BoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { PAN_STEP, type Size } from "#ui/rules/semantic-board-canvas/camera/camera.ts";

/** Which way each arrow key moves the diagram under the viewport. */
const PAN_KEYS: Readonly<Record<string, readonly [number, number]>> = {
	ArrowUp: [0, 1],
	ArrowDown: [0, -1],
	ArrowLeft: [1, 0],
	ArrowRight: [-1, 0],
};

/** Which way each zoom key goes. Both spellings of each: shifted and not. */
const ZOOM_KEYS: Readonly<Record<string, number>> = { "+": 1, "=": 1, "-": -1, _: -1 };

/**
 * Act on a key that moves the camera: the arrows ease it, `+` and `-` ease a
 * zoom about the middle, and `0` glides to the whole board.
 * @param key The key that was pressed.
 * @param camera The camera.
 * @param content How big the diagram is, for the key that fits it.
 * @param reducedMotion Whether the person asked for no motion, which makes the fit a cut.
 * @returns True when the key was one of the camera's.
 */
function moveCameraByKey(
	key: string,
	camera: Pick<BoardCamera, "ease" | "zoomCentre" | "glide">,
	content: Size,
	reducedMotion: boolean,
): boolean {
	const pan = PAN_KEYS[key];
	if (pan !== undefined) {
		camera.ease(pan[0] * PAN_STEP, pan[1] * PAN_STEP);
		return true;
	}
	const zoom = ZOOM_KEYS[key];
	if (zoom !== undefined) {
		camera.zoomCentre(zoom);
		return true;
	}
	if (key === "0") {
		camera.glide({ kind: "whole", content }, reducedMotion ? 0 : EXPLORING_MS.cameraFit);
		return true;
	}
	return false;
}

export { moveCameraByKey };

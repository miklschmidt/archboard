// The element the camera moves, and the picture is written into. It is the one
// thing drawn again on every move of the camera (TASK-385.02).

import { useMemo, type CSSProperties, type JSX } from "react";

import { EXPLORING_MS, PRESENTATION_MS } from "@archboard/timing";
import {
	useCameraView,
	type BoardCamera,
} from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { cameraTransform, type Size } from "#ui/rules/semantic-board-canvas/camera/camera.ts";

/** Where a press on the diagram stands: none, pressed, or moving the diagram. */
type Gesture = "idle" | "pressed" | "dragging";

/** The surface's own classes, whatever moves it. */
const SURFACE_CLASS = "absolute top-0 left-0 origin-top-left select-none";

/** The short ease of a keyed move or a fit. */
const EASED_CLASS = "transition-transform duration-100 ease-out motion-reduce:transition-none";

/**
 * The class that makes the surface a layer of its own while a hand moves it: a
 * drag, a wheel, a pinch or a key. The browser then moves and scales the picture
 * it already drew instead of painting it again on every frame. At rest the
 * layer goes, and the picture is drawn sharp once at its new size (TASK-405).
 * @param gesture Where a press on the diagram stands.
 * @param moving Whether a hand moves the camera and it has not come to rest.
 * @returns The class, with the space before it, or nothing.
 */
function layerClass(gesture: Gesture, moving: boolean): string {
	return gesture === "dragging" || moving ? " will-change-transform" : "";
}

/**
 * The surface's classes: a transition for a keyed move or a fit, and none
 * while the diagram is pressed, since a pan is meant to track the pointer, nor
 * for a move that follows the picture, which must land in the frame the picture
 * does.
 * @param gesture Where a press on the diagram stands.
 * @param reducedMotion Whether the person asked for reduced motion.
 * @param following Whether the camera last moved to follow the picture.
 * @param moving Whether a hand moves the camera and it has not come to rest.
 * @returns The class list.
 */
function surfaceClass(
	gesture: Gesture,
	reducedMotion: boolean,
	following: boolean,
	moving: boolean,
): string {
	const base = `${SURFACE_CLASS}${layerClass(gesture, moving)}`;
	return gesture !== "idle" || reducedMotion || following ? base : `${base} ${EASED_CLASS}`;
}

/** What the surface the camera moves is drawn with. */
interface CameraSurfaceProps {
	/** The camera that moves it. */
	readonly camera: BoardCamera;
	/** Where the picture's element is handed to whatever writes the picture into it. */
	readonly attach: (element: HTMLDivElement | null) => void;
	/** How big the picture is. */
	readonly size: Size;
	/** Where a press on the diagram stands. */
	readonly gesture: Gesture;
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion: boolean;
	/** The classes the picture's state adds. */
	readonly marks: string;
}

/**
 * The element the camera moves. It is the one thing drawn again on every move
 * of the camera (TASK-385.02).
 * @param props The camera, the picture's size and its classes.
 * @returns The surface, which the picture is written into rather than rendered.
 */
function CameraSurface(props: CameraSurfaceProps): JSX.Element {
	const { attach, size, gesture, reducedMotion, marks } = props;
	const { camera, instant, moving } = useCameraView(props.camera);
	const { width, height } = size;
	const style = useMemo<CSSProperties>(
		() => ({
			width,
			height,
			transform: cameraTransform(camera),
			"--presentation-step-ms": `${PRESENTATION_MS.step}ms`,
			"--lighting-ms": `${EXPLORING_MS.lightingFade}ms`,
			"--reach-hop-ms": `${EXPLORING_MS.reachHop}ms`,
		}),
		[width, height, camera],
	);
	return (
		<div
			ref={attach}
			data-slot="semantic-board-surface"
			style={style}
			className={`${surfaceClass(gesture, reducedMotion, instant, moving)}${marks}`}
		/>
	);
}

export { CameraSurface, type Gesture };

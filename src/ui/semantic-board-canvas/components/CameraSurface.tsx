// The element the camera moves, and the picture is written into. It is the one
// thing drawn again on every move of the camera (TASK-385.02).

import { useMemo, type CSSProperties, type JSX } from "react";

import { EXPLORING_MS, PRESENTATION_STEP_MS } from "@/shared/timing/timing";
import { useCameraView, type BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import { cameraTransform, type Size } from "@/ui/semantic-board-canvas/lib/camera";

/** Where a press on the diagram stands: none, pressed, or moving the diagram. */
type Gesture = "idle" | "pressed" | "dragging";

/**
 * The surface's classes: a transition for a keyed move or a fit, and none
 * while the diagram is pressed, since a pan is meant to track the pointer, nor
 * for a move that follows the picture, which must land in the frame the picture
 * does. While a drag moves it, the surface is a layer of its own, so the browser
 * moves the picture it already drew instead of drawing it again on every frame.
 * @param gesture Where a press on the diagram stands.
 * @param reducedMotion Whether the person asked for reduced motion.
 * @param following Whether the camera last moved to follow the picture.
 * @returns The class list.
 */
function surfaceClass(gesture: Gesture, reducedMotion: boolean, following = false): string {
	const base = "absolute top-0 left-0 origin-top-left select-none";
	if (gesture === "dragging") return `${base} will-change-transform`;
	return gesture === "pressed" || reducedMotion || following
		? base
		: `${base} transition-transform duration-100 ease-out motion-reduce:transition-none`;
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
	const { camera, instant } = useCameraView(props.camera);
	const { width, height } = size;
	const style = useMemo<CSSProperties>(
		() => ({
			width,
			height,
			transform: cameraTransform(camera),
			"--presentation-step-ms": `${PRESENTATION_STEP_MS}ms`,
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
			className={`${surfaceClass(gesture, reducedMotion, instant)}${marks}`}
		/>
	);
}

export { CameraSurface, type Gesture };

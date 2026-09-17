// Keeping a diagram fitted to what it is meant to be showing, until somebody
// says where to look.
//
// This is what makes the first fit right. A pane paints before it has settled
// at the size it will actually have — the shell is still laying out, the window
// is still being sized — and a fit computed at that moment is a fit to a pane
// that no longer exists. So the stage fits itself again every time its size
// changes, and stops the moment a person pans or zooms: from then on the camera
// is theirs, and widening the pane leaves it exactly where they put it. A new
// board or view starts the whole arrangement over. Variant changes preserve it.
//
// A walkthrough step is a new subject in exactly that sense. What the pane is
// meant to be showing has changed because the reader moved, so the camera is
// taken back and fitted to the step — and then it is theirs again: panning
// inside one step sticks, and only moving to another step takes it back. While
// a walkthrough is presented the camera glides between steps rather than
// cutting, and leaving the presentation glides back to the camera the reader
// had before it began.

import { useLayoutEffect, useMemo, useRef } from "react";

import { PICTURE_TRANSITION_MS, PRESENTATION_STEP_MS } from "@/shared/timing/timing";
import {
	useBoardCamera,
	type BoardCamera,
} from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { BeatFocus } from "@/ui/semantic-board-canvas/lib/narrative";
import type { Camera, FitTarget, Size } from "@/ui/semantic-board-canvas/lib/camera";

/** How the pane is being read, as far as the camera's moves are concerned. */
interface FitReading {
	/** Whether a walkthrough is being presented. */
	readonly presenting: boolean;
	/** Whether the person asked for no motion; then every glide lands at once. */
	readonly reducedMotion: boolean;
}

/** How a pane says it is being read, before anything is decided about it. */
interface FitRequest {
	readonly presenting: boolean;
	readonly reducedMotion?: boolean | undefined;
}

/** The camera a reader had before a presentation took it. */
interface HeldCamera {
	readonly camera: Camera;
	/** Whether it was theirs, after a pan or a zoom, rather than a fit. */
	readonly handled: boolean;
}

/** What was last fitted: the subject, the picture it was on, and the room. */
interface Fitted {
	subject: string | null;
	picture: string | null;
	room: string | null;
}

/**
 * How big the pane is, as one comparable value.
 * @param room The viewport's size, or null before it has one.
 * @returns The size as a string, and "0x0" for no size at all.
 */
function roomKey(room: Size | null): string {
	return room === null ? "0x0" : `${room.width}x${room.height}`;
}

/**
 * How long a glide to the next step takes.
 * @param reading How the pane is being read.
 * @param pictureChanged Whether the step brought another picture with it.
 * @returns The duration, zero when the person asked for no motion.
 */
function stepDuration(reading: FitReading, pictureChanged: boolean): number {
	if (reading.reducedMotion) {
		return 0;
	}
	return pictureChanged ? PICTURE_TRANSITION_MS : PRESENTATION_STEP_MS;
}

/**
 * Give the reader back the camera a presentation took, when one is leaving.
 * @param camera The camera.
 * @param held What the reader had, or null.
 * @param reading How the pane is being read now.
 * @returns Whether it was given back.
 */
function giveBack(camera: BoardCamera, held: HeldCamera | null, reading: FitReading): boolean {
	if (held === null || reading.presenting) {
		return false;
	}
	return camera.glide(held.camera, stepDuration(reading, false), held.handled);
}

/**
 * Move the camera to a subject: a glide while presenting, a fit otherwise.
 * @param camera The camera.
 * @param target What to show.
 * @param reading How the pane is being read.
 * @param fitted What was last fitted.
 * @param picture The picture on screen now.
 * @returns Whether the camera moved.
 */
function moveTo(
	camera: BoardCamera,
	target: FitTarget,
	reading: FitReading,
	fitted: Fitted,
	picture: string | null,
): boolean {
	const pictureChanged = fitted.picture !== picture;
	if (reading.presenting && fitted.subject !== null) {
		return camera.glide(target, stepDuration(reading, pictureChanged));
	}
	return camera.fit(target, pictureChanged);
}

/** What the fit is working from on one commit. */
interface FitMoment {
	readonly target: FitTarget;
	readonly subject: string | null;
	readonly picture: string | null;
	readonly room: string;
	readonly reading: FitReading;
}

/**
 * Whether the camera already shows what the pane is meant to be showing: the
 * same subject, in the same room — or in another room, when the camera is the
 * person's and no presentation is asking for it.
 * @param last What was last fitted.
 * @param moment What the pane is showing now.
 * @param camera The camera.
 * @returns True when there is nothing to do.
 */
function upToDate(last: Fitted, moment: FitMoment, camera: BoardCamera): boolean {
	if (last.subject !== moment.subject) {
		return false;
	}
	return last.room === moment.room || (!moment.reading.presenting && camera.handled());
}

/**
 * Remember the reader's camera as a presentation takes it.
 * @param held Where it is remembered.
 * @param held.current The camera remembered, or null.
 * @param camera The camera.
 * @param reading How the pane is being read.
 */
function remember(
	held: { current: HeldCamera | null },
	camera: BoardCamera,
	reading: FitReading,
): void {
	if (reading.presenting && held.current === null) {
		held.current = { camera: camera.camera, handled: camera.handled() };
	}
}

/**
 * Bring the camera up to date with what the pane is meant to be showing.
 * @param camera The camera.
 * @param moment What the pane is showing, in which room, read how.
 * @param fitted What was last fitted, brought up to date here.
 * @param fitted.current The last fit.
 * @param held The camera a presentation took, remembered and given back here.
 * @param held.current The camera, or null.
 */
function keepFitted(
	camera: BoardCamera,
	moment: FitMoment,
	fitted: { current: Fitted },
	held: { current: HeldCamera | null },
): void {
	const { subject, picture, room, reading } = moment;
	const last = fitted.current;
	if (upToDate(last, moment, camera)) {
		last.room = room;
		return;
	}
	remember(held, camera, reading);
	const moved =
		giveBack(camera, held.current, reading) ||
		moveTo(camera, moment.target, reading, last, picture);
	if (!reading.presenting) {
		held.current = null;
	}
	if (moved) {
		fitted.current = { subject, picture, room };
	}
}

/**
 * Own the stage camera across loading, empty and drawn states. Variants share
 * the camera; another board, view or walkthrough focus fits afresh.
 * @param drawing The resolved drawing, or null while no picture is available.
 * @param focus The walkthrough's focus, when one is being read.
 * @param request Whether a walkthrough is presented, and whether motion is reduced.
 * @returns The camera, including explicit pan, zoom and fit controls.
 */
function useAutoFit(
	drawing: SemanticDrawing | null,
	focus: BeatFocus,
	request: FitRequest = { presenting: false },
): BoardCamera {
	const camera = useBoardCamera();
	const target = useMemo<FitTarget | null>(
		() =>
			drawing === null || camera.room === null
				? null
				: (focus.target ?? {
						kind: "whole",
						content: { width: drawing.width, height: drawing.height },
					}),
		[drawing, focus.target, camera.room],
	);
	const picture = drawing === null ? null : JSON.stringify([drawing.board, drawing.view?.id]);
	const subject = picture === null ? null : JSON.stringify([picture, focus.key]);
	const fitted = useRef<Fitted>({ subject: null, picture: null, room: null });
	const held = useRef<HeldCamera | null>(null);
	const room = roomKey(camera.room);
	const { presenting } = request;
	const reducedMotion = request.reducedMotion === true;
	// Before paint: a picture that has just gone up is shown fitted from its
	// first frame, at once, rather than sliding into place. A new beat of the
	// same picture glides, because the reader is following it.
	useLayoutEffect(() => {
		// Loading removes the viewport temporarily, not the reader’s camera.
		if (target === null) {
			return;
		}
		const reading = { presenting, reducedMotion };
		keepFitted(camera, { target, subject, picture, room, reading }, fitted, held);
	}, [camera, target, subject, picture, room, presenting, reducedMotion]);
	return camera;
}

export { useAutoFit, type FitReading };

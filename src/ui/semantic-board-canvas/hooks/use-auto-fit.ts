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
// A walkthrough beat is a new subject in exactly that sense. What the pane is
// meant to be showing has changed because the reader moved, so the camera is
// taken back and fitted to the beat — and then it is theirs again: panning
// inside one beat sticks, and only moving to another beat takes it back.

import { useEffect, useMemo, useRef } from "react";

import {
	useBoardCamera,
	type BoardCamera,
} from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { BeatFocus } from "@/ui/semantic-board-canvas/lib/narrative";
import type { FitTarget, Size } from "@/ui/semantic-board-canvas/lib/camera";

/**
 * How big the pane is, as one comparable value.
 * @param room The viewport's size, or null before it has one.
 * @returns The size as a string, and "0x0" for no size at all.
 */
function roomKey(room: Size | null): string {
	return room === null ? "0x0" : `${room.width}x${room.height}`;
}

/**
 * Own the stage camera across loading, empty and drawn states. Variants share
 * the camera; another board, view or walkthrough focus fits afresh.
 * @param drawing The resolved drawing, or null while no picture is available.
 * @param focus The walkthrough's focus, when one is being read.
 * @returns The camera, including explicit pan, zoom and fit controls.
 */
function useAutoFit(drawing: SemanticDrawing | null, focus: BeatFocus): BoardCamera {
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
	const subject =
		drawing === null ? null : JSON.stringify([drawing.board, drawing.view?.id, focus.key]);
	const fittedSubject = useRef<string | null>(null);
	const fittedRoom = useRef<string | null>(null);
	const room = roomKey(camera.room);
	useEffect(() => {
		// Loading removes the viewport temporarily, not the reader’s camera.
		if (target === null) {
			return;
		}
		const same = fittedSubject.current === subject;
		if (same && (fittedRoom.current === room || camera.handled())) {
			fittedRoom.current = room;
			return;
		}
		if (camera.fit(target)) {
			fittedSubject.current = subject;
			fittedRoom.current = room;
		}
	}, [camera, target, subject, room]);
	return camera;
}

export { useAutoFit };

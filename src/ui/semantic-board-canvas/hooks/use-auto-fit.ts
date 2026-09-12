// Keeping a diagram fitted to what it is meant to be showing, until somebody
// says where to look.
//
// This is what makes the first fit right. A pane paints before it has settled
// at the size it will actually have — the shell is still laying out, the window
// is still being sized — and a fit computed at that moment is a fit to a pane
// that no longer exists. So the stage fits itself again every time its size
// changes, and stops the moment a person pans or zooms: from then on the camera
// is theirs, and widening the pane leaves it exactly where they put it. A new
// board or variant starts the whole arrangement over.
//
// A walkthrough beat is a new subject in exactly that sense. What the pane is
// meant to be showing has changed because the reader moved, so the camera is
// taken back and fitted to the beat — and then it is theirs again: panning
// inside one beat sticks, and only moving to another beat takes it back.

import { useEffect, useRef } from "react";

import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
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
 * Keep one diagram fitted to its pane until the person takes the camera over.
 * @param camera The pane's camera.
 * @param target What the pane is meant to be showing: the whole diagram, or a
 *   region of it the reader is being shown.
 * @param subject What is on screen — the board, the variant and, while a
 *   walkthrough is open, the beat and the region it asks for. A new one fits
 *   again.
 */
function useAutoFit(camera: BoardCamera, target: FitTarget, subject: string): void {
	const fittedSubject = useRef<string | null>(null);
	const fittedRoom = useRef<string | null>(null);
	const room = roomKey(camera.room);
	useEffect(() => {
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
}

export { useAutoFit };

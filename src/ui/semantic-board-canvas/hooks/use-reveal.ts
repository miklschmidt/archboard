// Bringing a part picked out from somewhere other than the picture into view.
//
// The picture is where a part is picked out most of the time, and then the part
// is there: the reader's own hand put it there, so the camera stays where the
// reader left it, even for a part only partly in view or bigger than the pane.
// The stage hands the picture the pick this hook returns, so a pick says where
// it came from. A row of the list, the part search, an agent or a command can
// pick one that is not in view: the camera glides once, just far enough to show
// it, and shows with it the part the reader was on when the two are wired
// together. A part already in view moves nothing, and this stands aside while a
// walkthrough is presented or a panel laid over the picture already moves the
// camera clear of it.

import { useCallback, useEffect, useRef } from "react";

import { FIT_MARGIN } from "@archboard/renderer/shell-geometry";
import { EXPLORING_MS } from "@archboard/timing";
import type { SemanticAtlas } from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import type { Rect } from "@/ui/semantic-board-canvas/lib/camera";
import { revealCamera } from "@/ui/semantic-board-canvas/lib/reveal";
import { subjectBox } from "@/ui/semantic-board-canvas/lib/subjects";

/** What decides whether, and where, the camera moves. */
interface RevealInputs {
	readonly camera: BoardCamera;
	/** Where every subject of the picture on screen ended up, or null before there is one. */
	readonly atlas: SemanticAtlas | null;
	/** What the board says about the variant on screen, or null. */
	readonly reading: VariantReading | null;
	/** The subject picked out, or null. */
	readonly selection: string | null;
	/** Whether something else already moves the camera: a presented step, or a panel over the picture. */
	readonly off: boolean;
	/** Whether the person asked for no motion, which lands the camera at once. */
	readonly reducedMotion: boolean;
	/**
	 * Pick a subject out, or clear the selection.
	 * @param id The semantic id, or null.
	 */
	readonly onPick: (id: string | null) => void;
}

/**
 * Whether the variant draws a relationship between two parts.
 * @param reading What the board says about the variant.
 * @param one A part.
 * @param other Another.
 * @returns True when a relationship joins them, in either direction.
 */
function wired(reading: VariantReading | null, one: string, other: string): boolean {
	const edges = reading?.variant?.content.edges ?? [];
	return edges.some(
		(edge) => (edge.from === one && edge.to === other) || (edge.from === other && edge.to === one),
	);
}

/**
 * The box of the part the reader was on, when it is wired to the one now picked.
 * @param inputs What decides.
 * @param previous The part picked out before.
 * @returns Its box, or null.
 */
function alongside(inputs: RevealInputs, previous: string | null): Rect | null {
	const { atlas, reading, selection } = inputs;
	if (atlas === null || previous === null || selection === null) {
		return null;
	}
	return wired(reading, previous, selection) ? subjectBox(atlas, previous) : null;
}

/**
 * The boxes to bring into view for a pick: the part the reader was on, when it
 * is wired to the new one, and the new one.
 * @param inputs What decides.
 * @param previous The part picked out before.
 * @returns The boxes, the new part's last; empty when the atlas does not know it.
 */
function boxesFor(inputs: RevealInputs, previous: string | null): Rect[] {
	const { atlas, selection } = inputs;
	const box = atlas === null || selection === null ? null : subjectBox(atlas, selection);
	if (box === null) {
		return [];
	}
	const behind = alongside(inputs, previous);
	return behind === null ? [box] : [behind, box];
}

/**
 * Glide the camera so the pick is in view, when it is not.
 * @param inputs What decides.
 * @param previous The part picked out before.
 */
function showPick(inputs: RevealInputs, previous: string | null): void {
	const { camera, off, reducedMotion } = inputs;
	if (off || camera.room === null) {
		return;
	}
	const target = revealCamera(
		camera.view().camera,
		camera.room,
		boxesFor(inputs, previous),
		FIT_MARGIN * 2,
	);
	if (target !== null) {
		camera.glide(target, reducedMotion ? 0 : EXPLORING_MS.reveal, true);
	}
}

/**
 * Glide the camera to a part picked out from elsewhere, when it is not in view.
 * @param inputs The camera, the picture's atlas, the pick, whether to stand aside and how to pick.
 * @returns The picture's own pick: the reader's hand, which leaves the camera where it is.
 */
function useReveal(inputs: RevealInputs): (id: string | null) => void {
	const { selection, onPick } = inputs;
	const latest = useRef(inputs);
	const previous = useRef<string | null>(selection);
	// What the picture picked last, until the selection it asked for arrives.
	const byHand = useRef<string | null>(null);
	useEffect(() => {
		latest.current = inputs;
	});
	useEffect(() => {
		const was = previous.current;
		const fromPicture = byHand.current === selection;
		previous.current = selection;
		byHand.current = null;
		if (selection !== null && selection !== was && !fromPicture) {
			showPick(latest.current, was);
		}
	}, [selection]);
	return useCallback(
		(id: string | null): void => {
			byHand.current = id;
			onPick(id);
		},
		[onPick],
	);
}

export { useReveal };

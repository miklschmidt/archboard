// What a pane leaving its picture says aloud, and shows once the next is slow.

import type { JSX } from "react";

import { StageSpinner } from "#ui/components/semantic-board-canvas/SemanticStageStates.tsx";
import type { Departure } from "#ui/clients/semantic-board-canvas/picture/picture-departure.ts";

/**
 * One part of a pane leaving its picture.
 * @param props Where the reader went, or null while they stay.
 * @param props.departure Where the reader went.
 * @param props.at Which part: the announcement, or the spinner over the picture.
 * @returns That part, or nothing while the pane stays.
 */
function LeavingPart(props: {
	readonly departure: Departure | null;
	readonly at: "announcement" | "spinner";
}): JSX.Element | null {
	const { departure, at } = props;
	if (departure === null) {
		return null;
	}
	return at === "announcement" ? (
		<p aria-live="polite" className="sr-only">
			Drawing {departure.board}…
		</p>
	) : (
		<StageSpinner className="pointer-events-none absolute inset-0" />
	);
}

export { LeavingPart };

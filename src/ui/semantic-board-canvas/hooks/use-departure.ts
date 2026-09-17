// Keeping the last picture on the pane while the next board is being drawn, so
// it can leave the way the reader went rather than vanish at the click.
//
// The render query already keeps the last picture of the same board while
// another variant or view of it is drawn; what it cannot keep is a picture of
// another board, because its answer would be about the wrong board. That
// picture is not an answer here either: it is held only to be seen leaving,
// and nothing can be picked out of it or read from it.

import type { UseQueryResult } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import type {
	SemanticBox,
	SemanticDrawing,
	SemanticRender,
} from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { Departure, DepartureWay } from "@/ui/semantic-board-canvas/lib/picture-departure";

/** The picture leaving, and where the reader went. */
interface Leaving {
	readonly drawing: SemanticDrawing;
	readonly departure: Departure;
}

/** What the stage is told about a departure. */
interface DepartureState {
	/** The picture on its way out, while the next board has nothing to show; null otherwise. */
	readonly leaving: Leaving | null;
	/**
	 * Where the reader went, until the first picture they went to is on screen;
	 * null when they went nowhere in particular.
	 */
	readonly heading: Departure | null;
	/**
	 * Say which way the reader is about to go, before they go.
	 * @param way Into a card, back out, or across.
	 * @param card The card opened, when going into one.
	 */
	readonly leave: (way: DepartureWay, card?: string | null) => void;
}

/** Where the reader said they were going, from which picture, and what they arrived at. */
interface Heading {
	readonly way: DepartureWay;
	/** The box of the card they went into, in the picture they left. */
	readonly toward: SemanticBox | null;
	/** The picture on screen when they said so. */
	readonly from: SemanticDrawing | null;
	/** The first picture they arrived at, once one has. */
	readonly to: SemanticDrawing | null;
}

/**
 * Whether a heading still describes what is on screen: the reader has not yet
 * left, is on the way, or has just arrived.
 * @param heading Where the reader said they were going.
 * @param drawn The picture the pane has now, or null.
 * @returns True while it does.
 */
function underWay(heading: Heading, drawn: SemanticDrawing | null): boolean {
	return drawn === null || drawn === heading.from || drawn === heading.to;
}

/**
 * The heading still under way, if any.
 * @param heading Where the reader last said they were going, or null.
 * @param drawn The picture the pane has now, or null.
 * @returns The heading, or null once another picture replaced the one arrived at.
 */
function stillUnderWay(heading: Heading | null, drawn: SemanticDrawing | null): Heading | null {
	return heading !== null && underWay(heading, drawn) ? heading : null;
}

/**
 * Whether a picture is the first one the reader arrived at, not yet recorded.
 * @param heading Where the reader said they were going, or null.
 * @param drawn The picture the pane has now, or null.
 * @returns True for the first picture after the one left.
 */
function firstArrival(
	heading: Heading | null,
	drawn: SemanticDrawing | null,
): heading is Heading & { readonly to: null } {
	return heading?.to === null && drawn !== null && drawn !== heading.from;
}

/**
 * The box of a card in a picture.
 * @param picture The picture, if any.
 * @param card The card, if any.
 * @returns Its box, or null when either is missing.
 */
function cardBox(picture: SemanticDrawing | null, card: string | null): SemanticBox | null {
	return card === null ? null : (picture?.atlas.nodes[card] ?? null);
}

/**
 * Where the reader said they were going, kept until the first picture they
 * went to is on screen, and forgotten once another picture replaces it.
 * @param drawn The picture the pane has now, or null.
 * @param kept The last picture drawn.
 * @returns The heading still under way, or null, and the way to set one.
 */
function useHeading(
	drawn: SemanticDrawing | null,
	kept: SemanticDrawing | null,
): {
	readonly current: Heading | null;
	readonly leave: (way: DepartureWay, card?: string | null) => void;
} {
	const [heading, setHeading] = useState<Heading | null>(null);
	// The picture arrived at is the first one after the picture left, held
	// during render as React asks for a value derived from the last one.
	if (firstArrival(heading, drawn)) {
		setHeading({ ...heading, to: drawn });
	}
	const leave = useCallback(
		(way: DepartureWay, card: string | null = null): void => {
			setHeading({ way, toward: cardBox(kept, card), from: kept, to: null });
		},
		[kept],
	);
	return { current: stillUnderWay(heading, drawn), leave };
}

/**
 * Hold the last picture drawn, and where the reader is going from it.
 * @param drawn The picture the pane has now, or null.
 * @param board The board being drawn.
 * @param render The query for its picture.
 * @returns The departure, if one is under way, and the way to announce one.
 */
function useDeparture(
	drawn: SemanticDrawing | null,
	board: string,
	render: Pick<UseQueryResult<SemanticRender>, "data" | "error">,
): DepartureState {
	const [kept, setKept] = useState<SemanticDrawing | null>(drawn);
	// The picture being left is the one on screen the moment before.
	if (drawn !== null && drawn !== kept) {
		setKept(drawn);
	}
	const { current, leave } = useHeading(drawn, kept);
	const departure = useMemo<Departure>(
		() => ({ way: current?.way ?? "across", toward: current?.toward ?? null, board }),
		[current, board],
	);
	const waiting = render.data === undefined && render.error === null;
	const leaving = useMemo<Leaving | null>(
		() => (!waiting || kept === null ? null : { drawing: kept, departure }),
		[waiting, kept, departure],
	);
	return { leaving, heading: current === null ? null : departure, leave };
}

export { useDeparture, type Leaving };

// Which explanation one pane is being read through, and where in it the reader
// has got to.
//
// Both are session state, in the same class as the camera and the selection:
// choosing a walkthrough is reading, not editing. Nothing is written, no
// version moves, and the other pane showing the same board carries on showing
// whatever it was showing (ADR 0023). Two people can read two explanations of
// one architecture at the same time, and neither can tell.
//
// The explanations themselves are handed in rather than read here: the board
// they come from is one read that answers several of the pane's questions at
// once (`use-variant-reading`), and this hook owns only where the reader has
// got to in one of them.
//
// Where the reader is, is kept beside which board they are reading it on, and
// compared rather than reset: a pane pointed at another board is a pane whose
// place in a narrative no longer means anything, and deriving that is one
// comparison instead of an effect that copies state about.

import { useCallback, useMemo, useState } from "react";

import type { SemanticWalkthrough, WalkthroughBeat } from "@/shared/semantic-board/index";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";

/** Which board and variant a pane is reading. */
interface WalkthroughSource {
	/** The board on screen. */
	readonly board: string;
	/** The variant on screen: an id or name, or undefined for the current one. */
	readonly variant: string | undefined;
}

/** Where a reader is: which explanation, of what board, and how far in. */
interface NarrativePlace {
	/** The board it is an explanation of. */
	readonly board: string;
	/** The walkthrough being read. */
	readonly walkthrough: string;
	/** Which beat of it is current. */
	readonly beat: number;
}

/** What a pane offers and what is being read. */
interface WalkthroughReading {
	/** Every explanation this variant states, in the order it states them. */
	readonly offered: readonly SemanticWalkthrough[];
	/** The one being read, or null when none is. */
	readonly open: SemanticWalkthrough | null;
	/** The beat being read, or null when no walkthrough is open. */
	readonly beat: WalkthroughBeat | null;
	/** Which beat that is, or -1 when no walkthrough is open. */
	readonly beatIndex: number;
	/**
	 * What to call one of the variant's subjects in a sentence.
	 * @param id The semantic id.
	 * @returns Its name, or the id when the variant does not hold it.
	 */
	readonly nameOf: (id: string) => string;
	/**
	 * Read one of the explanations, or stop reading.
	 * @param walkthrough The walkthrough's id, or null to close the rail.
	 */
	readonly choose: (walkthrough: string | null) => void;
	/**
	 * Move to a beat.
	 * @param index Which beat.
	 */
	readonly goTo: (index: number) => void;
}

/** A variant that states no explanation of itself. */
const NO_WALKTHROUGHS: readonly SemanticWalkthrough[] = Object.freeze([]);

/**
 * Whether a remembered place is a place in what the pane is showing now.
 *
 * Kept across a change of variant, on purpose. A proposal inherits its
 * predecessor's explanations with the rest of its content, ids and all, so the
 * reader who moves from the current architecture to the proposal is reading the
 * same explanation of a different state — which is the whole reason somebody
 * puts the two side by side. A variant that does not state that walkthrough
 * drops it anyway, one step later, because it is no longer on offer.
 * @param place Where the reader was, or null when nowhere.
 * @param source What the pane is showing.
 * @returns The place when it is still this pane's, and null otherwise.
 */
function placeIn(place: NarrativePlace | null, source: WalkthroughSource): NarrativePlace | null {
	if (place === null) {
		return null;
	}
	return place.board === source.board ? place : null;
}

/** What is being read, of what is on offer. */
interface OpenNarrative {
	/** The explanation being read, or null when none is. */
	readonly open: SemanticWalkthrough | null;
	/** Which beat is current, or -1 when none is. */
	readonly beatIndex: number;
	/** The beat being read, or null when none is. */
	readonly beat: WalkthroughBeat | null;
}

/** Nobody is reading an explanation of this variant. */
const NOTHING_OPEN: OpenNarrative = Object.freeze({ open: null, beatIndex: -1, beat: null });

/**
 * Which of the offered explanations is being read, and where in it.
 *
 * A place in a walkthrough the variant has stopped offering is no place at
 * all — an agent may have removed the explanation while somebody was reading
 * it — and a place past the end of one that has been shortened is its last
 * beat, which is where a reader of the old version was standing.
 * @param offered Every explanation the variant states.
 * @param place Where the reader is, or null when they are nowhere.
 * @returns The open explanation and the current beat.
 */
function openNarrative(
	offered: readonly SemanticWalkthrough[],
	place: NarrativePlace | null,
): OpenNarrative {
	const open =
		place === null ? null : (offered.find((one) => one.id === place.walkthrough) ?? null);
	if (open === null || place === null) {
		return NOTHING_OPEN;
	}
	const beatIndex = Math.min(place.beat, open.beats.length - 1);
	return { open, beatIndex, beat: open.beats[beatIndex] ?? null };
}

/**
 * The explanations one variant offers, and which of them is being read.
 * @param source The board and variant on screen.
 * @param reading What the board says, or null while it has not arrived.
 * @returns What is offered, what is open, and the two ways a reader moves.
 */
function useWalkthrough(
	source: WalkthroughSource,
	reading: VariantReading | null,
): WalkthroughReading {
	const { board } = source;
	const [place, setPlace] = useState<NarrativePlace | null>(null);

	const offered = reading?.walkthroughs ?? NO_WALKTHROUGHS;
	const { open, beat, beatIndex } = openNarrative(offered, placeIn(place, source));

	const choose = useCallback(
		(walkthrough: string | null): void => {
			setPlace(walkthrough === null ? null : { board, walkthrough, beat: 0 });
		},
		[board],
	);
	const goTo = useCallback((index: number): void => {
		setPlace((current) => (current === null ? current : { ...current, beat: Math.max(0, index) }));
	}, []);
	const nameOf = useCallback((id: string): string => reading?.nameOf(id) ?? id, [reading]);

	return useMemo(
		() => ({ offered, open, beat, beatIndex, nameOf, choose, goTo }),
		[offered, open, beat, beatIndex, nameOf, choose, goTo],
	);
}

export { useWalkthrough, type WalkthroughReading, type WalkthroughSource };

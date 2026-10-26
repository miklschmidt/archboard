// A choice one pane made about the picture on screen: a group, or a step
// through a design question's answer (ADR 0059).
//
// Session state, in the same class as the camera, the selection and the place
// in a walkthrough: choosing is reading, not editing. Nothing is written, no
// version moves, and the other pane showing the same board goes on showing
// whatever it was showing (ADR 0023).
//
// The choice is kept beside the board and the variant it was made on, and
// discarded on navigation: a pane pointed at another board, or at another
// state of this one, is a pane whose choice means nothing any more, because
// the ids belong to one variant of one board. Returning starts afresh instead
// of resurrecting the old choice. A change of view keeps it, because a view
// narrows the picture and not the choice. A choice the variant stops offering
// is let go too, since the list no longer offers it to let go of, and so is a
// choice that something else displaces: the picture says one thing at a time.

import { useCallback, useState } from "react";

import type { SemanticVariant } from "@archboard/board/document";

/** Where a choice was made: which board, and which state of it. */
interface ChoicePlace<T extends object | string> {
	/** The board on screen. */
	readonly board: string;
	/** The resolved variant on screen. */
	readonly variant: string;
	readonly chosen: T;
}

/** What the pane chose on the picture on screen, and how to change that. */
interface PlacedChoice<T extends object | string> {
	/** The choice, or null for none. */
	readonly chosen: T | null;
	/**
	 * Choose, or let go.
	 * @param chosen The choice, or null to let go.
	 */
	readonly choose: (chosen: T | null) => void;
}

/**
 * Whether the remembered choice is over: navigation left it, the variant no
 * longer offers it, or something displaced it. A variant still loading ends
 * nothing.
 * @param place The remembered choice.
 * @param board The board now shown.
 * @param variant The variant now shown, or null while the document loads.
 * @param keeps Whether the variant still offers the choice.
 * @returns Whether to forget the choice for good.
 */
function choiceOver<T extends object | string>(
	place: ChoicePlace<T>,
	board: string,
	variant: SemanticVariant | null,
	keeps: (variant: SemanticVariant, chosen: T) => boolean,
): boolean {
	if (place.board !== board) return true;
	return variant !== null && (place.variant !== variant.id || !keeps(variant, place.chosen));
}

/**
 * The remembered choice, when it is a choice about what is on screen now.
 * @param place What was last chosen, or null when nothing has been.
 * @param board The board on screen.
 * @param variant The resolved variant on screen, or null while it is unknown.
 * @returns The choice, or null when it belongs to something else.
 */
function chosenHere<T extends object | string>(
	place: ChoicePlace<T> | null,
	board: string,
	variant: string | null,
): T | null {
	if (place === null || variant === null) {
		return null;
	}
	return place.board === board && place.variant === variant ? place.chosen : null;
}

/**
 * What this pane chose on the board and variant it is showing.
 * @param board The board on screen.
 * @param variant The variant on screen, whole, or null while it has not arrived.
 * @param keeps Whether a variant still offers a choice.
 * @param displaced Whether something else now says what the picture is about.
 * @returns The choice and the one way to change it.
 */
function usePlacedChoice<T extends object | string>(
	board: string,
	variant: SemanticVariant | null,
	keeps: (variant: SemanticVariant, chosen: T) => boolean,
	displaced: boolean,
): PlacedChoice<T> {
	const shown = variant === null ? null : variant.id;
	const [place, setPlace] = useState<ChoicePlace<T> | null>(null);
	if (place !== null && (displaced || choiceOver(place, board, variant, keeps))) {
		setPlace(null);
	}
	const choose = useCallback(
		(chosen: T | null): void => {
			setPlace(chosen === null || shown === null ? null : { board, variant: shown, chosen });
		},
		[board, shown],
	);
	return { chosen: chosenHere(place, board, shown), choose };
}

export { usePlacedChoice, type PlacedChoice };

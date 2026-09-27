// Which group one pane has selected, if any, and which parts that selects.
//
// Session state, in the same class as the camera, the selection and the place
// in a walkthrough: choosing a group is reading, not editing. Nothing is
// written, no version moves, and the other pane showing the same board goes on
// showing whatever it was showing (ADR 0023).
//
// The choice is kept beside the board and the variant it was made on, and
// discarded on navigation: a pane pointed at another board, or at another
// state of this one, is a pane whose group means nothing any more — the ids
// belong to one variant of one board. Returning starts afresh instead of
// resurrecting the old choice. A change of view keeps it, because a view
// narrows the picture and not the group.
//
// What the choice selects is derived here too, from the board document, so
// that a board change refreshes it through the query it already invalidates.

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import type { SemanticVariant } from "@/shared/semantic-board/index";
import {
	groupChoices,
	groupSelection,
	type GroupChoice,
	type GroupNames,
	type GroupSelection,
} from "@/ui/semantic-board-canvas/lib/groups";
import { vaultCheckQuery } from "@/ui/semantic-board-canvas/lib/queries";

/** Where a group was chosen: which board, and which state of it. */
interface GroupPlace {
	/** The board on screen. */
	readonly board: string;
	/** The resolved variant on screen. */
	readonly variant: string;
	/** The group's id. */
	readonly group: string;
}

/** Which group the pane has selected, which it could, and how to change that. */
interface GroupSelectionState {
	/** What the vault calls each group. */
	readonly names: GroupNames;
	/** Every group the variant on screen uses. */
	readonly choices: readonly GroupChoice[];
	/** The group selected and its members, or null for none. */
	readonly selected: GroupSelection | null;
	/**
	 * Select one group, or let go.
	 * @param group The group's id, or null to clear.
	 */
	readonly choose: (group: string | null) => void;
}

/** No vault policy has arrived, so no group has a name yet. */
const NO_GROUP_NAMES: GroupNames = Object.freeze({});

/**
 * The remembered choice, when it is a choice about what is on screen now.
 * @param place What was last chosen, or null when nothing has been.
 * @param board The board on screen.
 * @param variant The resolved variant on screen, or null while it is unknown.
 * @returns The group, or null when the choice belongs to something else.
 */
function chosenHere(
	place: GroupPlace | null,
	board: string,
	variant: string | null,
): string | null {
	if (place === null || variant === null) {
		return null;
	}
	return place.board === board && place.variant === variant ? place.group : null;
}

/**
 * Whether navigation left the remembered choice, allowing an unresolved variant during refresh.
 * @param place The remembered choice.
 * @param board The board now shown.
 * @param variant The resolved variant, or null while the document loads.
 * @returns Whether to forget the old choice for good.
 */
function leftPlace(place: GroupPlace | null, board: string, variant: string | null): boolean {
	return (
		place !== null && (place.board !== board || (variant !== null && place.variant !== variant))
	);
}

/**
 * Which group this pane has selected on the board and variant it is showing,
 * and what that selects.
 * @param board The board on screen.
 * @param variant The variant on screen, whole, or null while it has not arrived.
 * @returns The names, the choices, the selection and the one way to change it.
 */
function useGroupSelection(board: string, variant: SemanticVariant | null): GroupSelectionState {
	const shown = variant === null ? null : variant.id;
	const policy = useQuery(vaultCheckQuery());
	const names = policy.data === undefined ? NO_GROUP_NAMES : policy.data.policy.groups;
	const [place, setPlace] = useState<GroupPlace | null>(null);
	if (leftPlace(place, board, shown)) {
		setPlace(null);
	}
	const group = chosenHere(place, board, shown);
	const choose = useCallback(
		(chosen: string | null): void => {
			setPlace(chosen === null || shown === null ? null : { board, variant: shown, group: chosen });
		},
		[board, shown],
	);
	const choices = useMemo(() => groupChoices(variant, names), [variant, names]);
	const selected = useMemo(
		() => (group === null || variant === null ? null : groupSelection(variant, group)),
		[variant, group],
	);
	return useMemo(() => ({ names, choices, selected, choose }), [names, choices, selected, choose]);
}

export { useGroupSelection, type GroupSelectionState };

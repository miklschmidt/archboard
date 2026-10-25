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
// narrows the picture and not the group. A group the variant stops using is
// let go too, since the list no longer offers it to let go of, and so is a
// group when a walkthrough opens or a part is picked out, whoever opened or
// picked it, the linked pane included (TASK-538.02): the picture says one of
// the two at a time.
//
// What the choice selects is derived here too, from the board document, so
// that a board change refreshes it through the query it already invalidates.

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { groupsUsed } from "@archboard/board/content";
import type { SemanticVariant } from "@archboard/board/document";
import {
	groupChoices,
	groupSelection,
	type GroupChoice,
	type GroupNames,
	type GroupSelection,
} from "#ui/rules/semantic-board-canvas/board/groups.ts";
import { vaultCheckQuery } from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";

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
 * Whether the remembered choice is over: navigation left it, the variant no
 * longer uses the group, or a walkthrough or a pick took its place. A variant
 * still loading ends nothing.
 * @param place The remembered choice.
 * @param board The board now shown.
 * @param variant The variant now shown, or null while the document loads.
 * @param displaced Whether a walkthrough is open or a part is picked out.
 * @returns Whether to forget the choice for good.
 */
function choiceOver(
	place: GroupPlace | null,
	board: string,
	variant: SemanticVariant | null,
	displaced: boolean,
): boolean {
	if (place === null) return false;
	if (displaced || place.board !== board) return true;
	return (
		variant !== null &&
		(place.variant !== variant.id || !groupsUsed(variant.content).includes(place.group))
	);
}

/**
 * Which group this pane has selected on the board and variant it is showing,
 * and what that selects.
 * @param board The board on screen.
 * @param variant The variant on screen, whole, or null while it has not arrived.
 * @param displaced Whether a walkthrough is open or a part is picked out.
 * @returns The names, the choices, the selection and the one way to change it.
 */
function useGroupSelection(
	board: string,
	variant: SemanticVariant | null,
	displaced: boolean,
): GroupSelectionState {
	const shown = variant === null ? null : variant.id;
	const policy = useQuery(vaultCheckQuery(usePaneVault()));
	const names = policy.data === undefined ? NO_GROUP_NAMES : policy.data.policy.groups;
	const [place, setPlace] = useState<GroupPlace | null>(null);
	if (choiceOver(place, board, variant, displaced)) {
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

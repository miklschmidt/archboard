// Which group one pane is inspecting, if any, and what that inspection is.
//
// Session state, in the same class as the camera, the selection and the place
// in a walkthrough: choosing a group is reading, not editing. Nothing is
// written, no version moves, and the other pane showing the same board goes on
// showing whatever it was showing (ADR 0023).
//
// The choice is kept beside the board and the variant it was made on, and
// discarded on navigation: a pane pointed at another board, or at another
// state of this one, is a pane whose group means nothing any more — the ids
// belong to one variant of one board. Returning starts a fresh reading instead
// of resurrecting the old choice. A change of view keeps it,
// because a view narrows the picture and not the group.
//
// What the inspection *is* — members, hidden members, what to light — is
// derived here too, from the board document, the vault policy and the picture
// on screen, so that a board change, a configuration change or a new picture
// each refresh it through the queries they already invalidate.

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import type { SemanticVariant } from "@/shared/semantic-board/index";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import {
	groupChoices,
	groupFocus,
	type GroupChoice,
	type GroupFocus,
	type GroupNames,
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

/** What the pane is inspecting, what it could, and how to change that. */
interface GroupInspectionState {
	/** What the vault calls each group. */
	readonly names: GroupNames;
	/** Every group the variant on screen uses. */
	readonly choices: readonly GroupChoice[];
	/** The group under inspection, read against the picture, or null for none. */
	readonly focus: GroupFocus | null;
	/**
	 * Inspect one group, or stop.
	 * @param group The group's id, or null to clear.
	 */
	readonly choose: (group: string | null) => void;
}

/** What the inspection is derived from. */
interface GroupSource {
	/** The board on screen. */
	readonly board: string;
	/** The variant on screen, whole, or null while it has not arrived. */
	readonly variant: SemanticVariant | null;
	/** The picture on screen, or null while there is not one. */
	readonly drawn: SemanticDrawing | null;
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
 * @returns Whether to forget the old inspection permanently.
 */
function leftPlace(place: GroupPlace | null, board: string, variant: string | null): boolean {
	return (
		place !== null && (place.board !== board || (variant !== null && place.variant !== variant))
	);
}

/**
 * The group under inspection, read against the picture on screen.
 * @param source What the pane is showing.
 * @param group The chosen group, or null.
 * @param names What the vault calls each group.
 * @returns The focus, or null when nothing is under inspection.
 */
function focusOf(source: GroupSource, group: string | null, names: GroupNames): GroupFocus | null {
	if (group === null || source.variant === null) {
		return null;
	}
	return groupFocus(
		source.variant,
		group,
		names,
		source.drawn === null ? null : source.drawn.atlas,
	);
}

/**
 * Which group this pane is inspecting on the board and variant it is showing,
 * and everything that inspection is.
 * @param source The board, the variant and the picture on screen.
 * @returns The names, the choices, the inspection and the one way to change it.
 */
function useGroupInspection(source: GroupSource): GroupInspectionState {
	const { board, variant } = source;
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
	const focus = useMemo(() => focusOf(source, group, names), [source, group, names]);
	return useMemo(() => ({ names, choices, focus, choose }), [names, choices, focus, choose]);
}

export { useGroupInspection, type GroupInspectionState, type GroupSource };

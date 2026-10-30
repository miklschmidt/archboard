// Which group one pane has selected, if any, and which parts that selects.
//
// The choice is kept as every choice about the picture is (use-placed-choice.ts):
// on the board and variant it was made on. A group the variant stops using is
// let go, and so is a group when a walkthrough opens or a part is picked out,
// whoever opened or picked it, the linked pane included (TASK-538.02): the
// picture says one of the two at a time.
//
// What the choice selects is derived here too, from the board document, so
// that a board change refreshes it through the query it already invalidates.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

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
import { usePlacedChoice } from "#ui/hooks/semantic-board-canvas/use-placed-choice.ts";

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
 * Whether a variant still uses a group.
 * @param variant The variant on screen.
 * @param group The group's id.
 * @returns True while one of its parts is a member.
 */
function usesGroup(variant: SemanticVariant, group: string): boolean {
	return groupsUsed(variant.content).includes(group);
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
	const policy = useQuery(vaultCheckQuery(usePaneVault()));
	const names = policy.data === undefined ? NO_GROUP_NAMES : policy.data.policy.groups;
	const { chosen: group, choose } = usePlacedChoice(board, variant, usesGroup, displaced);
	const choices = useMemo(() => groupChoices(variant, names), [variant, names]);
	const selected = useMemo(
		() => (group === null || variant === null ? null : groupSelection(variant, group)),
		[variant, group],
	);
	return useMemo(() => ({ names, choices, selected, choose }), [names, choices, selected, choose]);
}

export { useGroupSelection, type GroupSelectionState };

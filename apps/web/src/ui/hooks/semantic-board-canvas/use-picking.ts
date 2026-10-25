// What a pane has picked out: one subject, or one group's members, never both.
//
// Which group is selected is this pane's, kept on the board and the resolved
// variant it was chosen on: a walk into another board, or to another state of
// this one, drops it, while a change of view keeps it. Selecting a group
// replaces what was picked out and leaves any guided reading; picking anything
// out lets the group go, and so does an explanation opening, whoever opens it,
// and a part the linked pane picks (TASK-538.02).
//
// What was picked out is reported as what it is, not only as an id. The pane is
// the one place that knows: it has the board open and has just drawn the thing.
// A shell told only "sTn4eQ" would need a second read of the board to tell a
// step from the flow that holds it, or to say out loud what a person just
// clicked on.

import { useCallback, useMemo } from "react";

import type { GroupControls } from "#ui/components/semantic-board-canvas/SemanticInspectorParts.tsx";
import { useGroupSelection } from "#ui/hooks/semantic-board-canvas/use-group-selection.ts";
import type {
	SelectedSubject,
	VariantReading,
} from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import type { GroupChoice, GroupSelection } from "#ui/rules/semantic-board-canvas/board/groups.ts";

/** What picking is made from. */
interface PickingInputs {
	/** The board on screen. */
	readonly board: string;
	/** What the board says about itself, or null while it has not arrived. */
	readonly reading: VariantReading | null;
	/** Whether a walkthrough is being read. */
	readonly presenting: boolean;
	/** Whether a part is picked out, by this pane or by the pane linked to it. */
	readonly picked: boolean;
	/**
	 * Choose the walkthrough to read.
	 * @param walkthrough Its id, or null to leave the one being read.
	 */
	readonly choose: (walkthrough: string | null) => void;
	/**
	 * Tell the shell what was picked out, or that nothing is.
	 * @param id The semantic id, or null.
	 * @param subject What it is, when the board says.
	 */
	readonly onSelect: (id: string | null, subject?: SelectedSubject) => void;
}

/** The picks a pane can make, and the group it has selected. */
interface Picking {
	/**
	 * Pick a subject out, or clear the selection; either lets the group go.
	 * @param id The semantic id, or null.
	 */
	readonly onPick: (id: string | null) => void;
	/**
	 * Select a group's members in place of the selection and any guided reading.
	 * @param group The group's id, or null to let go.
	 */
	readonly onChooseGroup: (group: string | null) => void;
	/** How the inspector names memberships and selects one. */
	readonly groupControls: GroupControls;
	/** Every group the variant on screen uses. */
	readonly groups: readonly GroupChoice[];
	/** The selected group and its members, or null. */
	readonly group: GroupSelection | null;
}

/**
 * What the pane picks out, a subject or a group.
 * @param inputs The board on screen, what it says, and who hears of a pick.
 * @returns The picks, and the group selected.
 */
function usePicking(inputs: PickingInputs): Picking {
	const { board, reading, presenting, choose, onSelect } = inputs;
	const grouped = useGroupSelection(
		board,
		reading === null ? null : reading.variant,
		presenting || inputs.picked,
	);
	const chooseGroup = grouped.choose;
	const held = reading?.subject;
	const onPick = useCallback(
		(id: string | null): void => {
			chooseGroup(null);
			onSelect(id, id === null || held === undefined ? undefined : held(id));
		},
		[chooseGroup, held, onSelect],
	);
	const onChooseGroup = useCallback(
		(group: string | null): void => {
			if (group !== null) {
				choose(null);
				onSelect(null);
			}
			chooseGroup(group);
		},
		[choose, chooseGroup, onSelect],
	);
	const groupControls = useMemo(
		() => ({ names: grouped.names, onChoose: onChooseGroup }),
		[grouped.names, onChooseGroup],
	);
	return {
		onPick,
		onChooseGroup,
		groupControls,
		groups: grouped.choices,
		group: grouped.selected,
	};
}

export { usePicking };

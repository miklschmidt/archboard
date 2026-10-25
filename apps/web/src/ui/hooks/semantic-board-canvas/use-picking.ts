// What a pane has picked out: one subject, or one group's members, never both;
// and the design question whose answer the picture lights while nothing is
// picked (ADR 0057).
//
// Which group is selected, and which question is chosen, is this pane's, kept
// on the board and the resolved variant it was chosen on (use-placed-choice.ts):
// a walk into another board, or to another state of this one, drops it, while a
// change of view keeps it. Selecting a group replaces what was picked out and
// leaves any guided reading; picking anything out lets the group go, and so does
// an explanation opening, whoever opens it, and a part the linked pane picks
// (TASK-538.02). Choosing a question lets the pick, the group and any guided
// reading go, and a group or an explanation lets the question go. A pick leaves
// it chosen: the pick shows its own light, and letting go brings the answer's
// back. Letting go with nothing picked lets the question go.
//
// What was picked out is reported as what it is, not only as an id. The pane is
// the one place that knows: it has the board open and has just drawn the thing.
// A shell told only "sTn4eQ" would need a second read of the board to tell a
// step from the flow that holds it, or to say out loud what a person just
// clicked on.

import { useCallback, useMemo } from "react";

import type { GroupControls } from "#ui/components/semantic-board-canvas/SemanticInspectorParts.tsx";
import { useGroupSelection } from "#ui/hooks/semantic-board-canvas/use-group-selection.ts";
import { usePlacedChoice } from "#ui/hooks/semantic-board-canvas/use-placed-choice.ts";
import type {
	SelectedSubject,
	VariantReading,
} from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import {
	answerOf,
	type ChosenQuestion,
	type DesignQuestion,
} from "#ui/rules/semantic-board-canvas/board/design-questions.ts";
import type { GroupChoice, GroupSelection } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import type { SemanticVariant } from "@archboard/board/document";

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

/** The picks a pane can make, the group it has selected and the question it chose. */
interface Picking {
	/**
	 * Pick a subject out, or clear the selection; either lets the group go, and
	 * clearing with nothing picked lets the question go.
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
	/** The design question chosen and the subjects its answer names, or null. */
	readonly question: ChosenQuestion | null;
	/**
	 * Choose a design question in place of the pick, the group and any guided reading.
	 * @param question The question, or null to let go.
	 */
	readonly onChooseQuestion: (question: DesignQuestion | null) => void;
}

/**
 * Whether a variant still asks a question.
 * @param variant The variant on screen.
 * @param question The question.
 * @returns True while its answer names a part.
 */
function stillAsks(variant: SemanticVariant, question: DesignQuestion): boolean {
	return answerOf(variant.content, question).length > 0;
}

/**
 * What the pane picks out, a subject or a group, and the question it chose.
 * @param inputs The board on screen, what it says, and who hears of a pick.
 * @returns The picks, the group selected and the question chosen.
 */
function usePicking(inputs: PickingInputs): Picking {
	const { board, reading, presenting, picked, choose, onSelect } = inputs;
	const variant = reading === null ? null : reading.variant;
	const grouped = useGroupSelection(board, variant, presenting || picked);
	const asked = usePlacedChoice(board, variant, stillAsks, presenting || grouped.selected !== null);
	const chooseGroup = grouped.choose;
	const chooseQuestion = asked.choose;
	const held = reading?.subject;
	const onPick = useCallback(
		(id: string | null): void => {
			chooseGroup(null);
			// Letting go with nothing picked lets the question go, as it lets a group go.
			if (id === null && !picked) chooseQuestion(null);
			onSelect(id, id === null || held === undefined ? undefined : held(id));
		},
		[chooseGroup, chooseQuestion, held, onSelect, picked],
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
	const onChooseQuestion = useCallback(
		(question: DesignQuestion | null): void => {
			if (question !== null) {
				choose(null);
				onSelect(null);
				chooseGroup(null);
			}
			chooseQuestion(question);
		},
		[choose, chooseGroup, chooseQuestion, onSelect],
	);
	const question = useMemo(
		() =>
			asked.chosen === null || variant === null
				? null
				: { question: asked.chosen, subjects: answerOf(variant.content, asked.chosen) },
		[asked.chosen, variant],
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
		question,
		onChooseQuestion,
	};
}

export { usePicking };

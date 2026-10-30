// Every group the variant on screen uses, each with its colour and its name.
// Choosing one selects every member of it the picture draws; choosing it again
// lets it go.
//
// The row is the key to the group's colour on the picture as well as the way
// to its members, which is why the chip is drawn the way the picture draws the
// group. A variant with no memberships offers no list, as a board with no views
// or no walkthroughs offers none of those (TASK-383).

import { useCallback, type JSX } from "react";

import { SemanticGroupChip } from "#ui/components/semantic-board-canvas/SemanticGroupChip.tsx";
import {
	SidebarChoice,
	SidebarChoices,
	SidebarGlyph,
	SidebarLabel,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import type { GroupChoice } from "#ui/rules/semantic-board-canvas/board/groups.ts";

/** Inputs for the group list. */
interface SemanticGroupListProps {
	/** Every group the variant on screen uses. */
	readonly choices: readonly GroupChoice[];
	/** The selected group's id, or null for none. */
	readonly selected: string | ReadonlySet<string> | null;
	/**
	 * The person selected a group, or let it go.
	 * @param group The group's id, or null.
	 */
	readonly onChoose: (group: string | null) => void;
}

/** Inputs for one group's choice. */
interface GroupChoiceRowProps {
	readonly choice: GroupChoice;
	readonly selected: boolean;
	readonly onChoose: (group: string | null) => void;
}

/**
 * One group's choice: its chip and its name.
 * @param props The group, whether it is selected, and what choosing does.
 * @returns The choice.
 */
function GroupChoiceRow(props: GroupChoiceRowProps): JSX.Element {
	const { choice, selected, onChoose } = props;
	const choose = useCallback((): void => {
		onChoose(selected ? null : choice.id);
	}, [onChoose, selected, choice.id]);
	return (
		<SidebarChoice
			pressed={selected}
			title={choice.configured ? undefined : `${choice.id} is not configured in the vault`}
			data-slot="semantic-group-choice"
			data-group={choice.id}
			data-configured={choice.configured}
			onClick={choose}
		>
			<SidebarGlyph>
				<SemanticGroupChip color={choice.color} selected={selected} />
			</SidebarGlyph>
			<SidebarLabel>{choice.label}</SidebarLabel>
		</SidebarChoice>
	);
}

/**
 * The groups, each a way to select its members.
 * @param props The groups, the one selected, and what choosing does.
 * @returns The list, or null when the variant has no groups.
 */
function SemanticGroupList(props: SemanticGroupListProps): JSX.Element | null {
	const { choices, selected, onChoose } = props;
	if (choices.length === 0) {
		return null;
	}
	return (
		<SidebarChoices slot="semantic-group-list" label="Select a group's parts">
			{choices.map((choice) => (
				<GroupChoiceRow
					key={choice.id}
					choice={choice}
					selected={
						typeof selected === "string"
							? selected === choice.id
							: (selected?.has(choice.id) ?? false)
					}
					onChoose={onChoose}
				/>
			))}
		</SidebarChoices>
	);
}

export { SemanticGroupList, type SemanticGroupListProps };

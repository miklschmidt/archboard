// Every group the variant on screen uses, each with its colour and its name.
// Choosing one selects every member of it the picture draws; choosing it again
// lets it go. A variant with no memberships says so in the list's own place.

import { useCallback, type JSX } from "react";

import { Button } from "@/ui/components/button";
import { SemanticGroupChip } from "@/ui/semantic-board-canvas/components/SemanticGroupChip";
import type { GroupChoice } from "@/ui/semantic-board-canvas/lib/groups";

/** Inputs for the group list. */
interface SemanticGroupListProps {
	/** Every group the variant on screen uses. */
	readonly choices: readonly GroupChoice[];
	/** The selected group's id, or null for none. */
	readonly selected: string | null;
	/**
	 * The person selected a group, or let it go.
	 * @param group The group's id, or null.
	 */
	readonly onChoose: (group: string | null) => void;
}

/** Inputs for one group's button. */
interface GroupButtonProps {
	readonly choice: GroupChoice;
	readonly selected: boolean;
	readonly onChoose: (group: string | null) => void;
}

/**
 * One group's button: its chip and its name.
 * @param props The group, whether it is selected, and what choosing does.
 * @returns The button.
 */
function GroupButton(props: GroupButtonProps): JSX.Element {
	const { choice, selected, onChoose } = props;
	const choose = useCallback((): void => {
		onChoose(selected ? null : choice.id);
	}, [onChoose, selected, choice.id]);
	return (
		<Button
			type="button"
			variant={selected ? "secondary" : "ghost"}
			size="sm"
			aria-pressed={selected}
			data-slot="semantic-group-choice"
			data-group={choice.id}
			data-configured={choice.configured}
			title={choice.configured ? undefined : `${choice.id} is not configured in the vault`}
			className="justify-start gap-2"
			onClick={choose}
		>
			<SemanticGroupChip color={choice.color} selected={selected} />
			<span className="truncate">{choice.label}</span>
		</Button>
	);
}

/**
 * The groups, each a way to select its members.
 * @param props The groups, the one selected, and what choosing does.
 * @returns The list, or what it says when the variant has no groups.
 */
function SemanticGroupList(props: SemanticGroupListProps): JSX.Element {
	const { choices, selected, onChoose } = props;
	if (choices.length === 0) {
		return (
			<p data-slot="semantic-group-empty" className="text-muted-foreground text-body px-2">
				No groups on this state.
			</p>
		);
	}
	return (
		<fieldset
			data-slot="semantic-group-list"
			aria-label="Select a group's parts"
			// A fieldset is as wide as its widest name unless told otherwise,
			// and a name that runs past the sidebar then never truncates.
			className="flex min-w-0 flex-col items-stretch gap-0.5 border-0 p-0"
		>
			{choices.map((choice) => (
				<GroupButton
					key={choice.id}
					choice={choice}
					selected={selected === choice.id}
					onChoose={onChoose}
				/>
			))}
		</fieldset>
	);
}

export { SemanticGroupList, type SemanticGroupListProps };

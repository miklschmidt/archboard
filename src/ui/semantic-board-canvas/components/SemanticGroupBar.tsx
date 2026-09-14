// The control that chooses a group to inspect, says which one is under
// inspection, and lets go of it.
//
// A group is chosen from a list rather than from a row of buttons because a
// board can carry many and the strip has one line. The list holds every group
// the variant on screen uses — including an id the vault no longer defines,
// which is exactly the one somebody needs to find — and a variant with no
// memberships says so in the control's own place rather than by leaving a gap.
//
// The status beside it is the honest reading of the picture: how many members
// there are, and how many of them this view does not draw. A group whose last
// member has gone, or whose definition has, stays chosen and says what
// happened, so the reader is never left with a lit nothing and no way to ask.

import { RiCloseLine } from "@remixicon/react";
import { useCallback, type ChangeEvent, type JSX } from "react";

import { Button } from "@/ui/components/button";
import { SemanticGroupReport } from "@/ui/semantic-board-canvas/components/SemanticGroupReport";
import type { GroupChoice, GroupFocus } from "@/ui/semantic-board-canvas/lib/groups";

/** Inputs for the group bar. */
interface SemanticGroupBarProps {
	/** Every group the variant on screen uses. */
	choices: readonly GroupChoice[];
	/** The group under inspection, or null for none. */
	focus: GroupFocus | null;
	/**
	 * The person chose a group, or cleared the choice.
	 * @param group The group's id, or null to stop.
	 */
	onChoose: (group: string | null) => void;
}

/** The choice that is not a group. */
const NO_GROUP = "";

/**
 * What the status line says about the group under inspection.
 * @param focus The group under inspection.
 * @returns The sentence.
 */
function statusOf(focus: GroupFocus): string {
	const total = focus.inspection.members.length;
	if (total === 0) {
		return focus.configured
			? "No member on this variant."
			: "No member on this variant, and not configured.";
	}
	const hidden = focus.hidden.length === 0 ? "" : `, ${focus.hidden.length} not drawn here`;
	const defined = focus.configured ? "" : " — not configured";
	return `${total} member${total === 1 ? "" : "s"}${hidden}${defined}`;
}

/**
 * The groups the control offers: every one the variant uses, and the one under
 * inspection even when the variant has stopped using it, so the control keeps
 * saying what is under inspection until the person lets go.
 * @param choices Every group the variant on screen uses.
 * @param focus The group under inspection, or null.
 * @returns The choices to list.
 */
function offeredChoices(
	choices: readonly GroupChoice[],
	focus: GroupFocus | null,
): readonly GroupChoice[] {
	if (focus === null || choices.some((choice) => choice.id === focus.group)) {
		return choices;
	}
	return [...choices, { id: focus.group, label: focus.label, configured: focus.configured }];
}

/**
 * What the status and the clear control say about the group under inspection.
 * @param focus The group under inspection.
 * @param clear Let go of it.
 * @returns The status and the control.
 */
function inspecting(focus: GroupFocus, clear: () => void): JSX.Element {
	return (
		<>
			<span
				data-slot="semantic-group-status"
				data-members={focus.inspection.members.length}
				data-hidden={focus.hidden.length}
				className="text-muted-foreground text-body px-1"
			>
				{statusOf(focus)}
			</span>
			<SemanticGroupReport key={focus.group} focus={focus} />
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label={`Stop inspecting ${focus.label}`}
				data-slot="semantic-group-clear"
				onClick={clear}
			>
				<RiCloseLine />
			</Button>
		</>
	);
}

/**
 * Choose a group to inspect, see which one is, and let go of it.
 * @param props The choices, the one under inspection, and what a choice does.
 * @returns The control.
 */
function SemanticGroupBar(props: SemanticGroupBarProps): JSX.Element {
	const { focus, onChoose } = props;
	const onChange = useCallback(
		(event: ChangeEvent<HTMLSelectElement>): void => {
			onChoose(event.target.value === NO_GROUP ? null : event.target.value);
		},
		[onChoose],
	);
	const clear = useCallback((): void => {
		onChoose(null);
	}, [onChoose]);
	const offered = offeredChoices(props.choices, focus);
	return (
		<div
			data-slot="semantic-group-bar"
			data-group={focus === null ? undefined : focus.group}
			className="relative flex shrink-0 items-center gap-1"
		>
			<select
				aria-label="Inspect a group"
				data-slot="semantic-group-choice"
				className="text-control border-border bg-background hover:bg-accent focus-visible:ring-ring h-7 rounded-sm border px-2 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
				value={focus === null ? NO_GROUP : focus.group}
				disabled={offered.length === 0}
				onChange={onChange}
			>
				<option value={NO_GROUP}>{offered.length === 0 ? "No groups" : "Group…"}</option>
				{offered.map((choice) => (
					<option key={choice.id} value={choice.id} data-configured={choice.configured}>
						{choice.configured ? choice.label : `${choice.label} (not configured)`}
					</option>
				))}
			</select>
			{focus === null ? null : inspecting(focus, clear)}
		</div>
	);
}

export { SemanticGroupBar, type SemanticGroupBarProps };

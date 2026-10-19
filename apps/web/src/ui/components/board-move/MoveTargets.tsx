// The repositories a board can move to, as a radio group: every repository
// whose boards can be read now, and every untracked vault, other than the
// board's own. Arrow keys move between them, as in any radio group.

import { useCallback, useId, type JSX } from "react";

import type { RepositoryEntry } from "@archboard/workspace/repositories";
import {
	Field,
	FieldLabel,
	FieldLegend,
	FieldSet,
	RadioGroup,
	RadioGroupItem,
} from "@archboard/ui-kit/controls";
import { RepositoryName } from "@archboard/ui-kit/repository-name";

/** Inputs for the target choice. */
interface MoveTargetsProps {
	readonly targets: readonly RepositoryEntry[];
	readonly chosen: string | null;
	readonly disabled: boolean;
	readonly onChoose: (name: string) => void;
}

/**
 * The repositories a board can move to.
 * @param props The targets, the one chosen and the change handler.
 * @returns A radio group, or a line saying there is none.
 */
function MoveTargets(props: MoveTargetsProps): JSX.Element {
	const { onChoose } = props;
	const handleChange = useCallback((value: string) => onChoose(value), [onChoose]);
	if (props.targets.length === 0) {
		return (
			<p className="text-muted-foreground text-body">
				No other repository or untracked vault can be read now, so there is nowhere to move it.
			</p>
		);
	}
	return (
		<FieldSet>
			<FieldLegend variant="label">Move to</FieldLegend>
			<RadioGroup value={props.chosen} onValueChange={handleChange} disabled={props.disabled}>
				{props.targets.map((target) => (
					<MoveTarget key={target.name} target={target} />
				))}
			</RadioGroup>
		</FieldSet>
	);
}

/**
 * One repository a board can move to.
 * @param props The repository.
 * @param props.target The repository, as the navigator lists it.
 * @returns A horizontal field.
 */
function MoveTarget(props: { readonly target: RepositoryEntry }): JSX.Element {
	const id = useId();
	const { target } = props;
	return (
		<Field orientation="horizontal">
			<RadioGroupItem id={id} value={target.name} />
			<FieldLabel htmlFor={id} className="items-center gap-2">
				<RepositoryName identity={target.name} />
				{target.untracked && <span className="text-muted-foreground">untracked vault</span>}
			</FieldLabel>
		</Field>
	);
}

export { MoveTargets };

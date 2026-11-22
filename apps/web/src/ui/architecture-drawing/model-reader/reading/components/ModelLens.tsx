// The lens a structural picture is read through: a named question that chooses which of its
// relationships draw. The legend offers each lens as one press, and the line above the picture says
// which lens draws and what it left out.

import { useCallback, useMemo, type JSX } from "react";
import type { Model, projectModel } from "@archboard/model/content";
import { ToggleGroup } from "@archboard/ui-kit/components";

type LensOutcome = Pick<ReturnType<typeof projectModel>, "lens" | "leftOut" | "emptyLens">;

/**
 * The lenses of a reading, one press each, in the policy's order, with the one that draws pressed.
 * @param props The reading and how to choose another lens.
 * @param props.model The reading, whose policy names its lenses.
 * @param props.lens The lens the picture draws through.
 * @param props.onSelect Read the picture through another lens.
 * @returns The presets.
 */
function ModelLensPresets(props: {
	readonly model: Model;
	readonly lens: string;
	readonly onSelect: (id: string) => void;
}): JSX.Element {
	const { model, lens, onSelect } = props;
	const pressed = useMemo(() => [lens], [lens]);
	const choose = useCallback(
		(values: readonly unknown[]): void => {
			const [value] = values;
			if (typeof value === "string" && value !== lens) onSelect(value);
		},
		[onSelect, lens],
	);
	return (
		<li className="pb-2">
			<ToggleGroup
				aria-label="Lens"
				data-slot="model-lens"
				size="sm"
				spacing={0.5}
				value={pressed}
				onValueChange={choose}
				className="trough grid w-full grid-cols-2"
			>
				{Object.entries(model.policy.lenses).map(([id, choice]) => (
					<ToggleGroup.Item
						key={id}
						value={id}
						data-lens-id={id}
						title={choice.question}
						className="text-muted-foreground hover:text-foreground aria-pressed:text-foreground aria-pressed:chosen-face rounded-control aria-pressed:bg-face h-6 min-w-0 px-2 hover:bg-transparent"
					>
						{choice.name}
					</ToggleGroup.Item>
				))}
			</ToggleGroup>
		</li>
	);
}

/**
 * What the line above the picture says of its lens: which lens draws, and how many lines it and the
 * reader's switches left out, or that the default drew none here and every relationship shows.
 * @param outcome The lens outcome of the reading.
 * @returns The words.
 */
function lensStatus(outcome: LensOutcome): string {
	const { lens, leftOut, emptyLens } = outcome;
	if (emptyLens !== undefined) return `${emptyLens.name} has no lines here · Showing ${lens.name.toLowerCase()}`;
	if (leftOut === 0) return lens.name;
	return `${lens.name} · ${leftOut === 1 ? "1 line" : `${String(leftOut)} lines`} left out`;
}

/**
 * The lens and its outcome, above the picture.
 * @param props The lens outcome.
 * @param props.outcome The lens outcome of the reading on screen.
 * @returns The line.
 */
function ModelLensStatus(props: { readonly outcome: LensOutcome }): JSX.Element {
	return (
		<output
			data-slot="model-lens-status"
			className="text-body text-muted-foreground min-w-0 truncate"
		>
			{lensStatus(props.outcome)}
		</output>
	);
}

export { lensStatus, ModelLensPresets, ModelLensStatus };

// The lens a structural picture is read through: a named question that chooses which of its
// relationships draw, with how many lines it left out, or which default lens drew none here. Every
// part of the scope stays on the picture.

import { useCallback, type JSX } from "react";
import type { Model, projectModel } from "@archboard/model/content";
import { Select } from "@archboard/ui-kit/components";

/** Inputs for the lens control. */
interface ModelLensProps {
	readonly model: Model;
	readonly projection: Pick<ReturnType<typeof projectModel>, "lens" | "leftOut" | "emptyLens">;
	/** Read the picture through another lens. */
	readonly onSelect: (id: string) => void;
}

/**
 * The lens control on the legend's first column, with the count of the lines the reading leaves
 * out on its second, so that neither another lens nor the count moves a word of the legend.
 * @param props The reading and how to choose another lens.
 * @returns The control.
 */
function ModelLens(props: ModelLensProps): JSX.Element {
	const { model, projection, onSelect } = props;
	const { lens, leftOut, emptyLens } = projection;
	const choose = useCallback(
		(value: string | null): void => {
			if (value !== null && value !== lens.id) onSelect(value);
		},
		[onSelect, lens.id],
	);
	return (
		<li className="grid min-h-7 grid-cols-2 items-center gap-x-2 pb-1">
			<Select value={lens.id} onValueChange={choose}>
				<Select.Trigger
					size="sm"
					data-slot="model-lens"
					aria-label="Lens"
					className="w-full min-w-0"
				>
					<Select.Value>{lens.name}</Select.Value>
				</Select.Trigger>
				<Select.Content className="w-72 max-w-[80vw]">
					{Object.entries(model.policy.lenses).map(([id, choice]) => (
						<Select.Item key={id} value={id} data-lens-id={id} description={choice.question}>
							{choice.name}
						</Select.Item>
					))}
				</Select.Content>
			</Select>
			{(leftOut > 0 || emptyLens !== undefined) && (
				<span data-slot="model-lens-left-out" className="text-body text-muted-foreground truncate">
					{emptyLens === undefined ? leftOutNote(leftOut) : `${emptyLens.name} draws none here`}
				</span>
			)}
		</li>
	);
}

/**
 * The note of the lines a lens left out.
 * @param count How many it left out.
 * @returns The note.
 */
function leftOutNote(count: number): string {
	return count === 1 ? "1 line left out" : `${count} lines left out`;
}

export { ModelLens };

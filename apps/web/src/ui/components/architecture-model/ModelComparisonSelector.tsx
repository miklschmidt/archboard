import { useCallback, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/board/content";
import { Select } from "@archboard/ui-kit/components";
import { architectureCheckpointsQuery } from "#ui/clients/architecture-model/queries.ts";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import {
	chosenComparison,
	comparedWith,
	comparisonAddress,
	comparisonChoices,
	type ComparisonChoice,
} from "#ui/rules/architecture-model/comparison-choices.ts";

/** Inputs for the control. */
interface ModelComparisonSelectorProps {
	/** The reading on show. */
	readonly model: Model;
	/** The current catalogue. */
	readonly catalogue: Model | undefined;
	readonly vault: string;
	readonly paneId: string;
}

/**
 * When an exact base was saved. Only the retained list knows, and only a reading compared with a
 * saved reading asks it.
 * @param vault The addressed vault.
 * @param comparison The comparison on show.
 * @returns The time, once the list has said.
 */
function useSavedAt(vault: string, comparison: Model["comparison"]): string | undefined {
	const exact = comparison?.reason === "explicit" ? comparison.checkpoint : undefined;
	const rows = useQuery({ ...architectureCheckpointsQuery(vault), enabled: exact !== undefined });
	if (rows.data?.success !== true) return undefined;
	return rows.data.checkpoints.find(({ id }) => id === exact)?.createdAt;
}

/**
 * The one control of a comparison, beside the picture: it says what the picture is compared with,
 * and it is the way out. A checkpoint is compared from its row in History.
 * @param props The reading.
 * @returns The control, or nothing for a reading with nothing to compare with.
 */
function ModelComparisonSelector(props: ModelComparisonSelectorProps): JSX.Element | null {
	const { model, catalogue, vault, paneId } = props;
	const { against, compareAgainst } = useModelLocation(paneId);
	const savedAt = useSavedAt(vault, model.comparison);
	const choose = useCallback(
		(value: string | null, change: { readonly reason: string }): void => {
			// The address owns the value. When a chosen row leaves the list, the select resets itself to
			// the value it first held, and that must not reach the address. Only a press may.
			if (value !== null && change.reason === "item-press")
				compareAgainst(comparisonAddress(value, model));
		},
		[compareAgainst, model],
	);
	const inputs = { reading: model, against, catalogue, savedAt };
	const choices = comparisonChoices(inputs);
	const line = comparedWith(inputs);
	if (choices.length < 2) return null;
	return (
		<Select value={chosenComparison(inputs)} onValueChange={choose}>
			<Select.Trigger
				size="sm"
				data-slot="model-comparison-selector"
				aria-label="Compare with"
				title={line}
				className="ml-auto max-w-96 min-w-0 shrink-0"
			>
				<Select.Value>
					<ComparisonLine comparison={model.comparison} line={line} />
				</Select.Value>
			</Select.Trigger>
			<Select.Content align="end" className="w-120 max-w-[80vw]">
				{choices.map((choice) => (
					<ComparisonItem key={choice.value} choice={choice} />
				))}
			</Select.Content>
		</Select>
	);
}

/**
 * What the control says, which names the base for a page that reads it.
 * @param props The comparison and the words.
 * @param props.comparison The comparison on show.
 * @param props.line What the control says.
 * @returns The line.
 */
function ComparisonLine(props: {
	readonly comparison: Model["comparison"];
	readonly line: string;
}): JSX.Element {
	const { comparison, line } = props;
	if (comparison === undefined)
		return (
			<span data-slot="model-no-comparison" className="truncate">
				{line}
			</span>
		);
	return (
		<span
			data-slot="model-comparison"
			data-against={comparison.against?.id ?? ""}
			data-reason={comparison.reason}
			className="truncate"
		>
			{line}
		</span>
	);
}

/**
 * One choice: what it is, then what tells it from the others.
 * @param props The choice.
 * @param props.choice The choice.
 * @returns The item.
 */
function ComparisonItem({ choice }: { readonly choice: ComparisonChoice }): JSX.Element {
	const { value, label, detail } = choice;
	return (
		<Select.Item value={value} data-against-id={value} title={label}>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="whitespace-normal">{label}</span>
				{detail && (
					<span className="text-body text-muted-foreground line-clamp-2 whitespace-normal">
						{detail}
					</span>
				)}
			</span>
		</Select.Item>
	);
}

export { ModelComparisonSelector };

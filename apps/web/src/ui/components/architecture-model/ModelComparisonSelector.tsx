import { checkpointTime } from "#ui/rules/architecture-model/history-time.ts";
import { stateCatalogue } from "#ui/rules/architecture-model/state-catalogue.ts";
import { useCallback, type ComponentProps, type JSX } from "react";
import { Select } from "@archboard/ui-kit/components";
import {
	ModelReadingSelector,
	HistoryStatus,
} from "#ui/components/architecture-model/ModelReadingSelector.tsx";

type ComparisonSelectorProps = Pick<
	ComponentProps<typeof ModelReadingSelector>,
	"catalogue" | "history"
> & {
	against: string | null;
	onSelect: (against: string | null) => void;
};

/**
 * An explicit comparison belongs to the address, independently of the selected state.
 * @param props The requested base and available state and checkpoint catalogues.
 * @returns A comparison control that preserves unavailable choices.
 */
function ModelComparisonSelector(props: ComparisonSelectorProps): JSX.Element {
	const { against, onSelect, catalogue, history } = props;
	const choose = useCallback(
		(value: string | null): void => {
			if (value !== null) onSelect(value === "automatic" ? null : value.slice(9));
		},
		[onSelect],
	);
	const { refetch: readHistory } = history;
	const { refetch: readCatalogue } = catalogue;
	const opened = useCallback(
		(open: boolean): void => {
			if (open) void Promise.all([readHistory(), readCatalogue()]);
		},
		[readHistory, readCatalogue],
	);
	const choices = comparisonChoices(props);
	return (
		<Select
			value={against === null ? "automatic" : `selected:${against}`}
			onValueChange={choose}
			onOpenChange={opened}
		>
			<Select.Trigger size="sm" data-slot="model-comparison-selector" aria-label="Compare with">
				<Select.Value>Compare · {against === null ? "Default" : choices.get(against)}</Select.Value>
			</Select.Trigger>
			<Select.Content align="end" alignItemWithTrigger={false} className="w-auto max-w-xl min-w-80">
				<Select.Item value="automatic" data-against-id="default">
					Default comparison
				</Select.Item>
				{[...choices].map(([id, label]) => (
					<Select.Item key={id} value={`selected:${id}`} data-against-id={id}>
						{label}
					</Select.Item>
				))}
				{catalogue.isError && (
					<p role="alert" className="text-body max-w-prose p-3">
						Architecture states are unavailable. Reopen this menu to retry.
					</p>
				)}
				<HistoryStatus history={history} />
			</Select.Content>
		</Select>
	);
}

/**
 * Mutable state identities and exact checkpoint identities remain distinct choices.
 * @param props The current catalogue, retained catalogue, and requested base.
 * @returns Ordered comparison choices, including unavailable requested intent.
 */
function comparisonChoices(props: ComparisonSelectorProps): Map<string, string> {
	const choices = stateChoices(props.catalogue.data);
	for (const [id, label] of savedChoices(props.history.data)) choices.set(id, label);
	if (props.against !== null && !choices.has(props.against))
		choices.set(props.against, `Selected base · ${props.against}`);
	return choices;
}

/**
 * Current, draft, and completed choices follow the public state catalogue.
 * @param model The latest available catalogue.
 * @returns Explicit current and retained state labels.
 */
function stateChoices(model: ComparisonSelectorProps["catalogue"]["data"]): Map<string, string> {
	const choices = new Map<string, string>();
	if (model === undefined) return choices;
	if (model.manifest.current !== null) choices.set("current", "Current");
	for (const state of stateCatalogue(model))
		choices.set(state.id, `${state.name} · ${state.lifecycle}`);
	return choices;
}

/**
 * Saved bases always name an exact checkpoint, even when state names repeat.
 * @param history The retained catalogue response.
 * @returns Newest-first labels with a distinct checkpoint suffix.
 */
function savedChoices(history: ComparisonSelectorProps["history"]["data"]): Map<string, string> {
	if (!history?.success) return new Map();
	return new Map(
		history.checkpoints
			.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
			.map((checkpoint) => [
				checkpoint.id,
				`${checkpoint.state.name} · ${checkpointTime(checkpoint.createdAt)} · ${checkpoint.id.slice(0, 8)}`,
			]),
	);
}

export { ModelComparisonSelector };

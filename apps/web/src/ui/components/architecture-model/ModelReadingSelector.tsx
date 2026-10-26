import { useCallback, type JSX } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ArchitectureCheckpointList } from "@archboard/board/model";
import type { Model } from "#ui/rules/architecture-model/projection.ts";
import { Select } from "@archboard/ui-kit/components";

interface ModelReadingSelectorProps {
	checkpoint: string | null;
	state: string | null;
	selected: Model["selectedState"] | undefined;
	catalogue: UseQueryResult<Model>;
	onState: (state: string) => void;
	onSelect: (checkpoint: string | null) => void;
	history: UseQueryResult<ArchitectureCheckpointList>;
}

/**
 * Current is explicit and never inferred from archive order.
 * @param props The selected identity and retained metadata.
 * @returns A keyboard-accessible reading selector with local recovery.
 */
function ModelReadingSelector(props: ModelReadingSelectorProps): JSX.Element {
	const { checkpoint, state, onSelect, onState, history, catalogue } = props;
	const choose = useCallback(
		(value: string | null): void => {
			if (value === null) return;
			if (value.startsWith("state:")) onState(value.slice(6));
			else onSelect(value === "current" ? null : value.slice(11));
		},
		[onSelect, onState],
	);
	const { refetch: readHistory } = history;
	const { refetch: readCatalogue } = catalogue;
	const opened = useCallback(
		(open: boolean): void => {
			if (open) void Promise.all([readHistory(), readCatalogue()]);
		},
		[readHistory, readCatalogue],
	);
	return (
		<Select value={readingChoice(checkpoint, state)} onValueChange={choose} onOpenChange={opened}>
			<Select.Trigger
				size="sm"
				data-slot="model-reading-selector"
				aria-label="Architecture reading"
			>
				<Select.Value>{readingLabel(props)}</Select.Value>
			</Select.Trigger>
			<Select.Content align="end" alignItemWithTrigger={false} className="w-auto max-w-xl min-w-80">
				<Select.Item
					value="current"
					data-reading-id="current"
					disabled={catalogue.data?.manifest.current === null}
				>
					{catalogue.data?.manifest.current === null ? "No implemented state" : "Current"}
				</Select.Item>
				<ActiveStates {...props} />
				<RetainedChoices checkpoint={checkpoint} history={history} />
				<HistoryStatus history={history} />
			</Select.Content>
		</Select>
	);
}

/**
 * A state and an exact checkpoint have distinct option identities.
 * @param checkpoint The exact historical selection.
 * @param state The explicit mutable selection.
 * @returns One stable picker value, or Current.
 */
function readingChoice(checkpoint: string | null, state: string | null): string {
	if (checkpoint !== null) return `checkpoint:${checkpoint}`;
	return state === null ? "current" : `state:${state}`;
}

/**
 * Label the requested reading without silently replacing unavailable intent.
 * @param props The selected address and coherent metadata.
 * @returns Its explicit current, draft, or retained label.
 */
function readingLabel(props: ModelReadingSelectorProps): string {
	if (props.checkpoint !== null) return `Saved · ${props.checkpoint.slice(0, 8)}`;
	if (props.state !== null) return selectedStateLabel(props.selected, props.state);
	return props.catalogue.data?.manifest.current === null ? "Choose state" : "Current";
}

/**
 * An unavailable state keeps its requested identity in the control.
 * @param state The selected coherent metadata, when available.
 * @param requested The exact requested state.
 * @returns A lifecycle label or the unresolved identity.
 */
function selectedStateLabel(state: Model["selectedState"] | undefined, requested: string): string {
	if (state === null || state === undefined) return requested;
	return `${state.name} · ${state.lifecycle}`;
}

/**
 * Active proposals come from current inputs, independently of the selected retained state.
 * @param props The current catalogue and requested state.
 * @returns Explicit proposal choices and a missing requested state when necessary.
 */
function ActiveStates(props: ModelReadingSelectorProps): JSX.Element {
	const entries = new Map<string, Model["selectedState"] | undefined>(
		(props.catalogue.data?.proposals ?? []).map((entry) => [entry.id, entry]),
	);
	if (props.state !== null) entries.set(props.state, entries.get(props.state) ?? props.selected);
	return (
		<>
			{[...entries].map(([id, entry]) => (
				<Select.Item key={id} value={`state:${id}`} data-state-id={id}>
					<span className="flex flex-col gap-1">
						<span>{entry?.name ?? `Unavailable state · ${id}`}</span>
						<span className="text-muted-foreground text-body">
							{entry?.lifecycle ?? "Unavailable"}
						</span>
					</span>
				</Select.Item>
			))}
			{props.catalogue.isError && (
				<p role="alert" className="text-body max-w-prose p-3">
					Active states are unavailable. Reopen this menu to retry.
				</p>
			)}
		</>
	);
}

/**
 * Retained identities remain available even when their current definitions are gone.
 * @param props The checkpoint catalogue and explicit checkpoint selection.
 * @param props.checkpoint The exact requested identity.
 * @param props.history The retained metadata query.
 * @returns Ordered immutable readings with their original state metadata.
 */
function RetainedChoices({
	checkpoint,
	history,
}: Pick<ModelReadingSelectorProps, "checkpoint" | "history">): JSX.Element {
	const checkpoints = history.data?.success ? history.data.checkpoints : [];
	const entries = new Map<string, (typeof checkpoints)[number] | undefined>(
		checkpoints
			.toSorted(
				(left, right) =>
					right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
			)
			.map((entry) => [entry.id, entry]),
	);
	// Keep a missing selection present so catalogue changes cannot choose Current.
	if (checkpoint !== null) entries.set(checkpoint, entries.get(checkpoint));
	return (
		<>
			{[...entries].map(([id, entry]) => (
				<Select.Item key={id} value={`checkpoint:${id}`} data-reading-id={id}>
					{entry === undefined ? (
						<span className="flex flex-col gap-1">
							<span>Selected reading</span>
							<code className="text-muted-foreground text-control">{id}</code>
						</span>
					) : (
						<span className="flex min-w-0 flex-col gap-1">
							<span>
								{entry.state.name} · {checkpointTime(entry.createdAt)}
							</span>
							<span className="text-muted-foreground text-body max-w-prose whitespace-normal">
								{entry.request.doing}
							</span>
							<code className="text-muted-foreground text-control">{entry.id.slice(0, 8)}</code>
						</span>
					)}
				</Select.Item>
			))}
		</>
	);
}

/**
 * Show catalogue failures without blocking the current architecture.
 * @param props The retained metadata query.
 * @returns Its pending, empty, or refused state.
 */
function HistoryStatus(props: Pick<ModelReadingSelectorProps, "history">): JSX.Element | null {
	const { history } = props;
	if (history.isPending)
		return (
			<output className="text-body text-muted-foreground block p-3">
				Reading saved architecture…
			</output>
		);
	if (history.isError)
		return (
			<p role="alert" className="text-body max-w-prose p-3">
				{history.error.message} Reopen this menu to retry.
			</p>
		);
	if (!history.data.success)
		return (
			<div role="alert" className="text-body max-w-prose space-y-2 p-3">
				<p>{history.data.error}</p>
				{[...new Set(history.data.diagnostics.map((entry) => entry.recovery))].map((recovery) => (
					<p key={recovery}>{recovery}</p>
				))}
				<p>Reopen this menu after recovery.</p>
			</div>
		);
	if (history.data.checkpoints.length === 0)
		return <p className="text-body text-muted-foreground p-3">No saved readings yet.</p>;
	return null;
}

/**
 * Render the retained timestamp in the reader's locale.
 * @param value The shared ISO timestamp.
 * @returns A date and time, including the year.
 */
function checkpointTime(value: string): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
		new Date(value),
	);
}

export { ModelReadingSelector, HistoryStatus, checkpointTime };

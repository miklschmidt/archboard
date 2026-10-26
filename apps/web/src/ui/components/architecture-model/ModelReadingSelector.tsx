import { useCallback, type JSX } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ArchitectureCheckpointList } from "@archboard/board/model";
import { Select } from "@archboard/ui-kit/components";

interface ModelReadingSelectorProps {
	checkpoint: string | null;
	onSelect: (checkpoint: string | null) => void;
	history: UseQueryResult<ArchitectureCheckpointList>;
}

/**
 * Current is explicit and never inferred from archive order.
 * @param props The selected identity and retained metadata.
 * @returns A keyboard-accessible reading selector with local recovery.
 */
function ModelReadingSelector(props: ModelReadingSelectorProps): JSX.Element {
	const { checkpoint, onSelect, history } = props;
	const choose = useCallback(
		(value: string | null): void => {
			if (value !== null) onSelect(value === "current" ? null : value);
		},
		[onSelect],
	);
	const { refetch } = history;
	const opened = useCallback(
		(open: boolean): void => {
			if (open) void refetch();
		},
		[refetch],
	);
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
		<Select value={checkpoint ?? "current"} onValueChange={choose} onOpenChange={opened}>
			<Select.Trigger size="sm" data-slot="model-reading-selector" aria-label="Architecture reading">
				<Select.Value>
					{checkpoint === null ? "Current" : `Saved · ${checkpoint.slice(0, 8)}`}
				</Select.Value>
			</Select.Trigger>
			<Select.Content align="end" alignItemWithTrigger={false} className="w-auto max-w-xl min-w-80">
				<Select.Item value="current" data-reading-id="current">
					Current
				</Select.Item>
				{[...entries].map(([id, entry]) => (
					<Select.Item key={id} value={id} data-reading-id={id}>
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
				<HistoryStatus history={history} />
			</Select.Content>
		</Select>
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

export { ModelReadingSelector };

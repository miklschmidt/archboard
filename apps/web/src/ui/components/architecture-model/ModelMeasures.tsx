import { useCallback, useId, useMemo, useRef, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LocalityAnswer } from "@archboard/code-intel/history";
import { Button, Select } from "@archboard/ui-kit/components";
import { modelHistoryQuery } from "#ui/clients/architecture-model/history.ts";
import { ModelChoiceList } from "#ui/components/architecture-model/ModelChoiceList.tsx";
import { CountWords } from "#ui/components/architecture-model/ModelInterfaceLine.tsx";
import { useRevealedRow } from "#ui/hooks/architecture-model/use-revealed-row.ts";
import { historyDay } from "#ui/rules/architecture-model/history-time.ts";
import {
	MEASURES,
	NO_HISTORY_MEASURE,
	historySource,
	historyState,
	interfaceRows,
	isHistoryMeasure,
	measureOf,
	sortedRows,
	withHistory,
	type HistoryReading,
	type HistoryState,
	type MeasureKey,
	type MeasureRow,
	type ModuleHistory,
} from "#ui/rules/architecture-model/module-measures.ts";

/** Inputs for the list. */
interface ModelMeasuresProps {
	readonly vault: string;
	/** The reading on show. */
	readonly model: Parameters<typeof modelHistoryQuery>[1] & HistoryReading;
	readonly projection: Parameters<typeof interfaceRows>[0];
	/** The module that is selected on the picture, or null. */
	readonly selected: string | null;
	/** What the list is sorted by. */
	readonly measure: MeasureKey;
	readonly onMeasure: (measure: MeasureKey) => void;
	/** Select a module on its picture, here or in the other pane. */
	readonly onChoose: (id: string, beside: boolean) => void;
}

/** Why the lens did not read a module, as a row says it. */
const NOT_READ: Readonly<Record<LocalityAnswer["skipped"][number]["reason"], string>> = {
	unbound: "no code binding",
	"drill-down": "another board holds its history",
	"repository-unregistered": "repository not registered here",
	"checkout-unavailable": "checkout could not be read",
	"ref-not-checked-out": "its ref is not checked out",
};

/**
 * Where a design costs the most, with no need to know where to look: every module of the model
 * with its counts, the most of one measure first. The interface counts need no server, and the
 * history counts come with the read. No count is combined with another, and a row ranks nothing
 * but its own order (ADR 0044).
 * @param props The reading and what a row does.
 * @returns The list.
 */
function ModelMeasures(props: ModelMeasuresProps): JSX.Element {
	const { vault, model, projection, selected, onMeasure, onChoose } = props;
	const source = historySource(model);
	const query = useQuery({ ...modelHistoryQuery(vault, model), enabled: source === "bound" });
	const { refetch } = query;
	const readAgain = useCallback((): void => {
		void refetch();
	}, [refetch]);
	const state = historyState(source, query);
	const answer = state === "read" ? query.data : undefined;
	const modules = useMemo(() => interfaceRows(projection), [projection]);
	const rows = useMemo(() => withHistory(modules, answer), [modules, answer]);
	const measure =
		source === "bound" || !isHistoryMeasure(props.measure) ? props.measure : NO_HISTORY_MEASURE;
	const sorted = useMemo(() => sortedRows(rows, measure), [rows, measure]);
	const list = useRef<HTMLDivElement>(null);
	useRevealedRow(list, selected, 0);
	const choose = useCallback(
		(row: MeasureRow, beside: boolean): void => onChoose(row.id, beside),
		[onChoose],
	);
	const facts = useCallback((row: MeasureRow) => <Sorted row={row} measure={measure} />, [measure]);
	const detail = useCallback(
		(row: MeasureRow) => <RowWords row={row} sorted={measure} />,
		[measure],
	);
	return (
		<div data-slot="model-measures" data-history={state} className="flex min-h-full flex-col">
			<div className="bg-sidebar border-border sticky top-0 z-20 flex flex-col gap-2 border-b p-3">
				<MeasureSort measure={measure} history={source === "bound"} onMeasure={onMeasure} />
				<HistoryStatus
					state={state}
					answer={answer}
					modules={rows.length}
					failure={query.error?.message}
					busy={query.isFetching}
					onRead={readAgain}
				/>
			</div>
			{sorted.length === 0 ? (
				<p data-slot="model-measures-empty" className="text-body text-muted-foreground p-3">
					This reading holds no module.
				</p>
			) : (
				<div ref={list}>
					<ModelChoiceList
						label="Measures"
						entries={sorted}
						lit={selected}
						attribute="data-measure-row"
						onChoose={choose}
						facts={facts}
						detail={detail}
					/>
				</div>
			)}
		</div>
	);
}

/**
 * The one sort control. A reading with no history to read offers only what it can sort by.
 * @param props What the list is sorted by, and whether history can be read.
 * @param props.measure The measure.
 * @param props.history Whether the reading can read history.
 * @param props.onMeasure Sort by another measure.
 * @returns The control, with its label.
 */
function MeasureSort(props: {
	readonly measure: MeasureKey;
	readonly history: boolean;
	readonly onMeasure: (measure: MeasureKey) => void;
}): JSX.Element {
	const { measure, history, onMeasure } = props;
	const id = useId();
	const items = useMemo(
		() =>
			MEASURES.filter(({ key }) => history || !isHistoryMeasure(key)).map(({ key, label }) => ({
				value: key,
				label,
			})),
		[history],
	);
	const choose = useCallback(
		(value: MeasureKey | null): void => {
			if (value !== null) onMeasure(value);
		},
		[onMeasure],
	);
	return (
		<div className="flex items-center gap-2">
			<label htmlFor={id} className="text-body text-muted-foreground shrink-0">
				Sort by
			</label>
			<Select items={items} value={measure} onValueChange={choose}>
				<Select.Trigger id={id} size="sm" data-slot="model-measure-sort" className="w-full">
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					{items.map(({ value, label }) => (
						<Select.Item key={value} value={value}>
							{label}
						</Select.Item>
					))}
				</Select.Content>
			</Select>
		</div>
	);
}

/** Inputs for what the list says of its history. */
interface HistoryStatusProps {
	readonly state: HistoryState;
	readonly answer: Pick<LocalityAnswer, "hotspots" | "periods" | "leftOut"> | undefined;
	/** How many modules the list holds. */
	readonly modules: number;
	/** What happened to a failed read. */
	readonly failure: string | undefined;
	/** Whether a read runs. */
	readonly busy: boolean;
	readonly onRead: () => void;
}

/** What each state says on its own, with no fact of the answer. */
const STATED: Readonly<Partial<Record<HistoryState, string>>> = {
	unbound: "Code history needs code bindings, and no module here has one.",
	original: "An original under migration has no code history.",
};

/**
 * What the list says of the code history: why it has none, that it comes, what failed, or what the
 * counts cover.
 * @param props The state and the read.
 * @returns The line.
 */
function HistoryStatus(props: HistoryStatusProps): JSX.Element {
	const { state, answer, modules, failure, busy, onRead } = props;
	if (state === "reading")
		return (
			<output data-slot="model-measures-status" className="text-body text-muted-foreground">
				Reading code history…
			</output>
		);
	if (state === "failed")
		return (
			<div
				data-slot="model-measures-status"
				role="alert"
				className="text-body flex flex-col items-start gap-2 [overflow-wrap:anywhere]"
			>
				<p>The code history could not be read. {failure}</p>
				<ReadAction busy={busy} onRead={onRead}>
					Read again
				</ReadAction>
			</div>
		);
	if (answer === undefined)
		return (
			<p data-slot="model-measures-status" className="text-body text-muted-foreground">
				{STATED[state]}
			</p>
		);
	return (
		<div data-slot="model-measures-status" className="flex items-start justify-between gap-2">
			<p className="text-body text-muted-foreground">{coverOf(answer, modules)}</p>
			<ReadAction busy={busy} onRead={onRead}>
				Refresh
			</ReadAction>
		</div>
	);
}

/**
 * What the counts of an answer cover: how many modules, since when, and what no count holds.
 * @param answer The answer.
 * @param modules How many modules the list holds.
 * @returns The words.
 */
function coverOf(answer: NonNullable<HistoryStatusProps["answer"]>, modules: number): string {
	const { hotspots, periods, leftOut } = answer;
	const since = periods.map((period) => period.since).toSorted()[0];
	const large = leftOut.largeCommits;
	return [
		`${hotspots.length} of ${modules} modules read${since === undefined ? "" : ` since ${historyDay(since)}`}.`,
		large === 0 ? "" : `${large} large ${large === 1 ? "commit" : "commits"} left out.`,
	]
		.join(" ")
		.trim();
}

/**
 * The action that reads the history again.
 * @param props What it says and does.
 * @param props.busy Whether a read runs.
 * @param props.onRead Read.
 * @param props.children What it says.
 * @returns The action.
 */
function ReadAction(props: {
	readonly busy: boolean;
	readonly onRead: () => void;
	readonly children: string;
}): JSX.Element {
	return (
		<Button
			variant="outline"
			size="xs"
			data-slot="model-measures-read"
			disabled={props.busy}
			onClick={props.onRead}
			className="shrink-0"
		>
			{props.children}
		</Button>
	);
}

/**
 * The count a row is sorted by, which the eye runs down.
 * @param props The row and the measure.
 * @param props.row The row.
 * @param props.measure The measure.
 * @returns The number, or nothing for a module with no such measure.
 */
function Sorted(props: {
	readonly row: MeasureRow;
	readonly measure: MeasureKey;
}): JSX.Element | null {
	const { row, measure } = props;
	const count = measureOf(row, measure);
	if (count === undefined) return null;
	return (
		<span data-slot="model-measure-sorted" className="text-control text-foreground">
			{count}
			<span className="sr-only"> {MEASURES.find(({ key }) => key === measure)?.label}</span>
		</span>
	);
}

/**
 * What a row says of its module besides the sorted count: what the history says of it, then its
 * interface. A module with no parts has no interface, so it shows what it has. A count of none
 * leaves the row, so the rows stay short, and the interface line of the module holds them all.
 * Only commits keep their count of none, because that tells a module no commit changed from one
 * that was not read.
 * @param props The row and what it is sorted by.
 * @param props.row The row.
 * @param props.sorted What it is sorted by.
 * @returns The words.
 */
function RowWords(props: { readonly row: MeasureRow; readonly sorted: MeasureKey }): JSX.Element {
	const { row, sorted } = props;
	return (
		<span className="text-body text-muted-foreground flex flex-wrap gap-x-2 empty:hidden">
			<HistoryWords history={row.history} sorted={sorted} />
			{row.counts
				?.filter(({ key, count }) => count > 0 && key !== sorted)
				.map(({ key, count, label }) => (
					<MeasureWords key={key} measure={key} count={count} label={label} />
				))}
		</span>
	);
}

/**
 * One count of a row.
 * @param props The count.
 * @param props.measure What it counts.
 * @param props.count How many.
 * @param props.label What of, in words.
 * @returns The words.
 */
function MeasureWords(props: {
	readonly measure: MeasureKey;
	readonly count: number;
	readonly label: string;
}): JSX.Element {
	const { measure, count, label } = props;
	return (
		<span data-measure={measure} data-count={count} className="whitespace-nowrap">
			<CountWords count={count} label={label} />
		</span>
	);
}

/**
 * What the history says of a module. A module the read skipped says why, so it never looks like a
 * module that no commit changed (ADR 0045).
 * @param props What the answer says of it, and what the row is sorted by.
 * @param props.history That, or nothing while no answer holds it.
 * @param props.sorted What the row is sorted by.
 * @returns The words, or nothing when nothing is known.
 */
function HistoryWords(props: {
	readonly history: ModuleHistory | undefined;
	readonly sorted: MeasureKey;
}): JSX.Element | null {
	const { history, sorted } = props;
	if (history === undefined) return null;
	if (history.kind === "skipped")
		return <span data-not-read={history.reason}>Not read: {NOT_READ[history.reason]}</span>;
	return <ReadWords commits={history.commits} unjoined={history.unjoined} sorted={sorted} />;
}

/**
 * The counts of a module that the lens read.
 * @param props The counts, and what the row is sorted by.
 * @param props.commits The commits that changed it.
 * @param props.unjoined The pairs with no relationship that it stands in.
 * @param props.sorted What the row is sorted by.
 * @returns The words.
 */
function ReadWords(props: {
	readonly commits: number;
	readonly unjoined: number;
	readonly sorted: MeasureKey;
}): JSX.Element {
	const { commits, unjoined, sorted } = props;
	return (
		<>
			{sorted !== "commits" && (
				<MeasureWords
					measure="commits"
					count={commits}
					label={commits === 1 ? "commit" : "commits"}
				/>
			)}
			{sorted !== "unjoined" && unjoined > 0 && (
				<MeasureWords measure="unjoined" count={unjoined} label="unjoined" />
			)}
		</>
	);
}

export { ModelMeasures };

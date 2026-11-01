import { useCallback, useId, useMemo, useRef, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/board/content";
import type { LocalityAnswer } from "@archboard/code-intel/history";
import { Button, cn, Select } from "@archboard/ui-kit/components";
import { modelHistoryQuery } from "#ui/clients/architecture-model/history.ts";
import { ModelChoiceList } from "#ui/components/architecture-model/ModelChoiceList.tsx";
import {
	COUNT_COLUMNS,
	ModelMeasureCells,
	NOT_READ,
	measureRowLabel,
} from "#ui/components/architecture-model/ModelMeasureRow.tsx";
import { useRevealedRow } from "#ui/hooks/architecture-model/use-revealed-row.ts";
import { historyDay } from "#ui/rules/architecture-model/history-time.ts";
import {
	MEASURES,
	NO_HISTORY_MEASURE,
	historySource,
	historyState,
	interfaceRows,
	isHistoryMeasure,
	mostOf,
	sortedRows,
	withHistory,
	type HistoryReading,
	type HistoryState,
	type Measure,
	type MeasureKey,
	type MeasureRow,
} from "#ui/rules/architecture-model/module-measures.ts";
import { kindLookOf } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

/** What the sort offers, by where the measure comes from. */
const HISTORY_MEASURES = MEASURES.filter(({ key }) => isHistoryMeasure(key));
const INTERFACE_MEASURES = MEASURES.filter(({ key }) => !isHistoryMeasure(key));

/** The name of each measure, as the closed sort says it. */
const SORT_ITEMS = MEASURES.map(({ key, label }) => ({ value: key, label }));

/** Inputs for the sort, and for the shelf that holds it. */
interface MeasureSortProps {
	readonly measure: MeasureKey;
	/** Whether the reading can read history. */
	readonly history: boolean;
	readonly onMeasure: (measure: MeasureKey) => void;
}

/** Inputs for the list. */
interface ModelMeasuresProps {
	readonly vault: string;
	/** The reading on show. */
	readonly model: Parameters<typeof modelHistoryQuery>[1] & HistoryReading & Pick<Model, "policy">;
	readonly projection: Parameters<typeof interfaceRows>[0];
	/** The module that is selected on the picture, or null. */
	readonly selected: string | null;
	/** What the list is sorted by. */
	readonly measure: MeasureKey;
	readonly onMeasure: (measure: MeasureKey) => void;
	/** Select a module on its picture, here or in the other pane. */
	readonly onChoose: (id: string, beside: boolean) => void;
}

/**
 * Where a design costs the most, with no need to know where to look: a table of every module of
 * the model, the most of one measure first, on the floor of the column's well. A shelf holds the
 * sort and the column heads, and a foot says what the counts cover. The interface counts need no
 * server, and the history counts come with the read. No count is combined with another, and a row
 * ranks nothing but its own order (ADR 0044).
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
	const most = mostOf(rows, measure);
	const look = useMemo(() => kindLookOf(model.policy, new Map()), [model.policy]);
	const facts = useCallback(
		(row: MeasureRow) => <ModelMeasureCells row={row} sorted={measure} most={most} look={look} />,
		[measure, most, look],
	);
	return (
		<div data-slot="model-measures" data-history={state} className="flex min-h-full flex-col">
			<MeasureShelf measure={measure} history={source === "bound"} onMeasure={onMeasure} />
			<div className="flex-1">
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
							rowLabel={measureRowLabel}
							flat
						/>
					</div>
				)}
			</div>
			<div className="bg-raised shadow-edge-up sticky bottom-0 z-10 px-3 py-2">
				<HistoryStatus
					state={state}
					answer={answer}
					modules={rows.length}
					failure={query.error?.message}
					busy={query.isFetching}
					onRead={readAgain}
				/>
			</div>
		</div>
	);
}

/**
 * What stands over the table while it scrolls: the sort, what it counts, and a head over each
 * column. The head of the sorted column is lit, so its numbers have a name.
 * @param props What the list is sorted by, and whether history can be read.
 * @returns The shelf.
 */
function MeasureShelf(props: MeasureSortProps): JSX.Element {
	const { measure, history, onMeasure } = props;
	return (
		<div className="bg-raised shadow-edge-down sticky top-0 z-20 flex items-end gap-2 pt-2 pr-3 pl-3">
			<div className="flex min-w-0 flex-1 flex-col gap-1.5 self-start pb-2">
				<MeasureSort measure={measure} history={history} onMeasure={onMeasure} />
				<p data-slot="model-measure-meaning" className="text-body text-muted-foreground">
					{MEASURES.find(({ key }) => key === measure)?.description}
				</p>
			</div>
			<div aria-hidden="true" className={COUNT_COLUMNS}>
				{MEASURES.map(({ key, label }) => (
					<ColumnHead key={key} label={label} sorted={key === measure} />
				))}
			</div>
		</div>
	);
}

/**
 * The name of one column, turned on its side as the dimension of a drawing is, so seven names
 * stand over seven narrow columns. The table's rows say each count in words to assistive
 * technology, so the head stays out of that reading.
 * @param props The name, and whether the list is sorted by it.
 * @param props.label The name.
 * @param props.sorted Whether the list is sorted by it.
 * @returns The head.
 */
function ColumnHead(props: { readonly label: string; readonly sorted: boolean }): JSX.Element {
	const { label, sorted } = props;
	return (
		<span className="relative flex h-22 justify-end pr-0.5">
			<span
				data-measure-head={sorted ? "sorted" : undefined}
				className={cn(
					"text-body rotate-180 pt-2 [writing-mode:vertical-rl]",
					sorted ? "text-foreground font-semibold" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
		</span>
	);
}

/**
 * The one sort control. A reading with no history to read offers only what it can sort by.
 * @param props What the list is sorted by, and whether history can be read.
 * @returns The control, with its label.
 */
function MeasureSort(props: MeasureSortProps): JSX.Element {
	const { measure, history, onMeasure } = props;
	const id = useId();
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
			<Select items={SORT_ITEMS} value={measure} onValueChange={choose}>
				<Select.Trigger id={id} size="sm" data-slot="model-measure-sort" className="min-w-0 flex-1">
					<Select.Value />
				</Select.Trigger>
				<Select.Content className="w-115">
					{history && <MeasureChoices label="Code history" measures={HISTORY_MEASURES} />}
					<MeasureChoices label="Interface" measures={INTERFACE_MEASURES} />
				</Select.Content>
			</Select>
		</div>
	);
}

/**
 * The choices of one source, each with what it counts and what it shows.
 * @param props The source and its measures.
 * @param props.label What the measures read.
 * @param props.measures The measures.
 * @returns The group.
 */
function MeasureChoices(props: {
	readonly label: string;
	readonly measures: readonly Measure[];
}): JSX.Element {
	return (
		<Select.Group>
			<Select.Label>{props.label}</Select.Label>
			{props.measures.map(({ key, label, description }) => (
				<Select.Item key={key} value={key} description={description}>
					{label}
				</Select.Item>
			))}
		</Select.Group>
	);
}

/** Inputs for what the list says of its history. */
interface HistoryStatusProps {
	readonly state: HistoryState;
	readonly answer: Pick<LocalityAnswer, "hotspots" | "periods" | "leftOut" | "skipped"> | undefined;
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
		<div data-slot="model-measures-status" className="flex items-center justify-between gap-3">
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
		notReadWords(answer.skipped),
		large === 0 ? "" : `${large} large ${large === 1 ? "commit" : "commits"} left out.`,
	]
		.join(" ")
		.trim();
}

/**
 * Why modules were not read, once, so that no row has to say it.
 * @param skipped The modules the lens skipped.
 * @returns The words, or nothing when it read them all.
 */
function notReadWords(skipped: LocalityAnswer["skipped"]): string {
	const reasons = new Map<string, number>();
	for (const { reason } of skipped)
		reasons.set(NOT_READ[reason], (reasons.get(NOT_READ[reason]) ?? 0) + 1);
	const words = [...reasons].map(([reason, count]) => `${count} ${reason}`);
	return words.length === 0 ? "" : `Not read: ${words.join(", ")}.`;
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

export { ModelMeasures };

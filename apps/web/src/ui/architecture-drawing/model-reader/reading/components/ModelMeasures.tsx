import {
	useCallback,
	useMemo,
	useRef,
	useState,
	type JSX,
	type KeyboardEvent,
	type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import type { LocalityAnswer } from "@archboard/code-intel/history";
import { Button } from "@archboard/ui-kit/components";
import { modelHistoryQuery } from "#ui/architecture-drawing/model-reader/access/clients/history.ts";
import {
	MeasureHead,
	MeasureShow,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelMeasureHead.tsx";
import {
	ModelMeasureRow,
	NOT_READ,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelMeasureRow.tsx";
import { useRevealedRow } from "#ui/architecture-drawing/model-reader/reading/hooks/use-revealed-row.ts";
import { historyDay } from "#ui/architecture-drawing/model-reader/rules/history-time.ts";
import {
	historySource,
	historyState,
	interfaceRows,
	isHistoryMeasure,
	measuresOf,
	mostOf,
	shownRows,
	sortedBy,
	sortedRows,
	withHistory,
	type HistoryReading,
	type HistoryState,
	type MeasureKey,
	type MeasureRow,
	type MeasureView,
} from "#ui/architecture-drawing/model-reader/reading/rules/module-measures.ts";
import type { KindLook } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import { treeKey } from "#ui/shell/rules/tree-keys.ts";

/** Inputs for the table. */
interface ModelMeasuresProps {
	readonly vault: string;
	/** The reading on show. */
	readonly model: Parameters<typeof modelHistoryQuery>[1] & HistoryReading & Pick<Model, "policy">;
	readonly projection: Parameters<typeof interfaceRows>[0];
	/** What the table is about, as its caption says it. */
	readonly label: string;
	/** The measures that the table has a column for, in the order of its columns. */
	readonly keys: readonly MeasureKey[];
	/** How the kinds of the model look, with the icons the picture draws them with. */
	readonly look: KindLook;
	/** The module that is selected on the picture, or null. */
	readonly selected: string | null;
	/** How the table stands: what it is sorted by, from which end, and what is on show. */
	readonly view: MeasureView;
	readonly onView: (view: MeasureView) => void;
	/** Select a module on its picture, here or in the other pane. */
	readonly onChoose: (id: string, beside: boolean) => void;
}

/**
 * Where a design costs the most, with no need to know where to look: a table of every module of the
 * model with a column for each of its measures, as the site's Measures table. A column's head sorts
 * the rows by it, and a foot says what the counts cover. The interface counts need no server, and a
 * table of history counts reads the history when it opens. No count is combined with another, and a
 * row ranks nothing but its own order (ADR 0044).
 * @param props The reading, the measures and what a row does.
 * @returns The table.
 */
function ModelMeasures(props: ModelMeasuresProps): JSX.Element {
	const { vault, model, projection, keys, view, onView } = props;
	const history = keys.some(isHistoryMeasure);
	const source = historySource(model);
	const bound = source === "bound";
	const query = useQuery({ ...modelHistoryQuery(vault, model), enabled: history && bound });
	const state = historyState(source, query);
	const answer = state === "read" ? query.data : undefined;
	const modules = useMemo(() => interfaceRows(projection), [projection]);
	const rows = useMemo(() => withHistory(modules, answer), [modules, answer]);
	const measures = useMemo(() => {
		const offered = measuresOf(modules);
		return keys.flatMap((key) => offered.filter((one) => one.key === key));
	}, [modules, keys]);
	const measure = tableMeasure(view.measure, measures, bound);
	const shown = useMemo(() => shownRows(rows, view.show), [rows, view.show]);
	const sorted = useMemo(
		() => sortedRows(shown, measure, view.fewest),
		[shown, measure, view.fewest],
	);
	return (
		<div
			data-slot="model-measures"
			data-history={history ? state : undefined}
			className="flex min-h-0 flex-1 flex-col gap-3"
		>
			<div className="flex items-center justify-between gap-6">
				<p data-slot="model-measure-meaning" className="text-body text-muted-foreground">
					{descriptionOf(measures, measure)}
				</p>
				<MeasureShow view={view} onView={onView} />
			</div>
			<MeasureBody
				{...props}
				rows={sorted}
				modules={rows.length}
				measures={measures}
				measure={measure}
			/>
			<MeasureFoot shown={shown.length} modules={rows.length} view={view} history={history}>
				{history && (
					<HistoryStatus
						state={state}
						answer={answer}
						modules={rows.length}
						failure={query.error?.message}
						busy={query.isFetching}
						onRead={query.refetch}
					/>
				)}
			</MeasureFoot>
		</div>
	);
}

/**
 * What the sorted measure counts and what it shows.
 * @param measures The measures of the table.
 * @param measure The sorted one.
 * @returns The words.
 */
function descriptionOf(measures: ReturnType<typeof measuresOf>, measure: MeasureKey): string {
	return measures.find(({ key }) => key === measure)?.description ?? "";
}

/**
 * The rows, or what stands in their place when none is on show.
 * @param props The rows, how many modules the reading holds, and the table they stand in.
 * @returns The table, or a line that says why it is empty.
 */
function MeasureBody(props: MeasureTableProps & { readonly modules: number }): JSX.Element {
	const { rows, modules } = props;
	if (rows.length > 0) return <MeasureTable {...props} />;
	return (
		<p
			data-slot="model-measures-empty"
			className="text-body text-muted-foreground bg-tray-sink shadow-well rounded-panel flex-1 p-4"
		>
			{modules === 0 ? "This reading holds no module." : "No module is of this kind."}
		</p>
	);
}

/**
 * The measure that the table is sorted by: the reader's choice where the table offers it, and
 * else its first column. A table of history with no history to read sorts by name, because every
 * count of it is missing.
 * @param key The measure the reader chose.
 * @param measures The measures of the table.
 * @param bound Whether the reading can read history.
 * @returns The measure.
 */
function tableMeasure(
	key: MeasureKey,
	measures: ReturnType<typeof measuresOf>,
	bound: boolean,
): MeasureKey {
	const chosen = sortedBy(key, measures, bound);
	if (measures.some((one) => one.key === chosen)) return chosen;
	return measures[0]?.key ?? chosen;
}

/**
 * What stands under the table: how many modules are on show while some are not, what the history
 * covers, and what a blank, a dash and a none mean.
 * @param props What the table holds and how it stands.
 * @param props.shown How many modules are on show.
 * @param props.modules How many modules the reading holds.
 * @param props.view How the table stands.
 * @param props.history Whether the table counts history.
 * @param props.children What the table says of its history.
 * @returns The foot.
 */
function MeasureFoot(props: {
	readonly shown: number;
	readonly modules: number;
	readonly view: MeasureView;
	readonly history: boolean;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<div className="flex flex-col gap-1.5">
			{props.view.show !== "all" && (
				<p data-slot="model-measures-shown" className="text-body text-muted-foreground">
					{props.shown} of {props.modules} modules on show.
				</p>
			)}
			{props.children}
			<p data-slot="model-measures-key" className="text-body text-muted-foreground">
				{props.history
					? "0 is none. A dash was not read, and says why on hover."
					: "0 is none. A blank has no count: a module with no parts has no interface."}
			</p>
		</div>
	);
}

/** Inputs for the rows of the table. */
type MeasureTableProps = ModelMeasuresProps & {
	/** The rows, in their order. */
	readonly rows: readonly MeasureRow[];
	readonly measures: ReturnType<typeof measuresOf>;
	/** The measure the rows are sorted by. */
	readonly measure: MeasureKey;
};

/**
 * The table: the head that sorts and a row for each module. The rows hold one tab stop, which the
 * arrows, Home and End walk, and Enter or Space selects the module, beside the reading with Alt.
 * @param props The rows and the table they stand in.
 * @returns The table, in a well that scrolls.
 */
function MeasureTable(props: MeasureTableProps): JSX.Element {
	const { rows, measures, measure, view, onView, selected, look, onChoose } = props;
	const list = useRef<HTMLDivElement>(null);
	useRevealedRow(list, selected, 0);
	const [focused, setFocused] = useState<string | null>(null);
	const stop = [focused, selected, rows[0]?.id].find(
		(id): id is string => typeof id === "string" && rows.some((row) => row.id === id),
	);
	const most = mostOf(rows, measure);
	const choose = useCallback(
		(row: MeasureRow, beside: boolean): void => onChoose(row.id, beside),
		[onChoose],
	);
	const keyRows = useMemo(
		() => rows.map((row) => ({ id: row.id, parent: null, branch: false, open: false, row })),
		[rows],
	);
	const focusRow = useCallback((id: string): void => {
		setFocused(id);
		list.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"] button`)?.focus();
	}, []);
	const walk = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>): void => {
			const action = stop === undefined ? null : treeKey(keyRows, stop, event);
			if (action === null || action.kind === "toggle") return;
			event.preventDefault();
			if (action.kind === "open") onChoose(action.row.id, action.beside);
			else focusRow(action.id);
		},
		[stop, keyRows, onChoose, focusRow],
	);
	// The head stands over the rows, so the well keeps a row that it scrolls to clear of the head:
	// the selected row it reveals, and the row the keys walk to.
	return (
		<div
			ref={list}
			className="bg-tray-sink shadow-well rounded-panel min-h-0 flex-1 scroll-pt-10 overflow-y-auto"
		>
			<table className="w-full border-separate border-spacing-0">
				<caption className="sr-only">{props.label}. A column's head sorts the rows by it.</caption>
				<MeasureHead view={view} measure={measure} measures={measures} onView={onView} />
				<tbody>
					{rows.map((row) => (
						<ModelMeasureRow
							key={row.id}
							row={row}
							measures={measures}
							sorted={measure}
							most={most}
							look={look}
							lit={row.id === selected}
							stop={row.id === stop}
							onChoose={choose}
							onFocusRow={setFocused}
							onKeyDown={walk}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}

/** Inputs for what the table says of its history. */
interface HistoryStatusProps {
	readonly state: HistoryState;
	readonly answer: Pick<LocalityAnswer, "hotspots" | "periods" | "leftOut" | "skipped"> | undefined;
	/** How many modules the table holds. */
	readonly modules: number;
	/** What happened to a failed read. */
	readonly failure: string | undefined;
	/** Whether a read runs. */
	readonly busy: boolean;
	readonly onRead: () => unknown;
}

/** What each state says on its own, with no fact of the answer. */
const STATED: Readonly<Partial<Record<HistoryState, string>>> = {
	unbound: "Code history needs code bindings, and no module here has one.",
	original: "An original under migration has no code history.",
	branch: "A branch reading has no code history here. Open the checkout's reading to read it.",
};

/**
 * What the table says of the code history: why it has none, that it comes, what failed, or what the
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
				className="text-body flex items-center justify-between gap-3 [overflow-wrap:anywhere]"
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
 * What the counts of an answer cover: how many modules, since when, what no count holds, and that a
 * module with parts counts every commit that changed its code path, its parts included.
 * @param answer The answer.
 * @param modules How many modules the table holds.
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
		"A module with parts counts the commits of its whole code path.",
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
	readonly onRead: () => unknown;
	readonly children: string;
}): JSX.Element {
	const { onRead } = props;
	const read = useCallback((): void => {
		void onRead();
	}, [onRead]);
	return (
		<Button
			variant="outline"
			size="xs"
			data-slot="model-measures-read"
			disabled={props.busy}
			onClick={read}
			className="shrink-0"
		>
			{props.children}
		</Button>
	);
}

export { ModelMeasures };

import { useCallback, useMemo, useRef, type CSSProperties, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import type { LocalityAnswer } from "@archboard/code-intel/history";
import { Button } from "@archboard/ui-kit/components";
import { modelHistoryQuery } from "#ui/clients/architecture-model/history.ts";
import { ModelChoiceList } from "#ui/components/architecture-model/ModelChoiceList.tsx";
import {
	ModelMeasureCells,
	NOT_READ,
	measureRowLabel,
} from "#ui/components/architecture-model/ModelMeasureRow.tsx";
import { MeasureShelf } from "#ui/components/architecture-model/ModelMeasureShelf.tsx";
import { useRevealedRow } from "#ui/hooks/architecture-model/use-revealed-row.ts";
import { historyDay } from "#ui/rules/architecture-model/history-time.ts";
import {
	historySource,
	historyState,
	interfaceRows,
	measuresOf,
	mostOf,
	shownRows,
	sortedBy,
	sortedRows,
	withHistory,
	type HistoryReading,
	type HistoryState,
	type MeasureRow,
	type MeasureView,
} from "#ui/rules/architecture-model/module-measures.ts";
import { kindLookOf } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";

/** Inputs for the list. */
interface ModelMeasuresProps {
	readonly vault: string;
	/** The reading on show. */
	readonly model: Parameters<typeof modelHistoryQuery>[1] & HistoryReading & Pick<Model, "policy">;
	readonly projection: Parameters<typeof interfaceRows>[0];
	/** The module that is selected on the picture, or null. */
	readonly selected: string | null;
	/** How the list stands: what it is sorted by, from which end, and what is on show. */
	readonly view: MeasureView;
	readonly onView: (view: MeasureView) => void;
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
	const { vault, model, projection, selected, view, onView, onChoose } = props;
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
	const measures = useMemo(() => measuresOf(modules), [modules]);
	const measure = sortedBy(view.measure, measures, source === "bound");
	const shown = useMemo(() => shownRows(rows, view.show), [rows, view.show]);
	const sorted = useMemo(
		() => sortedRows(shown, measure, view.fewest),
		[shown, measure, view.fewest],
	);
	const list = useRef<HTMLDivElement>(null);
	useRevealedRow(list, selected, 0);
	const choose = useCallback(
		(row: MeasureRow, beside: boolean): void => onChoose(row.id, beside),
		[onChoose],
	);
	const most = mostOf(shown, measure);
	const look = useMemo(() => kindLookOf(model.policy, new Map()), [model.policy]);
	const facts = useCallback(
		(row: MeasureRow) => (
			<ModelMeasureCells row={row} measures={measures} sorted={measure} most={most} look={look} />
		),
		[measures, measure, most, look],
	);
	const label = useCallback((row: MeasureRow) => measureRowLabel(row, measures), [measures]);
	const columns = useMemo<CSSProperties>(
		() => ({ "--measure-columns": measures.length }),
		[measures.length],
	);
	return (
		<div
			data-slot="model-measures"
			data-history={state}
			style={columns}
			className="flex min-h-full flex-col"
		>
			<MeasureShelf
				view={view}
				measure={measure}
				measures={measures}
				history={source === "bound"}
				onView={onView}
			/>
			<div className="flex-1">
				{sorted.length === 0 ? (
					<p data-slot="model-measures-empty" className="text-body text-muted-foreground p-3">
						{rows.length === 0 ? "This reading holds no module." : "No module is of this kind."}
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
							rowLabel={label}
							flat
						/>
					</div>
				)}
			</div>
			<div className="bg-raised shadow-edge-up sticky bottom-0 z-10 flex flex-col gap-1.5 px-3 py-2">
				{view.show !== "all" && (
					<p data-slot="model-measures-shown" className="text-body text-muted-foreground">
						{shown.length} of {rows.length} modules on show.
					</p>
				)}
				<HistoryStatus
					state={state}
					answer={answer}
					modules={rows.length}
					failure={query.error?.message}
					busy={query.isFetching}
					onRead={readAgain}
				/>
				<p data-slot="model-measures-key" className="text-body text-muted-foreground">
					0 is none. A blank has no count: a module with no parts has no interface. A dash was not
					read.
				</p>
			</div>
		</div>
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
 * What the counts of an answer cover: how many modules, since when, what no count holds, and that a
 * module with parts counts every commit that changed its code path, its parts included.
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

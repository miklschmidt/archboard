import { useCallback, useMemo, useState, type JSX } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { CheckpointRows } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import type { Model } from "@archboard/model/content";
import { Tree } from "#ui/shell/components/Tree.tsx";
import { sharedNameTouches } from "#ui/architecture-drawing/model-reader/reading/rules/draft-touches.ts";
import {
	checkpointTime,
	historyDay,
} from "#ui/architecture-drawing/model-reader/rules/history-time.ts";
import {
	CURRENT,
	recordRows,
	recordSections,
	type ListedState,
	type RecordEntry,
	type RecordKind,
	type RecordRow,
	type RecordWords as Words,
} from "#ui/architecture-drawing/model-reader/reading/rules/record-rows.ts";
import { proposalStanding } from "#ui/architecture-drawing/model-reader/rules/standing.ts";
import { stateCatalogue } from "#ui/architecture-drawing/model-reader/reading/rules/state-catalogue.ts";
import { NAME_GAP } from "#ui/shell/rules/tree-grid.ts";
import { TimelineNode } from "#ui/variant-lifecycle/components/TimelineNode.tsx";
import { cn } from "@archboard/ui-kit/components";

interface ModelReadingSelectorProps {
	checkpoint: string | null;
	state: string | null;
	selected: Model["selectedState"] | undefined;
	/** The comparison that the address names. */
	against: string | null;
	catalogue: UseQueryResult<Model>;
	onState: (state: string) => void;
	onSelect: (checkpoint: string | null) => void;
	onCompare: (against: string) => void;
	history: UseQueryResult<CheckpointRows>;
}

/** What every row of the list does. */
interface RecordActions {
	/** The record on screen. */
	readonly lit: string;
	/** The base of the comparison on show, which its row says. */
	readonly against: string | null;
	readonly onOpen: (row: RecordRow) => void;
	readonly onToggle: (row: RecordRow) => void;
	readonly onCompare: (against: string) => void;
}

const WORDS_STYLE = { marginLeft: NAME_GAP } as const;

/** The word that says where a state stands on the timeline. */
const KIND_WORD: Readonly<Record<RecordKind, string>> = {
	draft: "Proposal",
	current: "Current",
	historical: "Earlier",
	shelved: "Shelved",
	unknown: "Unavailable",
};
const NO_CHECKPOINTS: readonly never[] = [];
const NO_TOUCHES: ReadonlyMap<string, string> = new Map();

/**
 * The identity of the state on show. An address can name a state by its name.
 * @param props The address and the reading.
 * @returns The identity, or nothing for no state.
 */
function stateOnShow(props: ModelReadingSelectorProps): string | null {
	return props.state === null ? null : (props.selected?.id ?? props.state);
}

/**
 * Read what the catalogue says of the selected reading, keeping a requested state that it lacks.
 * @param props The selected identity and the catalogue.
 * @returns Proposals and the states, in the catalogue's order.
 */
function logicalStates(props: ModelReadingSelectorProps) {
	const entries = new Map<string, ListedState["state"]>(
		stateCatalogue(props.catalogue.data).map((entry) => [entry.id, entry]),
	);
	const asked = stateOnShow(props);
	if (asked !== null) entries.set(asked, entries.get(asked) ?? props.selected);
	const listed = [...entries].map(([id, state]) => ({ id, state }));
	return {
		proposals: listed.filter(({ state }) => state?.lifecycle === "draft"),
		states: listed.filter(({ state }) => state?.lifecycle !== "draft"),
	};
}

/**
 * The record of a model, folded as the reader left it.
 * @param props The selected identity and retained metadata.
 * @param unfolded The rows that the reader opened.
 * @returns Its sections.
 */
function recordOf(props: ModelReadingSelectorProps, unfolded: ReadonlySet<string>) {
	const { history, catalogue, checkpoint } = props;
	const checkpoints = history.data?.success === true ? history.data.checkpoints : NO_CHECKPOINTS;
	const touches = catalogue.data === undefined ? NO_TOUCHES : sharedNameTouches(catalogue.data);
	return recordSections({ ...logicalStates(props), checkpoints, unfolded, checkpoint, touches });
}

/**
 * The record of a model: what is proposed, because it is future work, then what is current, what
 * came before and what was let go. Choosing a record carries the picture to it, and a saved
 * checkpoint offers Compare.
 * @param props The selected identity and retained metadata.
 * @returns The list, with its recovery.
 */
function ModelReadingSelector(props: ModelReadingSelectorProps): JSX.Element {
	const { checkpoint, against, onSelect, onState, onCompare, history } = props;
	const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
	const toggle = useCallback((row: RecordRow): void => {
		setUnfolded((current) => {
			const next = new Set(current);
			if (!next.delete(row.id)) next.add(row.id);
			return next;
		});
	}, []);
	const open = useCallback(
		(row: RecordRow): void => {
			if (row.checkpoint !== null) onSelect(row.checkpoint);
			else if (row.stateId === null) onSelect(null);
			else onState(row.stateId);
		},
		[onSelect, onState],
	);
	const sections = recordOf(props, unfolded);
	const lit = checkpoint ?? stateOnShow(props) ?? CURRENT;
	const actions = useMemo(
		() => ({ lit, against, onOpen: open, onToggle: toggle, onCompare }),
		[lit, against, open, toggle, onCompare],
	);
	return (
		<div data-slot="model-history" className="flex flex-col">
			{/* A state folds its checkpoints, so the rows wait for them: none moves under a pointer
			    when they arrive. */}
			{!history.isPending && (
				<Tree
					label="History"
					rows={recordRows(sections)}
					home={lit}
					onOpen={open}
					onToggle={toggle}
				>
					{sections.map(({ label, entries }) => (
						<Tree.Section key={label} label={label}>
							{entries.map((entry) => (
								<RecordBranch key={entry.head.id} entry={entry} actions={actions} />
							))}
						</Tree.Section>
					))}
				</Tree>
			)}
			{props.catalogue.isError && (
				<p role="alert" className="text-body max-w-prose p-3">
					Architecture states are unavailable. Reopen History to retry.
				</p>
			)}
			<HistoryStatus history={history} />
		</div>
	);
}

/**
 * A record and, while it is open, the checkpoints it folds.
 * @param props The record and what its rows do.
 * @param props.entry The record.
 * @param props.actions What the rows do.
 * @returns The rows.
 */
function RecordBranch(props: {
	readonly entry: RecordEntry;
	readonly actions: RecordActions;
}): JSX.Element {
	const { entry, actions } = props;
	if (entry.head.words === null) return <CheckpointRow row={entry.head} actions={actions} />;
	return (
		<>
			<StateRow row={entry.head} words={entry.head.words} actions={actions} />
			{entry.held.length > 0 && (
				<Tree.Group depth={0}>
					{entry.held.map((row) => (
						<CheckpointRow key={row.id} row={row} actions={actions} />
					))}
				</Tree.Group>
			)}
		</>
	);
}

/**
 * What names a record for a reader of the page.
 * @param row The row.
 * @returns The data attributes of the row.
 */
function recordData(row: RecordRow): Record<string, string> {
	if (row.id === CURRENT) return { "data-reading-id": CURRENT };
	return { "data-state-id": row.id, "data-standing": proposalStanding(row.standing) };
}

/**
 * One proposal or state, as an event on the timeline: a node on the rail, where it stands, its
 * name and its date, then why it came to stand there, or what it does.
 * @param props The row, its words and what it does.
 * @param props.row The row.
 * @param props.words What it says.
 * @param props.actions What it does.
 * @returns The row.
 */
function StateRow(props: {
	readonly row: RecordRow;
	readonly words: Words;
	readonly actions: RecordActions;
}): JSX.Element {
	const { row, words, actions } = props;
	const { onOpen, onToggle, lit } = actions;
	const open = useCallback(() => onOpen(row), [onOpen, row]);
	const fold = useCallback(() => onToggle(row), [onToggle, row]);
	return (
		<Tree.Row
			id={row.id}
			depth={0}
			selected={row.id === lit}
			expanded={row.branch ? row.open : undefined}
			dataset={recordData(row)}
			onOpen={open}
			onToggle={fold}
		>
			<span
				style={WORDS_STYLE}
				title={words.lead}
				data-slot="history-event"
				data-kind={words.kind}
				className="grid min-w-0 flex-1 grid-cols-[12px_minmax(0,1fr)] gap-x-2.5"
			>
				<span aria-hidden="true" className="relative flex justify-center">
					<span data-slot="history-rail" />
					<TimelineNode
						lifecycle={words.kind === "unknown" ? undefined : words.kind}
						floor="bg-tray-sink"
						className="mt-1"
					/>
				</span>
				<span className="flex min-w-0 flex-col gap-0.5 pb-1">
					<EventHead words={words} />
					<EventWords words={words} />
				</span>
			</span>
		</Tree.Row>
	);
}

/**
 * The first line of an event: where the state stands, its name and the date that put it there.
 * @param props The words of the row.
 * @param props.words What it says.
 * @returns The line.
 */
function EventHead({ words }: { readonly words: Words }): JSX.Element {
	return (
		<span className="flex min-w-0 items-baseline gap-2">
			<span
				className={cn(
					"text-body shrink-0 font-semibold",
					words.kind === "current" ? "text-primary-text" : "text-muted-foreground",
				)}
			>
				{KIND_WORD[words.kind]}
			</span>
			<span className="text-control truncate font-semibold">{words.name ?? words.lead}</span>
			{words.when !== undefined && (
				<time
					dateTime={words.when}
					className="text-technical text-muted-foreground ml-auto shrink-0 pl-1 font-mono"
				>
					{historyDay(words.when)}
				</time>
			)}
		</span>
	);
}

/**
 * What an event says under its head: why the state came to stand there, or else what it does, and
 * the facts of the row.
 * @param props The words of the row.
 * @param props.words What it says.
 * @returns The words.
 */
function EventWords({ words }: { readonly words: Words }): JSX.Element {
	const told = words.kind === "draft" ? undefined : words.reason;
	return (
		<>
			{words.name !== undefined && (
				<span
					className={cn(
						"text-body line-clamp-2",
						words.kind === "shelved" ? "text-muted-foreground" : "text-body-foreground",
					)}
				>
					{told ?? words.lead}
				</span>
			)}
			{words.facts !== undefined && (
				<span className="text-technical text-muted-foreground truncate font-mono">
					{words.facts}
				</span>
			)}
		</>
	);
}

/**
 * What was being done when a checkpoint was saved.
 * @param saved What the list says of it.
 * @returns The words, when it says.
 */
function checkpointPurpose(saved: RecordRow["saved"]): string | undefined {
	return saved?.state === null ? "Planning model" : saved?.doing;
}

/**
 * One exact retained reading: when it was saved and what was being done. Its identity stays in the
 * tooltip for somebody who needs it.
 * @param props The row and what it does.
 * @param props.row Its row.
 * @param props.actions What it does.
 * @returns The row.
 */
function CheckpointRow(props: {
	readonly row: RecordRow;
	readonly actions: RecordActions;
}): JSX.Element {
	const { row, actions } = props;
	const { saved } = row;
	const { onOpen } = actions;
	const open = useCallback(() => onOpen(row), [onOpen, row]);
	const dataset = useMemo(() => ({ "data-reading-id": row.id }), [row.id]);
	const purpose = checkpointPurpose(saved);
	const tip = [purpose, row.id].filter(Boolean).join("\n");
	return (
		<Tree.Row
			id={row.id}
			depth={row.parent === null ? 0 : 1}
			selected={row.id === actions.lit}
			dataset={dataset}
			onOpen={open}
		>
			<span style={WORDS_STYLE} title={tip} className="flex min-w-0 flex-1 flex-col">
				<span className="text-technical truncate font-mono">
					{saved === undefined ? "Selected reading" : checkpointTime(saved.createdAt)}
				</span>
				{purpose !== undefined && (
					<span className="text-body text-muted-foreground truncate">{purpose}</span>
				)}
			</span>
			<CheckpointCompare row={row} actions={actions} />
		</Tree.Row>
	);
}

/**
 * What a checkpoint offers beside itself: nothing while it is on screen, because a reading does not
 * compare with itself, and no action while it is the base.
 * @param props The row and what it does.
 * @param props.row Its row.
 * @param props.actions What it does.
 * @returns The offer.
 */
function CheckpointCompare(props: {
	readonly row: RecordRow;
	readonly actions: RecordActions;
}): JSX.Element | null {
	const { id } = props.row;
	const { lit, against, onCompare } = props.actions;
	const compare = useCallback(() => onCompare(id), [onCompare, id]);
	if (id === lit) return null;
	if (id === against) return <Tree.Facts>Compared</Tree.Facts>;
	return (
		<Tree.Action row={id} slot="model-compare" onAction={compare}>
			Compare
		</Tree.Action>
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
				{history.error.message} Reopen History to retry.
			</p>
		);
	if (!history.data.success)
		return (
			<div role="alert" className="text-body max-w-prose space-y-2 p-3">
				<p>{history.data.error}</p>
				{[...new Set(history.data.diagnostics.map((entry) => entry.recovery))].map((recovery) => (
					<p key={recovery}>{recovery}</p>
				))}
				<p>Reopen History after recovery.</p>
			</div>
		);
	if (history.data.checkpoints.length === 0)
		return <p className="text-body text-muted-foreground p-3">No saved readings yet.</p>;
	return null;
}

export { ModelReadingSelector };

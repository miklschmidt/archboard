// The record of a model, as the History dialog draws it after the site's history: the current
// state on a card with a quiet gold ring, then every other state as a node on one rail, with where
// it stands, its name, its date and why it stands there. Each state folds the readings it saved.
// Choosing a state or a saved reading reads it in the pane, and a saved reading offers Compare.

import { RiArrowRightSLine } from "@remixicon/react";
import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { CheckpointRows } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import type { Model } from "@archboard/model/content";
import { Button, cn } from "@archboard/ui-kit/components";
import { sharedNameTouches } from "#ui/architecture-drawing/model-reader/reading/rules/draft-touches.ts";
import {
	checkpointTime,
	historyDay,
} from "#ui/architecture-drawing/model-reader/rules/history-time.ts";
import {
	CURRENT,
	recordSections,
	type ListedState,
	type RecordEntry,
	type RecordKind,
	type RecordRow,
	type RecordWords as Words,
} from "#ui/architecture-drawing/model-reader/reading/rules/record-rows.ts";
import { proposalStanding } from "#ui/architecture-drawing/model-reader/rules/standing.ts";
import { stateCatalogue } from "#ui/architecture-drawing/model-reader/reading/rules/state-catalogue.ts";
import { TimelineNode } from "#ui/variant-lifecycle/components/TimelineNode.tsx";
import { LIFECYCLE_WORD } from "#ui/variant-lifecycle/rules/lifecycle-words.ts";

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

/** What every row of the record does. */
interface RecordActions {
	/** The record on screen. */
	readonly lit: string;
	/** The base of the comparison on show, which its row says. */
	readonly against: string | null;
	readonly onOpen: (row: RecordRow) => void;
	readonly onToggle: (row: RecordRow) => void;
	readonly onCompare: (against: string) => void;
}

/** The word that says where a state stands on the timeline. */
const KIND_WORD: Readonly<Record<RecordKind, string>> = {
	...LIFECYCLE_WORD,
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
 * The record of a model, folded as the reader left it: the current state, and every other state
 * on the rail, what is proposed first, because it is future work, then what came before and what
 * was let go.
 * @param props The selected identity and retained metadata.
 * @param unfolded The states that the reader opened.
 * @returns The current state and the rest.
 */
function recordOf(props: ModelReadingSelectorProps, unfolded: ReadonlySet<string>) {
	const { history, catalogue, checkpoint } = props;
	const checkpoints = history.data?.success === true ? history.data.checkpoints : NO_CHECKPOINTS;
	const touches = catalogue.data === undefined ? NO_TOUCHES : sharedNameTouches(catalogue.data);
	const sections = recordSections({
		...logicalStates(props),
		checkpoints,
		unfolded,
		checkpoint,
		touches,
	});
	const entries = sections.flatMap((section) => section.entries);
	return {
		current: entries.find((entry) => entry.head.id === CURRENT),
		rail: entries.filter((entry) => entry.head.id !== CURRENT),
	};
}

/**
 * The record of a model. Choosing a state or a saved reading carries the picture to it, and a
 * saved reading offers Compare.
 * @param props The selected identity and retained metadata.
 * @returns The record, with its recovery.
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
	const record = recordOf(props, unfolded);
	const lit = checkpoint ?? stateOnShow(props) ?? CURRENT;
	const actions = useMemo(
		() => ({ lit, against, onOpen: open, onToggle: toggle, onCompare }),
		[lit, against, open, toggle, onCompare],
	);
	return (
		<div data-slot="model-history" className="flex flex-col">
			{/* A state folds its checkpoints, so the record waits for them: nothing moves under a
			    pointer when they arrive. */}
			{!history.isPending && <RecordStates {...record} actions={actions} />}
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
 * The states of the record: the current one on its card, and the rest on the rail.
 * @param props The states and what their rows do.
 * @param props.current The current state.
 * @param props.rail The other states.
 * @param props.actions What the rows do.
 * @returns The states.
 */
function RecordStates(props: {
	readonly current: RecordEntry | undefined;
	readonly rail: readonly RecordEntry[];
	readonly actions: RecordActions;
}): JSX.Element {
	const { current, rail, actions } = props;
	return (
		<>
			{current !== undefined && <CurrentCard entry={current} actions={actions} />}
			{rail.length > 0 && (
				<ol data-slot="history-rail" className="mt-4 flex flex-col px-3">
					{rail.map((entry) => (
						<RailEvent key={entry.head.id} entry={entry} actions={actions} />
					))}
				</ol>
			)}
		</>
	);
}

/**
 * The current state, on a card with a quiet gold ring, as the site's history sets it.
 * @param props The current state and what its rows do.
 * @param props.entry The current state and the readings it folds.
 * @param props.actions What the rows do.
 * @returns The card.
 */
function CurrentCard(props: {
	readonly entry: RecordEntry;
	readonly actions: RecordActions;
}): JSX.Element {
	const { entry, actions } = props;
	const { head } = entry;
	return (
		<div
			data-slot="history-current"
			className="bg-face rounded-panel flex flex-col gap-2 p-3 shadow-[var(--elevation-raised),inset_0_0_0_1px_color-mix(in_oklch,var(--primary-mark)_35%,transparent)]"
		>
			<div className="flex min-w-0 items-start gap-3">
				<TimelineNode lifecycle={nodeOf(head)} floor="bg-face" className="mt-1" />
				<StateChoice row={head} actions={actions} />
			</div>
			<StateFolds entry={entry} actions={actions} inset />
		</div>
	);
}

/**
 * One state on the rail: its node, then the state itself, and what it folds.
 * @param props The state and what its rows do.
 * @param props.entry The state and the readings it folds.
 * @param props.actions What the rows do.
 * @returns The event.
 */
function RailEvent(props: {
	readonly entry: RecordEntry;
	readonly actions: RecordActions;
}): JSX.Element {
	const { entry, actions } = props;
	const { head } = entry;
	return (
		<li
			data-slot="history-event"
			data-kind={head.words?.kind}
			className="group/event grid grid-cols-[12px_minmax(0,1fr)] gap-x-3"
		>
			<span
				aria-hidden="true"
				className="before:bg-border relative flex justify-center before:absolute before:inset-y-0 before:w-0.5 group-first/event:before:top-2.5 group-last/event:before:bottom-[calc(100%-10px)]"
			>
				<TimelineNode lifecycle={nodeOf(head)} floor="bg-card" className="mt-1" />
			</span>
			<div className="flex min-w-0 flex-col gap-1.5 pb-5">
				{head.words === null ? (
					<SavedReading row={head} actions={actions} />
				) : (
					<StateChoice row={head} actions={actions} />
				)}
				<StateFolds entry={entry} actions={actions} />
			</div>
		</li>
	);
}

/**
 * The node of a row on the rail.
 * @param row The row.
 * @returns The lifecycle that its node draws, or nothing for one the record cannot name.
 */
function nodeOf(row: RecordRow) {
	const kind = row.words?.kind;
	return kind === undefined || kind === "unknown" ? undefined : kind;
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
 * A state that reads in the pane when it is chosen: where it stands, its name and its date, then
 * why it came to stand there, or what it does. Its facts follow in the mono face.
 * @param props The state and what it does.
 * @param props.row The state's row.
 * @param props.actions What it does.
 * @returns The choice.
 */
function StateChoice(props: {
	readonly row: RecordRow;
	readonly actions: RecordActions;
}): JSX.Element | null {
	const { row, actions } = props;
	const { onOpen, lit } = actions;
	const open = useCallback(() => onOpen(row), [onOpen, row]);
	const { words } = row;
	if (words === null) return null;
	const shown = row.id === lit;
	return (
		<button
			type="button"
			{...recordData(row)}
			aria-current={shown ? "true" : undefined}
			onClick={open}
			className={cn(
				"rounded-control focus-visible:ring-ring -mx-2 -my-1 flex min-w-0 flex-1 flex-col gap-1 px-2 py-1 text-left outline-none focus-visible:ring-2",
				// The current state's card is its face already.
				row.id !== CURRENT && (shown ? "bg-face shadow-raised" : "hover:bg-face/50"),
			)}
		>
			<EventHead words={words} shown={shown} />
			<EventWords words={words} />
		</button>
	);
}

/**
 * The first line of an event: where the state stands, its name and the date that put it there.
 * @param props The words of the row, and whether the pane reads it.
 * @param props.words What it says.
 * @param props.shown Whether it is the reading on screen.
 * @returns The line.
 */
function EventHead(props: { readonly words: Words; readonly shown: boolean }): JSX.Element {
	const { words, shown } = props;
	return (
		<span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
			<span
				className={cn(
					"text-body shrink-0 font-semibold",
					words.kind === "current" ? "text-primary-text" : "text-muted-foreground",
				)}
			>
				{KIND_WORD[words.kind]}
			</span>
			<span className="text-title min-w-0 truncate">{words.name ?? words.lead}</span>
			{shown && <span className="text-body text-primary-text shrink-0 font-medium">On screen</span>}
			{words.when !== undefined && (
				<time
					dateTime={words.when}
					className="text-technical text-muted-foreground ml-auto shrink-0 font-mono"
				>
					{historyDay(words.when)}
				</time>
			)}
		</span>
	);
}

/**
 * What an event says under its head: why the state came to stand there, or else what it does,
 * and what tells it from the drafts that share its name.
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
						"text-control max-w-[72ch] font-normal",
						words.kind === "shelved" ? "text-muted-foreground" : "text-body-foreground",
					)}
				>
					{told ?? words.lead}
				</span>
			)}
			{words.facts !== undefined && (
				<span className="text-technical text-muted-foreground font-mono">{words.facts}</span>
			)}
		</>
	);
}

/**
 * The readings a state saved: the key that folds them, which says how many and when the last one
 * was saved, and the readings while they are open.
 * @param props The state, what its rows do, and whether its readings stand in from the card's node.
 * @param props.entry The state and the readings it folds.
 * @param props.actions What the rows do.
 * @param props.inset Whether the readings line up with the words beside a node.
 * @returns The fold, or nothing for a state that saved none.
 */
function StateFolds(props: {
	readonly entry: RecordEntry;
	readonly actions: RecordActions;
	readonly inset?: boolean;
}): JSX.Element | null {
	const { entry, actions } = props;
	const { head, held } = entry;
	const kept = head.words?.kept;
	if (!head.branch || kept === undefined) return null;
	return (
		<div className={cn("flex flex-col gap-1", props.inset === true && "pl-6")}>
			<FoldKey row={head} kept={kept} onToggle={actions.onToggle} />
			{held.length > 0 && (
				<ol aria-label="Saved readings" className="flex flex-col">
					{held.map((row) => (
						<li key={row.id}>
							<SavedReading row={row} actions={actions} />
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

/**
 * The key that folds the readings of a state: a quiet chip that says how many and when the last
 * one was saved.
 * @param props The state, its words and what the key does.
 * @param props.row The state's row.
 * @param props.kept What it says of the readings.
 * @param props.onToggle Fold or unfold them.
 * @returns The key.
 */
function FoldKey(props: {
	readonly row: RecordRow;
	readonly kept: string;
	readonly onToggle: (row: RecordRow) => void;
}): JSX.Element {
	const { row, onToggle } = props;
	const fold = useCallback(() => onToggle(row), [onToggle, row]);
	return (
		<button
			type="button"
			aria-expanded={row.open}
			onClick={fold}
			className="text-technical text-muted-foreground hover:text-foreground focus-visible:ring-ring bg-tray-sink rounded-chip shadow-well flex h-5.5 items-center gap-1 self-start pr-2 pl-1 font-mono outline-none focus-visible:ring-2"
		>
			<RiArrowRightSLine
				aria-hidden="true"
				className={cn(
					"size-3.5 transition-transform motion-reduce:transition-none",
					row.open && "rotate-90",
				)}
			/>
			{props.kept}
		</button>
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
 * One exact retained reading: when it was saved and what was being done, which reads it in the
 * pane, and Compare at its end. Its identity stays in the tooltip for somebody who needs it.
 * @param props The row and what it does.
 * @param props.row Its row.
 * @param props.actions What it does.
 * @returns The row.
 */
function SavedReading(props: {
	readonly row: RecordRow;
	readonly actions: RecordActions;
}): JSX.Element {
	const { row, actions } = props;
	const { saved } = row;
	const { onOpen, lit } = actions;
	const open = useCallback(() => onOpen(row), [onOpen, row]);
	const purpose = checkpointPurpose(saved);
	const tip = [purpose, row.id].filter(Boolean).join("\n");
	const shown = row.id === lit;
	return (
		<div data-reading-id={row.id} className="flex min-w-0 items-center gap-2">
			<button
				type="button"
				title={tip}
				aria-current={shown ? "true" : undefined}
				onClick={open}
				className={cn(
					"rounded-control focus-visible:ring-ring flex min-h-7 min-w-0 flex-1 items-baseline gap-3 px-2 py-1 text-left outline-none focus-visible:ring-2",
					shown ? "bg-face shadow-raised" : "hover:bg-face/50",
				)}
			>
				<span className="text-technical shrink-0 font-mono">
					{saved === undefined ? "Selected reading" : checkpointTime(saved.createdAt)}
				</span>
				{purpose !== undefined && (
					<span className="text-body text-muted-foreground min-w-0 truncate">{purpose}</span>
				)}
			</button>
			<SavedCompare row={row} actions={actions} />
		</div>
	);
}

/**
 * What a saved reading offers beside itself: that it is on screen, because a reading does not
 * compare with itself, that it is the base, or else Compare.
 * @param props The row and what it does.
 * @param props.row Its row.
 * @param props.actions What it does.
 * @returns The offer.
 */
function SavedCompare(props: {
	readonly row: RecordRow;
	readonly actions: RecordActions;
}): JSX.Element {
	const { id } = props.row;
	const { lit, against, onCompare } = props.actions;
	const compare = useCallback(() => onCompare(id), [onCompare, id]);
	if (id === lit) return <SavedFact accent>On screen</SavedFact>;
	if (id === against) return <SavedFact>Compared</SavedFact>;
	return (
		<Button variant="outline" size="xs" data-slot="model-compare" onClick={compare}>
			Compare
		</Button>
	);
}

/**
 * A word at the end of a saved reading's row, where Compare stands on the others.
 * @param props The word, and whether it is accent text.
 * @param props.accent Whether it says that the reading is on screen.
 * @param props.children The word.
 * @returns The word.
 */
function SavedFact(props: {
	readonly accent?: boolean;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<span
			className={cn(
				"text-body shrink-0 pr-2 font-medium",
				props.accent === true ? "text-primary-text" : "text-muted-foreground",
			)}
		>
			{props.children}
		</span>
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

import { checkpointTime } from "#ui/rules/architecture-model/history-time.ts";
import { stateCatalogue } from "#ui/rules/architecture-model/state-catalogue.ts";
import { useCallback, useMemo, useState, type JSX } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { CheckpointRows } from "#ui/clients/architecture-model/queries.ts";
import type { Model } from "@archboard/board/content";
import { Tree } from "#ui/components/shell/Tree.tsx";
import {
	proposalStanding,
	standingLabel,
	standingSuffix,
} from "#ui/rules/architecture-model/standing.ts";

type Checkpoint = Extract<CheckpointRows, { success: true }>["checkpoints"][number];

interface ModelReadingSelectorProps {
	checkpoint: string | null;
	state: string | null;
	selected: Model["selectedState"] | undefined;
	catalogue: UseQueryResult<Model>;
	onState: (state: string) => void;
	onSelect: (checkpoint: string | null) => void;
	history: UseQueryResult<CheckpointRows>;
}

/** One row of the record of states. */
interface StateRow {
	readonly id: string;
	readonly parent: string | null;
	readonly branch: boolean;
	readonly open: boolean;
	readonly state: Model["selectedState"] | undefined;
	readonly stateId: string | null;
	/** The exact retained reading the row opens. */
	readonly checkpoint: string | null;
	/** What the list says of that reading, which an exact address can outrun. */
	readonly saved: Checkpoint | undefined;
	/** Whether another record has its name, so that only its identity tells them apart. */
	readonly shared?: boolean | undefined;
}

/** The row of the architecture that is current. */
const CURRENT = "current";
/** The group of checkpoints that belong to no state: those of a planning model. */
const NO_STATE = "no-state";

/**
 * Read what the catalogue says of the selected reading, keeping a requested state that it lacks.
 * @param props The selected identity and the catalogue.
 * @returns Proposals and the states, in the catalogue's order.
 */
function logicalStates(props: ModelReadingSelectorProps) {
	const entries = new Map<string, Model["selectedState"] | undefined>(
		stateCatalogue(props.catalogue.data).map((entry) => [entry.id, entry]),
	);
	if (props.state !== null) entries.set(props.state, entries.get(props.state) ?? props.selected);
	const listed = [...entries].map(([id, state]) => ({ id, state }));
	return {
		proposals: listed.filter(({ state }) => state?.lifecycle === "draft"),
		states: listed.filter(({ state }) => state?.lifecycle !== "draft"),
	};
}

/**
 * The checkpoints of each state, newest first.
 * @param history The retained metadata.
 * @returns The checkpoints by state.
 */
function checkpointsByState(
	history: ModelReadingSelectorProps["history"],
): ReadonlyMap<string, readonly Checkpoint[]> {
	const grouped = new Map<string, Checkpoint[]>();
	for (const entry of newestFirst(history)) {
		const key = entry.state?.id ?? NO_STATE;
		grouped.set(key, [...(grouped.get(key) ?? []), entry]);
	}
	return grouped;
}

/**
 * The retained checkpoints, newest first.
 * @param history The retained metadata.
 * @returns The checkpoints, or none while the metadata is unavailable.
 */
function newestFirst(history: ModelReadingSelectorProps["history"]): Checkpoint[] {
	if (history.data?.success !== true) return [];
	return history.data.checkpoints.toSorted(
		(left, right) =>
			right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
	);
}

/**
 * The record of a model: proposals first, because they are future work, then the states with
 * their checkpoints folded. Choosing a record carries the picture to it.
 * @param props The selected identity and retained metadata.
 * @returns The lists, with their recovery.
 */
function ModelReadingSelector(props: ModelReadingSelectorProps): JSX.Element {
	const { proposals, states } = logicalStates(props);
	const { checkpoint, state, onSelect, onState, history } = props;
	const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
	const groups = useMemo(() => checkpointsByState(history), [history]);
	const toggle = useCallback((row: StateRow): void => {
		setUnfolded((current) => {
			const next = new Set(current);
			if (!next.delete(row.id)) next.add(row.id);
			return next;
		});
	}, []);
	const open = useCallback(
		(row: StateRow): void => {
			if (row.checkpoint !== null) onSelect(row.checkpoint);
			else if (row.stateId === null) onSelect(null);
			else onState(row.stateId);
		},
		[onSelect, onState],
	);
	const shared = useMemo(() => sharedNames([...proposals, ...states]), [proposals, states]);
	const rows = useMemo(
		() => stateRows({ states, groups, unfolded, checkpoint, shared }),
		[states, groups, unfolded, checkpoint, shared],
	);
	const proposalRows = useMemo(() => proposalRowsOf(proposals, shared), [proposals, shared]);
	const lit = checkpoint ?? state ?? CURRENT;
	return (
		<div data-slot="model-history" className="flex flex-col">
			<RecordList label="Proposals" rows={proposalRows} lit={lit} onOpen={open} onToggle={toggle} />
			{/* A checkpoint folds under its state, so the rows wait for the checkpoints: none moves
			    under a pointer when they arrive. */}
			{!history.isPending && (
				<RecordList label="States" rows={rows} lit={lit} onOpen={open} onToggle={toggle} />
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
 * The names that more than one record has.
 * @param records The proposals and the states.
 * @returns The names.
 */
function sharedNames(records: readonly { readonly state: StateRow["state"] }[]) {
	const names = records.map(({ state }) => state?.name);
	return new Set(names.filter((name, at) => name !== undefined && names.indexOf(name) !== at));
}

/**
 * The rows of the proposals.
 * @param proposals The proposals.
 * @param shared The names that more than one record has.
 * @returns A row for each.
 */
function proposalRowsOf(
	proposals: readonly { readonly id: string; readonly state: StateRow["state"] }[],
	shared: ReadonlySet<string | undefined>,
): StateRow[] {
	return proposals.map(({ id, state }) => ({
		id,
		parent: null,
		branch: false,
		open: false,
		state,
		stateId: id,
		checkpoint: null,
		saved: undefined,
		shared: shared.has(state?.name),
	}));
}

/**
 * A heading and its records, or nothing when there are none.
 * @param props The rows and what they do.
 * @param props.label The heading.
 * @param props.rows The rows.
 * @param props.lit The record on screen.
 * @param props.onOpen Carry the picture to a record.
 * @param props.onToggle Fold a state's checkpoints.
 * @returns The list.
 */
function RecordList(props: {
	readonly label: string;
	readonly rows: readonly StateRow[];
	readonly lit: string;
	readonly onOpen: (row: StateRow) => void;
	readonly onToggle: (row: StateRow) => void;
}): JSX.Element | null {
	const { label, rows, lit, onOpen, onToggle } = props;
	if (rows.length === 0) return null;
	return (
		<>
			<h3 className="text-body text-muted-foreground px-4 pt-3 pb-1 font-semibold">{label}</h3>
			<Tree label={label} rows={rows} home={lit} onOpen={onOpen} onToggle={onToggle}>
				{rows.map((row) => (
					<RecordRow key={row.id} row={row} lit={lit} onOpen={onOpen} onToggle={onToggle} />
				))}
			</Tree>
		</>
	);
}

/** What the rows of the states are made from. */
interface StateRowInputs {
	readonly states: readonly { id: string; state: Model["selectedState"] | undefined }[];
	readonly groups: ReadonlyMap<string, readonly Checkpoint[]>;
	readonly unfolded: ReadonlySet<string>;
	readonly checkpoint: string | null;
	/** The names that more than one record has. */
	readonly shared: ReadonlySet<string | undefined>;
}

/**
 * The states with their checkpoints, folded unless the reader opened them or stands on one.
 * @param inputs The states, the checkpoints and what is open.
 * @returns The rows, in order.
 */
function stateRows(inputs: StateRowInputs): StateRow[] {
	const { states, groups, unfolded, checkpoint, shared } = inputs;
	/**
	 * One state and its checkpoints.
	 * @param id The row's identity.
	 * @param stateId The state it opens, or null for current.
	 * @param state What the catalogue says of it.
	 * @param held Its checkpoints.
	 * @returns Its rows.
	 */
	const rowsOf = (
		id: string,
		stateId: string | null,
		state: StateRow["state"],
		held: readonly Checkpoint[],
	): StateRow[] => {
		const open = unfolded.has(id) || held.some((entry) => entry.id === checkpoint);
		const twin = shared.has(state?.name);
		const head = { id, parent: null, branch: held.length > 0, open, state, stateId, shared: twin };
		return [
			{ ...head, checkpoint: null, saved: undefined },
			...(open
				? held.map((entry) => ({
						id: entry.id,
						parent: id,
						branch: false,
						open: false,
						state,
						stateId,
						checkpoint: entry.id,
						saved: entry,
					}))
				: []),
		];
	};
	const current = states.find(({ state }) => state?.lifecycle === "current");
	const others = states.filter((entry) => entry !== current);
	// A checkpoint of a state that the catalogue does not list stays reachable under Current.
	const listed = new Set(others.map(({ id }) => id));
	const unlisted = [...groups].filter(([id]) => !listed.has(id)).flatMap(([, held]) => held);
	const rows = [
		...rowsOf(CURRENT, null, current?.state, unlisted),
		...others.flatMap(({ id, state }) => rowsOf(id, id, state, groups.get(id) ?? [])),
	];
	const known = checkpoint === null || rows.some((row) => row.id === checkpoint);
	return known ? rows : [outrunning(checkpoint), ...rows];
}

/**
 * The row of an exact address that the list does not hold, so the reader can see where they are.
 * @param checkpoint The requested checkpoint.
 * @returns Its row.
 */
function outrunning(checkpoint: string): StateRow {
	return {
		id: checkpoint,
		parent: null,
		branch: false,
		open: false,
		state: undefined,
		stateId: null,
		checkpoint,
		saved: undefined,
	};
}

/**
 * What a state's row is called.
 * @param row The row.
 * @returns The name.
 */
function recordName(row: StateRow): string {
	if (row.id === CURRENT) return row.state === undefined ? "No implemented state" : "Current";
	return row.state?.name ?? `Unavailable state · ${row.id}`;
}

/**
 * One proposal, state or checkpoint.
 * @param props The row, the record on screen, and the row's actions.
 * @param props.row The row.
 * @param props.lit The record on screen.
 * @param props.onOpen Carry the picture to it.
 * @param props.onToggle Fold its checkpoints.
 * @returns The row.
 */
function RecordRow(props: {
	readonly row: StateRow;
	readonly lit: string;
	readonly onOpen: (row: StateRow) => void;
	readonly onToggle: (row: StateRow) => void;
}): JSX.Element {
	const { row, lit, onOpen, onToggle } = props;
	const open = useCallback(() => onOpen(row), [onOpen, row]);
	const fold = useCallback(() => onToggle(row), [onToggle, row]);
	if (row.checkpoint !== null) return <CheckpointRow {...props} />;
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
			<Tree.Name text={recordName(row)} title={row.state?.summary} />
			<RecordFacts row={row} />
		</Tree.Row>
	);
}

/**
 * What a row says beside its name: what tells it from a record with the same name, then where
 * it stands. A proposal says that only when something stands in its way.
 * @param props The row.
 * @param props.row The row.
 * @returns The facts, or nothing.
 */
function RecordFacts(props: { readonly row: StateRow }): JSX.Element | null {
	const { id } = props.row;
	const words = id === CURRENT ? null : recordFact(props.row);
	return words === null ? null : <Tree.Facts>{words}</Tree.Facts>;
}

/**
 * The fact a record shows.
 * @param row The row.
 * @returns The words, or null for a proposal with its own name that nothing stands in the way of.
 */
function recordFact(row: StateRow): string | null {
	const facts = [row.shared === true ? row.id : null, stateFact(row.state)];
	return facts.filter((fact) => fact !== null).join(" · ") || null;
}

/**
 * Where a record stands.
 * @param state What the catalogue says of it.
 * @returns The words, or null for a proposal that nothing stands in the way of.
 */
function stateFact(state: StateRow["state"]): string | null {
	if (state?.lifecycle === "draft") return standingLabel(state);
	return (state?.lifecycle ?? "Unavailable") + standingSuffix(state);
}

/**
 * What names a record for a reader of the page.
 * @param row The row.
 * @returns The data attributes of the row.
 */
function recordData(row: StateRow): Record<string, string> {
	if (row.id === CURRENT) return { "data-reading-id": CURRENT };
	return { "data-state-id": row.id, "data-standing": proposalStanding(row.state) };
}

/**
 * One exact retained reading.
 * @param props The row and what it does.
 * @param props.lit The record on screen.
 * @param props.onOpen Carry the picture to it.
 * @param props.row Its row.
 * @returns The row.
 */
function CheckpointRow(props: {
	readonly row: StateRow;
	readonly lit: string;
	readonly onOpen: (row: StateRow) => void;
}): JSX.Element {
	const { row, onOpen } = props;
	const { saved } = row;
	const open = useCallback(() => onOpen(row), [onOpen, row]);
	const dataset = useMemo(() => ({ "data-reading-id": row.id }), [row.id]);
	return (
		<Tree.Row
			id={row.id}
			depth={row.parent === null ? 0 : 1}
			selected={row.id === props.lit}
			dataset={dataset}
			onOpen={open}
		>
			<Tree.Name
				text={saved === undefined ? "Selected reading" : checkpointTime(saved.createdAt)}
				title={saved?.doing ?? row.id}
			/>
			<Tree.Facts>{row.id.slice(0, 8)}</Tree.Facts>
		</Tree.Row>
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

export { ModelReadingSelector, HistoryStatus };

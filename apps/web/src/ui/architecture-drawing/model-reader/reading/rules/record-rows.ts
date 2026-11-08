// The record of a model, as the History dialog lists it: what is proposed, what is current, what came
// before and what was let go. Each state folds its own checkpoints into its row. A checkpoint of a
// state that the catalogue does not list keeps a row of its own, so it never reads as another
// state's. Pure.

import type { Model } from "@archboard/model/content";
import type { CheckpointRows } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import { checkpointTime } from "#ui/architecture-drawing/model-reader/rules/history-time.ts";
import { standingLabel } from "#ui/architecture-drawing/model-reader/rules/standing.ts";

type Checkpoint = Extract<CheckpointRows, { success: true }>["checkpoints"][number];
type State = Model["selectedState"] | undefined;

/** The row of the architecture that is current. */
const CURRENT = "current";
/** The group of checkpoints that belong to no state: those of a planning model. */
const NO_STATE = "no-state";

/** One row of the record: a state, or a reading it saved. */
interface RecordRow {
	readonly id: string;
	/** Whether it folds saved readings. */
	readonly branch: boolean;
	readonly open: boolean;
	/** The state the row opens, or null for one that opens current or a checkpoint. */
	readonly stateId: string | null;
	/** The exact retained reading the row opens. */
	readonly checkpoint: string | null;
	/** The words of a row that stands for a state, or null for a checkpoint. */
	readonly words: RecordWords | null;
	/** What the list says of the checkpoint, which an exact address can outrun. */
	readonly saved: Checkpoint | undefined;
	/** Whether the catalogue reports where the state stands. */
	readonly standing: State;
}

/** What a row says of its state: what it does first, then what it is called. */
interface RecordWords {
	readonly lead: string;
	readonly name: string | undefined;
	/** What tells it from the drafts that share its name, and anything that stands in its way. */
	readonly facts: string | undefined;
	/** How many readings it saved, and when the latest was saved, or nothing for none. */
	readonly kept: string | undefined;
	/** Where the state stands on the timeline, in a word. */
	readonly kind: RecordKind;
	/** When it came to stand there, as an ISO timestamp, when the record says. */
	readonly when: string | undefined;
	/**
	 * What the row says under its head: why the state came to stand where it does, as the record
	 * says it, or else what it does when the head names it.
	 */
	readonly told: string | undefined;
}

/** Where a state stands on the timeline of the History dialog: its lifecycle, or unknown. */
type RecordKind = NonNullable<State>["lifecycle"] | "unknown";

/** A state and what it folds. */
interface RecordEntry {
	readonly head: RecordRow;
	readonly held: readonly RecordRow[];
}

/** The records under one heading. */
interface RecordSection {
	readonly label: string;
	readonly entries: readonly RecordEntry[];
}

/** One state of the catalogue, or a requested state that it lacks. */
interface ListedState {
	readonly id: string;
	readonly state: State;
}

/** What the rows are made from. */
interface RecordInputs {
	readonly proposals: readonly ListedState[];
	readonly states: readonly ListedState[];
	readonly checkpoints: readonly Checkpoint[];
	readonly unfolded: ReadonlySet<string>;
	/** The checkpoint on screen. */
	readonly checkpoint: string | null;
	/** What tells a draft from the drafts that share its name. */
	readonly touches: ReadonlyMap<string, string>;
}

/** What one row needs to know beside its state. */
interface EntryPlace {
	readonly id: string;
	readonly stateId: string | null;
	readonly state: State | Checkpoint["state"];
	readonly held: readonly Checkpoint[];
	/** What the row opens when it opens no state. */
	readonly opens?: string | undefined;
}

/**
 * The checkpoints of each state, newest first.
 * @param checkpoints The retained rows.
 * @returns The checkpoints by state.
 */
function checkpointsByState(
	checkpoints: readonly Checkpoint[],
): ReadonlyMap<string, readonly Checkpoint[]> {
	const newest = checkpoints.toSorted(
		(left, right) =>
			right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
	);
	const grouped = new Map<string, Checkpoint[]>();
	for (const entry of newest) {
		const key = entry.state?.id ?? NO_STATE;
		grouped.set(key, [...(grouped.get(key) ?? []), entry]);
	}
	return grouped;
}

/**
 * What a row says about what it folds.
 * @param held The checkpoints, newest first.
 * @returns The count and the latest time, or nothing for a state with none.
 */
function savedFact(held: readonly Checkpoint[]): string | undefined {
	const latest = held[0];
	return latest === undefined
		? undefined
		: `${held.length} saved · ${checkpointTime(latest.createdAt)}`;
}

/**
 * The first words of a row.
 * @param place The state of the row.
 * @returns What it says first, and its name under that.
 */
function leadOf(place: EntryPlace): Pick<RecordWords, "lead" | "name"> {
	const { state, id } = place;
	if (state == null)
		return { lead: id === CURRENT ? "No implemented state" : "Unavailable state", name: undefined };
	const { summary, name } = state;
	return summary === undefined ? { lead: name, name: undefined } : { lead: summary, name };
}

/**
 * What a row says under its head. A draft has stood nowhere yet, so it has no reason to give.
 * @param state What the catalogue reports of the state.
 * @param lead What the row says first, and the name under that.
 * @returns Why the state stands where it does, or what it does when the head names it, or nothing.
 */
function toldOf(state: State, lead: Pick<RecordWords, "lead" | "name">): string | undefined {
	const reason = state?.lifecycle === "draft" ? undefined : state?.reason;
	return reason ?? (lead.name === undefined ? undefined : lead.lead);
}

/** The field that dates when a state came to stand where it does, for each lifecycle. */
const WHEN = {
	draft: "createdAt",
	current: "adoptedAt",
	historical: "adoptedAt",
	shelved: "shelvedAt",
} as const satisfies Record<NonNullable<State>["lifecycle"], keyof NonNullable<State>>;

/**
 * Where a state stands on the timeline, and the date that put it there. A state whose record lacks
 * that date is dated by when it was made.
 * @param state What the catalogue reports of the state.
 * @returns Its kind and its date.
 */
function timelineOf(state: State): Pick<RecordWords, "kind" | "when"> {
	if (state == null) return { kind: "unknown", when: undefined };
	return { kind: state.lifecycle, when: state[WHEN[state.lifecycle]] ?? state.createdAt };
}

/**
 * The state of a row, when the catalogue reports where it stands. A checkpoint says less.
 * @param state What the row knows of its state.
 * @returns The state, or undefined.
 */
function reported(state: EntryPlace["state"]): State {
	return state != null && "lifecycle" in state ? state : undefined;
}

/**
 * The rows of one state.
 * @param place The state and what it folds.
 * @param inputs What the reader opened, and what tells drafts apart.
 * @returns The row and what it holds.
 */
function entryOf(place: EntryPlace, inputs: RecordInputs): RecordEntry {
	const { id, stateId, state, held, opens } = place;
	const open = inputs.unfolded.has(id) || held.some((entry) => entry.id === inputs.checkpoint);
	const standing = reported(state);
	const facts = [inputs.touches.get(id), standingLabel(standing)].filter(Boolean);
	const lead = leadOf(place);
	const head: RecordRow = {
		id,
		branch: held.length > 0,
		open,
		stateId,
		checkpoint: opens ?? null,
		words: {
			...lead,
			...timelineOf(standing),
			told: toldOf(standing, lead),
			facts: facts.length === 0 ? undefined : facts.join(" · "),
			kept: savedFact(held),
		},
		saved: undefined,
		standing,
	};
	return {
		head,
		held: open ? held.map((entry) => checkpointRow(entry.id, entry, stateId)) : [],
	};
}

/**
 * One exact retained reading.
 * @param id The checkpoint.
 * @param saved What the list says of it, which an exact address can outrun.
 * @param stateId The state of the row that folds it.
 * @returns Its row.
 */
function checkpointRow(
	id: string,
	saved: Checkpoint | undefined,
	stateId: string | null,
): RecordRow {
	return {
		id,
		branch: false,
		open: false,
		stateId,
		checkpoint: id,
		words: null,
		saved,
		standing: undefined,
	};
}

/**
 * The rows of the states that the catalogue does not list, each with what it folds.
 * @param groups The checkpoints by state.
 * @param listed The identities the catalogue lists.
 * @returns Their places, newest first.
 */
function retainedPlaces(
	groups: ReadonlyMap<string, readonly Checkpoint[]>,
	listed: ReadonlySet<string>,
): EntryPlace[] {
	return [...groups]
		.filter(([id]) => id !== NO_STATE && !listed.has(id))
		.map(([id, held]) => ({
			id,
			stateId: null,
			state: held[0]!.state,
			held,
			opens: held[0]!.id,
		}));
}

/**
 * The places of states that the catalogue lists.
 * @param listed The states.
 * @param groups The checkpoints by state.
 * @returns Their places.
 */
function placesOf(
	listed: readonly ListedState[],
	groups: ReadonlyMap<string, readonly Checkpoint[]>,
): EntryPlace[] {
	return listed.map(({ id, state }) => ({ id, stateId: id, state, held: groups.get(id) ?? [] }));
}

/**
 * The record of a model, under its headings.
 * @param inputs The states, the checkpoints and what is open.
 * @returns The sections that hold something, in order.
 */
function recordSections(inputs: RecordInputs): readonly RecordSection[] {
	const { proposals, states, checkpoint } = inputs;
	const groups = checkpointsByState(inputs.checkpoints);
	const current = states.find(({ state }) => state?.lifecycle === "current");
	const lapsed = states.filter(({ state }) => state?.lifecycle === "shelved");
	const earlier = states.filter((entry) => entry !== current && !lapsed.includes(entry));
	const listed = new Set([...proposals, ...states].map(({ id }) => id));
	const sections = [
		{ label: "Proposals", places: placesOf(proposals, groups) },
		{ label: "Current", places: [currentPlace(current, groups)] },
		{ label: "Earlier", places: [...placesOf(earlier, groups), ...retainedPlaces(groups, listed)] },
		{ label: "Shelved", places: placesOf(lapsed, groups) },
	].map(({ label, places }) => ({ label, entries: places.map((p) => entryOf(p, inputs)) }));
	const known = sections.some(({ entries }) => entries.some((entry) => holds(entry, checkpoint)));
	const shown = checkpoint === null || known ? sections : outrun(sections, checkpoint);
	return shown.filter(({ entries }) => entries.length > 0);
}

/**
 * The row of the current state, which also folds the checkpoints of a planning model.
 * @param current The current state, when the model has one.
 * @param groups The checkpoints by state.
 * @returns Its place.
 */
function currentPlace(
	current: ListedState | undefined,
	groups: ReadonlyMap<string, readonly Checkpoint[]>,
): EntryPlace {
	const held = [...(groups.get(current?.id ?? "") ?? []), ...(groups.get(NO_STATE) ?? [])];
	return { id: CURRENT, stateId: null, state: current?.state, held };
}

/**
 * Whether an entry holds a checkpoint.
 * @param entry The entry.
 * @param checkpoint The checkpoint, or null.
 * @returns True when one of its rows is that checkpoint.
 */
function holds(entry: RecordEntry, checkpoint: string | null): boolean {
	return [entry.head, ...entry.held].some((row) => row.id === checkpoint);
}

/**
 * Put the row of an exact address that the list does not hold at the head of the earlier records.
 * @param sections The sections.
 * @param checkpoint The requested checkpoint.
 * @returns The sections with that row.
 */
function outrun(sections: readonly RecordSection[], checkpoint: string): RecordSection[] {
	const head = checkpointRow(checkpoint, undefined, null);
	return sections.map((section) =>
		section.label === "Earlier"
			? { ...section, entries: [{ head, held: [] }, ...section.entries] }
			: section,
	);
}

export {
	CURRENT,
	recordSections,
	type Checkpoint,
	type ListedState,
	type RecordEntry,
	type RecordKind,
	type RecordRow,
	type RecordWords,
};

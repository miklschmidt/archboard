// A model's states as one timeline, from the record of each state and nothing else. The adopted
// line runs from the current state back through its history, newest first. A draft branches off
// the state it came from, and a draft off a draft branches again, so competing proposals read as
// parallel branches. A shelved state ends its branch. A model with no current state has no adopted
// line, and its first drafts stand on the line in its place. Pure.

import type { Model } from "@archboard/board/content";
import { standingSuffix } from "#ui/rules/architecture-model/standing.ts";

type State = NonNullable<Model["states"]>[number];

/** One state's row on the timeline. */
interface TimelineEntry {
	readonly state: State;
	/** 0 on the adopted line, one more for each branch it sits on. */
	readonly depth: number;
	/** The state it came from, by name, when the model holds that state. */
	readonly from: string | undefined;
}

/** What the timeline holds. */
interface StateTimeline {
	readonly entries: readonly TimelineEntry[];
	/** Whether the model has a current state. Without one, nothing it describes is built. */
	readonly built: boolean;
}

/**
 * Whether a state is on the adopted line: the current one or its history.
 * @param state The state.
 * @returns Whether it is.
 */
function adoptedLine(state: State): boolean {
	return state.lifecycle === "current" || state.lifecycle === "historical";
}

/**
 * When a state became current, as a sortable time. The first state sorts as the earliest.
 * @param state The state.
 * @returns The time.
 */
function adoptedAt(state: State): number {
	return state.adoptedAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(state.adoptedAt);
}

/**
 * The states that stand on the line.
 * @param states Every state.
 * @param byId Every state, by identity.
 * @param built Whether the model has a current state.
 * @returns The line, newest first.
 */
function lineOf(
	states: readonly State[],
	byId: ReadonlyMap<string, State>,
	built: boolean,
): readonly State[] {
	if (built)
		return states.filter(adoptedLine).toSorted((left, right) => adoptedAt(right) - adoptedAt(left));
	return states.filter(
		({ predecessor }) => predecessor === undefined || !byId.has(predecessor ?? ""),
	);
}

/**
 * The states that branch off a state.
 * @param states Every state.
 * @param state The state.
 * @param onLine The identities on the line, which stay there.
 * @returns Its branches.
 */
function branchesOf(
	states: readonly State[],
	state: State,
	onLine: ReadonlySet<string>,
): readonly State[] {
	return states.filter((branch) => branch.predecessor === state.id && !onLine.has(branch.id));
}

/**
 * The model's states in timeline order, each with its depth.
 * @param states Every state of the model.
 * @returns The timeline.
 */
function stateTimeline(states: readonly State[]): StateTimeline {
	const byId = new Map(states.map((state) => [state.id, state]));
	const built = states.some((state) => state.lifecycle === "current");
	const line = lineOf(states, byId, built);
	const onLine = new Set(line.map((state) => state.id));
	const entries: TimelineEntry[] = [];
	const placed = new Set<string>();
	/**
	 * Put a state on the timeline, and its branches after it, one deeper.
	 * @param state The state.
	 * @param depth Its depth.
	 */
	const place = (state: State, depth: number): void => {
		if (placed.has(state.id)) return;
		placed.add(state.id);
		entries.push({ state, depth, from: byId.get(state.predecessor ?? "")?.name });
		for (const branch of branchesOf(states, state, onLine)) place(branch, depth + 1);
	};
	for (const state of line) place(state, 0);
	// A state the record joins to nothing above still has its place, at the end.
	for (const state of states) place(state, 0);
	return { entries, built };
}

/**
 * Where a state stands, in the words its row says beside its name: its lifecycle, when the record
 * says it got there, what it came from, and anything that stands in its way.
 * @param entry The state on the timeline.
 * @returns The words.
 */
function standingWords(entry: TimelineEntry): string {
	const { state, from } = entry;
	const word = `${state.lifecycle.charAt(0).toUpperCase()}${state.lifecycle.slice(1)}`;
	return `${word}${standingFact(state, from)}${standingSuffix(state)}`;
}

/**
 * The fact of the record that follows the lifecycle.
 * @param state The state.
 * @param from The name of the state it came from.
 * @returns The words, with what joins them to the lifecycle.
 */
function standingFact(state: State, from: string | undefined): string {
	if (state.shelvedAt !== undefined) return ` ${state.shelvedAt.slice(0, 10)}`;
	if (state.adoptedAt !== undefined) return ` · adopted ${state.adoptedAt.slice(0, 10)}`;
	return state.lifecycle === "draft" && from !== undefined ? ` · from ${from}` : "";
}

export { standingWords, stateTimeline, type StateTimeline, type TimelineEntry };

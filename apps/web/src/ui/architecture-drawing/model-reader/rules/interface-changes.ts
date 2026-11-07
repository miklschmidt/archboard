// What a proposal changes about interfaces, as the head of its change list (ADR 0044). An interface
// change costs every caller and a change inside a module costs one module, so a reader meets these
// first. The comparison of the reading says what moved. Nothing here compares anything, combines
// the counts or ranks a module, and a row wears no standing, because an interface change sets none.

import type { Model } from "@archboard/model/content";

type Comparison = NonNullable<Model["comparison"]>;
type InterfaceChange = Comparison["interfaceChanges"]["changed"][number];
type Measured = Comparison["interfaceMeasures"]["containers"][number];
type Measures = Extract<Measured["byState"][number], { readonly holdsParts: true }>["measures"];

/** One thing that moved about a module's interface, with the parts it names. */
interface InterfaceFact {
	readonly key: string;
	readonly label: string;
	readonly names: readonly string[];
}

/** One count that differs between the base and the state. */
interface InterfaceMeasure {
	readonly key: keyof Measures;
	readonly label: string;
	readonly before: number;
	readonly after: number;
}

/** A module whose interface changed. */
interface InterfaceRow {
	readonly id: string;
	readonly name: string;
	/** The module whose picture draws it, or null for the roots. */
	readonly scope: string | null;
	readonly facts: readonly InterfaceFact[];
	readonly measures: readonly InterfaceMeasure[];
}

/** What can move, in the order a reader asks: who pays first, then what they reach. */
const MOVES = [
	["callersGained", "Callers gained"],
	["callersLost", "Callers lost"],
	["entryPointsAdded", "Entry points added"],
	["entryPointsRemoved", "Entry points removed"],
	["becameEntryPoints", "Now entry points"],
	["becameHidden", "Now hidden"],
] as const;

/** The counts in the order of `model compare`, in the words of the facts beside them. */
const COUNTS = [
	["entryPoints", "entry points"],
	["hiddenParts", "hidden"],
	["callers", "callers"],
	["outgoing", "outgoing"],
	["passThrough", "pass-through"],
] as const;

/**
 * What a change says of the module itself. A module the state lacks says that first, because a
 * reader of its row would otherwise look for it among the modules of the state.
 * @param change The change.
 * @param held Whether the state on show holds the module.
 * @returns The fact, or nothing for a module that held parts on both sides.
 */
function moduleFacts(change: InterfaceChange, held: boolean): InterfaceFact[] {
	if (!held) return [{ key: "notInState", label: "Not in this state", names: [] }];
	const { before, after } = change.holdsParts;
	if (before === after) return [];
	return after
		? [{ key: "nowHoldsParts", label: "Now holds parts", names: [] }]
		: [{ key: "noLongerHoldsParts", label: "No longer holds parts", names: [] }];
}

/**
 * What moved, leaving out what did not.
 * @param change The change.
 * @returns The facts.
 */
function movedFacts(change: InterfaceChange): InterfaceFact[] {
	return MOVES.filter(([key]) => change[key].length > 0).map(([key, label]) => ({
		key,
		label,
		names: change[key].map((part) => part.name),
	}));
}

/**
 * A module's counts in one state.
 * @param on What the state says of it.
 * @returns The counts, or nothing where it holds no parts, which is not a count of zero (ADR 0044).
 */
function countsOn(on: Measured["byState"][number] | undefined): Measures | undefined {
	return on?.holdsParts === true ? on.measures : undefined;
}

/**
 * The counts that differ. A module with parts on one side has nothing to set beside its counts, so
 * its facts say what it became.
 * @param measured The module's counts, the selected state first and then its base.
 * @returns The counts that differ.
 */
function movedCounts(measured: Measured | undefined): InterfaceMeasure[] {
	const after = countsOn(measured?.byState[0]);
	const before = countsOn(measured?.byState[1]);
	if (after === undefined || before === undefined) return [];
	return COUNTS.filter(([key]) => before[key] !== after[key]).map(([key, label]) => ({
		key,
		label,
		before: before[key],
		after: after[key],
	}));
}

/**
 * Each module whose interface changed, once, in the order of the comparison.
 * @param model The reading.
 * @param parents The parent of each module in the drawing of the comparison, which keeps what the
 * state removed, so a removed module has a place on a picture.
 * @returns The rows.
 */
function interfaceRows(
	model: Model,
	parents: ReadonlyMap<string, string | undefined>,
): readonly InterfaceRow[] {
	const { comparison, modules } = model;
	if (comparison === undefined) return [];
	const held = new Set(modules.map(({ id }) => id));
	const measured = new Map(
		comparison.interfaceMeasures.containers.map((one) => [one.container.id, one]),
	);
	return comparison.interfaceChanges.changed.map((change) => {
		const { id, name } = change.container;
		return {
			id,
			name,
			scope: parents.get(id) ?? null,
			facts: [...moduleFacts(change, held.has(id)), ...movedFacts(change)],
			measures: movedCounts(measured.get(id)),
		};
	});
}

/**
 * A row as one sentence for a reader who does not see it, which keeps every name that the row cuts.
 * @param row The row.
 * @returns The words.
 */
function interfaceRowWords(row: InterfaceRow): string {
	const facts = row.facts.map(({ label, names }) => [label, ...names].join(" "));
	const counts = row.measures.map(
		({ label, before, after }) => `${label} ${before} before, ${after} after`,
	);
	return [row.name, ...facts, ...counts].join(". ");
}

/** One state's side of a module's interface, as the card that sets it beside the other. */
interface InterfaceSide {
	/** The state, or null for a reading of a model without states. */
	readonly state: Comparison["interfaceMeasures"]["states"][number]["state"];
	/** Whether this is the state read, rather than the one it is compared with. */
	readonly read: boolean;
	/** Its counts, or nothing where the module holds no parts in it. */
	readonly measures: Measures | undefined;
	/** Its entry points, by name. */
	readonly entries: readonly string[];
	/** The parts that are hidden here and entry points on the other side. */
	readonly hidden: readonly string[];
	/** The callers that only this side has. */
	readonly callers: readonly string[];
}

/**
 * A changed module's interface in the state read and in the state it is compared with, the base
 * first, as the site's comparison sets them side by side. The entry points are each state's own;
 * the hidden parts and the callers are those the two states differ by, because the comparison
 * names only those.
 * @param comparison The comparison of the reading.
 * @param id The module.
 * @returns The base's side and the side read, or null when the module's interface did not change.
 */
function interfaceSides(
	comparison: Comparison,
	id: string,
): readonly [InterfaceSide, InterfaceSide] | null {
	const change = comparison.interfaceChanges.changed.find((one) => one.container.id === id);
	const measured = comparison.interfaceMeasures.containers.find((one) => one.container.id === id);
	if (change === undefined || measured === undefined) return null;
	return [sideOf(comparison, measured, change, 1), sideOf(comparison, measured, change, 0)];
}

/**
 * The names of some parts.
 * @param parts The parts.
 * @returns Their names.
 */
function namesOf(parts: readonly { readonly name: string }[]): string[] {
	return parts.map((part) => part.name);
}

/** What each side names of what moved: the state read its gains, the base what it gave up. */
const SIDE_MOVES = {
	read: { hidden: "becameHidden", callers: "callersGained" },
	base: { hidden: "becameEntryPoints", callers: "callersLost" },
} as const;

/**
 * The entry points of a module in one state, by name.
 * @param on What the state says of the module.
 * @returns Their names, or none where the module holds no parts.
 */
function entriesOn(on: Measured["byState"][number] | undefined): string[] {
	return on?.holdsParts === true ? namesOf(on.entryPoints) : [];
}

/**
 * One state's side of a changed module's interface.
 * @param comparison The comparison of the reading.
 * @param measured The module's counts in each state.
 * @param change What moved about its interface.
 * @param at The state: 0 for the one read, 1 for the one it is compared with.
 * @returns The side.
 */
function sideOf(
	comparison: Comparison,
	measured: Measured,
	change: InterfaceChange,
	at: 0 | 1,
): InterfaceSide {
	const on = measured.byState[at];
	const read = at === 0;
	const moved = SIDE_MOVES[read ? "read" : "base"];
	return {
		state: comparison.interfaceMeasures.states[at]?.state ?? null,
		read,
		measures: countsOn(on),
		entries: entriesOn(on),
		hidden: namesOf(change[moved.hidden]),
		callers: namesOf(change[moved.callers]),
	};
}

export {
	interfaceRows,
	interfaceRowWords,
	interfaceSides,
	type InterfaceFact,
	type InterfaceRow,
	type InterfaceSide,
};

// What a proposal changes about interfaces, as the head of its change list (ADR 0044). An interface
// change costs every caller and a change inside a module costs one module, so a reader meets these
// first. The comparison of the reading says what moved. Nothing here compares anything, combines
// the counts or ranks a module, and a row wears no standing, because an interface change sets none.

import type { Model } from "@archboard/board/content";

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

export { interfaceRows, interfaceRowWords, type InterfaceFact, type InterfaceRow };

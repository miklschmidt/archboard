import type { LocalityAnswer } from "@archboard/code-intel/history";
import type { Model, projectModel } from "@archboard/board/content";
import {
	interfaceCounts,
	type InterfaceCount,
	type InterfaceKey,
} from "#ui/rules/architecture-model/interface-counts.ts";
import { moduleInterface } from "#ui/rules/architecture-model/selected-subject.ts";

type Projection = ReturnType<typeof projectModel>;
type Locality = Pick<LocalityAnswer, "hotspots" | "coupling" | "skipped">;
type SkipReason = LocalityAnswer["skipped"][number]["reason"];

/** What decides whether a reading has code history to read. */
interface HistoryReading {
	readonly modules: readonly Pick<Model["modules"][number], "binding">[];
	readonly migrationPreview?: unknown;
}

/** Where a reading stands with code history: whether it can read any. */
type HistorySource = "bound" | "unbound" | "original";

/** How the code history of a reading stands, each with one thing to say. */
type HistoryState = Exclude<HistorySource, "bound"> | "reading" | "read" | "failed";

/** What a reader can sort the modules of a model by. */
type MeasureKey = "commits" | "unjoined" | InterfaceKey;

/** What the code history says of one module. */
type ModuleHistory =
	| { readonly kind: "read"; readonly commits: number; readonly unjoined: number }
	| { readonly kind: "skipped"; readonly reason: SkipReason };

/** One module of the list, with what it has to show. */
interface MeasureRow {
	readonly id: string;
	readonly name: string;
	/** Its kind, which colours its bar. */
	readonly kind: string;
	/** Its name and code path, because two modules can share a name. */
	readonly title: string;
	/** What its interface counts, or nothing for a module with no parts: it has no interface. */
	readonly counts: readonly InterfaceCount[] | null;
	/** What its history says, or nothing while no answer holds it. */
	readonly history?: ModuleHistory | undefined;
}

/** One measure: what the column and the sort control call it, and what it counts and shows. */
interface Measure {
	readonly key: MeasureKey;
	readonly label: string;
	readonly description: string;
}

/** Every measure, in the order of the columns and of the sort control. */
const MEASURES: readonly Measure[] = [
	{
		key: "commits",
		label: "Commits",
		description: "Commits that changed its code. Shows code that keeps changing.",
	},
	{
		key: "unjoined",
		label: "Unjoined",
		description: "Modules it changes with but is not joined to. Shows hidden links.",
	},
	{
		key: "entryPoints",
		label: "Entries",
		description: "Parts that callers outside reach. Shows how wide the interface is.",
	},
	{
		key: "hiddenParts",
		label: "Hidden",
		description: "Parts that nothing outside reaches. Shows what it keeps to itself.",
	},
	{
		key: "callers",
		label: "Callers",
		description: "Parts outside that reach in. Shows how far a change can spread.",
	},
	{
		key: "wholeModule",
		label: "To module",
		description: "Callers that name the module, not a part. Shows calls no part answers.",
	},
	{
		key: "passThrough",
		label: "Pass-through",
		description: "Entries that pass one call on. Shows parts to question.",
	},
];

/** What a model with no code history to read sorts by. */
const NO_HISTORY_MEASURE: MeasureKey = "entryPoints";

/**
 * Whether a reading can read code history. An original under migration has no checkout to read
 * against, and a model that binds no code gives Git nothing to read.
 * @param model The reading.
 * @returns Where it stands.
 */
function historySource(model: HistoryReading): HistorySource {
	if (model.migrationPreview !== undefined) return "original";
	return model.modules.some((module) => module.binding !== undefined) ? "bound" : "unbound";
}

/**
 * How the code history of a reading stands.
 * @param source Whether it can read any.
 * @param read The read.
 * @param read.data The answer so far.
 * @param read.error Why the last read failed.
 * @returns The state.
 */
function historyState(
	source: HistorySource,
	read: { readonly data: unknown; readonly error: unknown },
): HistoryState {
	if (source !== "bound") return source;
	if (read.error !== null) return "failed";
	return read.data === undefined ? "reading" : "read";
}

/**
 * Whether a measure is read from code history, so it waits for the answer.
 * @param key The measure.
 * @returns True for a measure of the history.
 */
function isHistoryMeasure(key: MeasureKey): key is "commits" | "unjoined" {
	return key === "commits" || key === "unjoined";
}

/**
 * The interface of every module of a reading, read from the whole model and before any filter
 * narrows it (ADR 0044). It needs no server.
 * @param projection The reading.
 * @returns One row for each module, with no history yet.
 */
function interfaceRows(projection: Pick<Projection, "complete">): readonly MeasureRow[] {
	const { nodes } = projection.complete;
	return nodes.map(({ id, name, kind, binding }) => {
		const inspection = moduleInterface(projection, id);
		return {
			id,
			name,
			kind,
			title: binding === undefined ? name : `${name}\n${binding.path}`,
			counts: inspection?.holdsParts === true ? interfaceCounts(inspection, nodes) : null,
		};
	});
}

/**
 * What one answer says of every module. A skipped module is in no count, so it never looks like a
 * module that no commit changed (ADR 0045).
 * @param answer The answer.
 * @returns Each module the answer names.
 */
function historyByModule(answer: Locality): ReadonlyMap<string, ModuleHistory> {
	const unjoined = new Map<string, number>();
	for (const { subjects } of answer.coupling.filter((pair) => pair.unjoined)) {
		for (const { id } of subjects) unjoined.set(id, (unjoined.get(id) ?? 0) + 1);
	}
	return new Map<string, ModuleHistory>([
		...answer.hotspots.map(({ subject, count }): [string, ModuleHistory] => [
			subject.id,
			{ kind: "read", commits: count, unjoined: unjoined.get(subject.id) ?? 0 },
		]),
		...answer.skipped.map(({ subject, reason }): [string, ModuleHistory] => [
			subject.id,
			{ kind: "skipped", reason },
		]),
	]);
}

/**
 * The modules with what an answer says of each.
 * @param rows The modules.
 * @param answer The answer, or nothing while none holds.
 * @returns The modules.
 */
function withHistory(
	rows: readonly MeasureRow[],
	answer: Locality | undefined,
): readonly MeasureRow[] {
	if (answer === undefined) return rows;
	const history = historyByModule(answer);
	return rows.map((row) => ({ ...row, history: history.get(row.id) }));
}

/**
 * One count of a module's interface. The interface line leaves out `to module` while it is none,
 * and a module with parts still has that count.
 * @param row The module.
 * @param key The count.
 * @returns The count, or nothing for a module with no parts.
 */
function interfaceMeasure(row: MeasureRow, key: InterfaceKey): number | undefined {
	if (row.counts === null) return undefined;
	return row.counts.find((one) => one.key === key)?.count ?? 0;
}

/**
 * One measure of one module.
 * @param row The module.
 * @param key The measure.
 * @returns The count, or nothing where the module has no such measure.
 */
function measureOf(row: MeasureRow, key: MeasureKey): number | undefined {
	if (!isHistoryMeasure(key)) return interfaceMeasure(row, key);
	return row.history?.kind === "read" ? row.history[key] : undefined;
}

/**
 * The name and then the identity, so that two modules of one name keep one order.
 * @param one A module.
 * @param other Another module.
 * @returns Their order.
 */
function byName(one: MeasureRow, other: MeasureRow): number {
	return one.name.localeCompare(other.name, "en") || one.id.localeCompare(other.id, "en");
}

/**
 * The modules with the most of a measure first, and those with none of it last, because no count
 * is not a count of none. Each order is one order: a tie goes by name.
 * @param rows The modules.
 * @param key The measure.
 * @returns The modules in order.
 */
function sortedRows(rows: readonly MeasureRow[], key: MeasureKey): readonly MeasureRow[] {
	return rows.toSorted((one, other) => {
		const [left, right] = [measureOf(one, key) ?? -1, measureOf(other, key) ?? -1];
		return right - left || byName(one, other);
	});
}

/**
 * The most of a measure that any module has, which the bar of a row is drawn against.
 * @param rows The modules.
 * @param key The measure.
 * @returns The largest count, or none for a list with no such count.
 */
function mostOf(rows: readonly MeasureRow[], key: MeasureKey): number {
	return rows.reduce((most, row) => Math.max(most, measureOf(row, key) ?? 0), 0);
}

export {
	MEASURES,
	NO_HISTORY_MEASURE,
	historySource,
	historyState,
	interfaceRows,
	isHistoryMeasure,
	measureOf,
	mostOf,
	sortedRows,
	withHistory,
	type HistoryReading,
	type HistoryState,
	type Measure,
	type MeasureKey,
	type MeasureRow,
	type ModuleHistory,
};

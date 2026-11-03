// How the list across the whole model joins the interface of each module with its code history,
// and the one order of each measure.

import { expect, test } from "bun:test";
import type { VariantContent } from "@archboard/model/content";
import {
	MEASURES,
	historySource,
	historyState,
	interfaceRows,
	measureOf,
	measuresOf,
	shownRows,
	sortedBy,
	sortedRows,
	withHistory,
	type MeasureRow,
} from "#ui/rules/architecture-model/module-measures.ts";

type Node = VariantContent["nodes"][number];
type Locality = NonNullable<Parameters<typeof withHistory>[1]>;

/**
 * One module.
 * @param id Its identity.
 * @param parent What holds it.
 * @returns The module.
 */
function module(id: string, parent?: string): Node {
	return { id, name: id, kind: "module", order: 1, ...(parent === undefined ? {} : { parent }) };
}

/**
 * One relationship.
 * @param from Where it starts.
 * @param to Where it ends.
 * @returns The relationship.
 */
function call(from: string, to: string): VariantContent["edges"][number] {
	return { id: `${from}-${to}`, from, to, kind: "call", order: 1, emphasis: "normal" };
}

/**
 * The rows of a model: `hub` holds two parts and two callers reach one of them, `far` holds one
 * part and is reached as a whole, and `leaf` has no parts.
 * @returns The rows.
 */
function rows(): readonly MeasureRow[] {
	const nodes = [
		module("hub"),
		module("used", "hub"),
		module("alone", "hub"),
		module("far"),
		module("part", "far"),
		module("leaf"),
		module("other"),
	];
	const edges = [call("leaf", "used"), call("other", "used"), call("leaf", "far")];
	return interfaceRows({ complete: { nodes, edges, flows: [], walkthroughs: [] } });
}

/**
 * A module the answer names.
 * @param id Its identity.
 * @returns The subject.
 */
function subject(id: string) {
	return { kind: "node", id, name: id } as const;
}

/**
 * A module the lens read.
 * @param id Its identity.
 * @param count The commits that changed it.
 * @returns What the answer says of it.
 */
function hotspot(id: string, count: number): Locality["hotspots"][number] {
	return { subject: subject(id), repo: "example/shop", path: `src/${id}.ts`, commits: [], count };
}

/**
 * Two modules that change together.
 * @param one A module.
 * @param other The other.
 * @param unjoined Whether nothing in the model joins them.
 * @param shared How many commits they share.
 * @returns The pair.
 */
function pair(
	one: string,
	other: string,
	unjoined: boolean,
	shared = 5,
): Locality["coupling"][number] {
	return {
		subjects: [subject(one), subject(other)],
		repo: "example/shop",
		commits: [],
		shared,
		degree: 50,
		unjoined,
	};
}

/** What the read says: `hub` changed most, `alone` not at all, and `far` was not read. */
const ANSWER: Locality = {
	hotspots: [hotspot("hub", 9), hotspot("leaf", 3), hotspot("other", 3), hotspot("alone", 0)],
	coupling: [pair("hub", "leaf", true), pair("hub", "other", true), pair("leaf", "other", false)],
	skipped: [{ subject: subject("far"), reason: "unbound" }],
};

/**
 * The modules in the order of a measure.
 * @param key The measure.
 * @param fewest Whether the fewest come first.
 * @param answer What the read says.
 * @returns Their names.
 */
function orderBy(
	key: Parameters<typeof sortedRows>[1],
	fewest = false,
	answer: Locality = ANSWER,
): readonly string[] {
	return sortedRows(withHistory(rows(), answer), key, fewest).map((row) => row.name);
}

test("each measure gives one order, the most first, with a tie by name", () => {
	expect(orderBy("commits")).toEqual(["hub", "leaf", "other", "alone", "far", "part", "used"]);
	expect(orderBy("unjoined").slice(0, 3)).toEqual(["hub", "leaf", "other"]);
	expect(orderBy("callers").slice(0, 2)).toEqual(["hub", "far"]);
	expect(orderBy("hiddenParts").slice(0, 2)).toEqual(["far", "hub"]);
	expect(orderBy("wholeModule").slice(0, 2)).toEqual(["far", "hub"]);
});

test("every measure sorts, and the order does not depend on the order it starts from", () => {
	for (const { key } of MEASURES) {
		const joined = withHistory(rows(), ANSWER);
		expect(sortedRows(joined.toReversed(), key)).toEqual(sortedRows(joined, key));
	}
});

test("a module with no such measure comes after a count of none", () => {
	const joined = withHistory(rows(), ANSWER);
	const named = new Map(joined.map((row) => [row.id, row]));
	expect(measureOf(named.get("alone")!, "commits")).toBe(0);
	expect(measureOf(named.get("far")!, "commits")).toBeUndefined();
	expect(measureOf(named.get("leaf")!, "entryPoints")).toBeUndefined();
	expect(measureOf(named.get("hub")!, "wholeModule")).toBe(0);
	const order = orderBy("commits");
	expect(order.indexOf("alone")).toBeLessThan(order.indexOf("far"));
});

test("a skipped module keeps its reason and joins no count", () => {
	const joined = new Map(withHistory(rows(), ANSWER).map((row) => [row.id, row]));
	expect(joined.get("far")?.history).toEqual({ kind: "skipped", reason: "unbound" });
	expect(measureOf(joined.get("hub")!, "commits")).toBe(9);
	expect(measureOf(joined.get("other")!, "commits")).toBe(3);
});

/**
 * What the read says of a module: the modules it changes with, and those nothing joins it to.
 * @param joined Every module with its history.
 * @param id The module.
 * @returns The two counts.
 */
function counts(joined: ReadonlyMap<string, MeasureRow>, id: string): (number | undefined)[] {
	return [measureOf(joined.get(id)!, "together"), measureOf(joined.get(id)!, "unjoined")];
}

test("changes with counts every module that changes in the same commits, and unjoined only those nothing joins", () => {
	const joined = new Map(withHistory(rows(), ANSWER).map((row) => [row.id, row]));
	expect(counts(joined, "hub")).toEqual([2, 2]);
	expect(counts(joined, "leaf")).toEqual([2, 1]);
	expect(counts(joined, "alone")).toEqual([0, 0]);
	expect(counts(joined, "far")).toEqual([undefined, undefined]);
});

test("a tie of pair counts puts the module with the strongest pair first, then goes by name", () => {
	const answer: Locality = {
		hotspots: ["leaf", "other", "part", "used"].map((id) => hotspot(id, 3)),
		coupling: [pair("leaf", "other", true, 5), pair("part", "used", true, 35)],
		skipped: [],
	};
	expect(orderBy("unjoined", false, answer).slice(0, 4)).toEqual(["part", "used", "leaf", "other"]);
	// The same rule holds from the other end: only the count turns round.
	expect(orderBy("unjoined", true, answer).slice(0, 4)).toEqual(["part", "used", "leaf", "other"]);
	expect(orderBy("together", false, answer).slice(0, 4)).toEqual(["part", "used", "leaf", "other"]);
});

test("the fewest can come first, and a module with no such count stays last either way", () => {
	expect(orderBy("commits", true)).toEqual([
		"alone",
		"leaf",
		"other",
		"hub",
		"far",
		"part",
		"used",
	]);
	expect(orderBy("commits", false).slice(-3)).toEqual(["far", "part", "used"]);
	expect(orderBy("hiddenParts", true).slice(0, 2)).toEqual(["far", "hub"]);
});

test("a reader can have all modules on show, those with parts, or those with none", () => {
	const all = rows();
	expect(shownRows(all, "all")).toHaveLength(7);
	expect(shownRows(all, "with-parts").map((row) => row.id)).toEqual(["hub", "far"]);
	expect(shownRows(all, "no-parts").map((row) => row.id)).toEqual([
		"used",
		"alone",
		"part",
		"leaf",
		"other",
	]);
});

test("to module has no column while no module has such a caller", () => {
	expect(measuresOf(rows()).map((measure) => measure.key)).toContain("wholeModule");
	const none = interfaceRows({
		complete: {
			nodes: [module("hub"), module("used", "hub"), module("leaf")],
			edges: [call("leaf", "used")],
			flows: [],
			walkthroughs: [],
		},
	});
	expect(measuresOf(none).map((measure) => measure.key)).not.toContain("wholeModule");
	expect(measuresOf(none)).toHaveLength(MEASURES.length - 1);
});

test("the sort falls back to a measure the reading can offer", () => {
	const all = measuresOf(rows());
	expect(sortedBy("commits", all, true)).toBe("commits");
	expect(sortedBy("commits", all, false)).toBe("entryPoints");
	expect(
		sortedBy(
			"wholeModule",
			all.filter((one) => one.key !== "wholeModule"),
			true,
		),
	).toBe("entryPoints");
});

test("the interface stands before any answer, and a module with no parts has none", () => {
	const named = new Map(rows().map((row) => [row.id, row]));
	expect(measureOf(named.get("hub")!, "entryPoints")).toBe(1);
	expect(measureOf(named.get("hub")!, "callers")).toBe(2);
	expect(named.get("hub")?.history).toBeUndefined();
	expect(named.get("leaf")?.counts).toBeNull();
});

test("a reading says whether it has history to read, and how the read stands", () => {
	const modules = [{ binding: { repo: "example/shop", path: "src" } }];
	expect(historySource({ modules })).toBe("bound");
	expect(historySource({ modules: [{}] })).toBe("unbound");
	expect(historySource({ modules, migrationPreview: {} })).toBe("original");
	expect(historyState("unbound", { data: undefined, error: null })).toBe("unbound");
	expect(historyState("original", { data: undefined, error: null })).toBe("original");
	expect(historyState("bound", { data: undefined, error: null })).toBe("reading");
	expect(historyState("bound", { data: ANSWER, error: null })).toBe("read");
	expect(historyState("bound", { data: ANSWER, error: new Error("no") })).toBe("failed");
});

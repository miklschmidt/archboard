// How the list across the whole model joins the interface of each module with its code history,
// and the one order of each measure.

import { expect, test } from "bun:test";
import type { VariantContent } from "@archboard/board/content";
import {
	MEASURES,
	historySource,
	historyState,
	interfaceRows,
	measureOf,
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
 * @returns The pair.
 */
function pair(one: string, other: string, unjoined: boolean): Locality["coupling"][number] {
	return {
		subjects: [subject(one), subject(other)],
		repo: "example/shop",
		commits: [],
		shared: 5,
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
 * @returns Their names.
 */
function orderBy(key: Parameters<typeof sortedRows>[1]): readonly string[] {
	return sortedRows(withHistory(rows(), ANSWER), key).map((row) => row.name);
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
	expect(joined.get("hub")?.history).toEqual({ kind: "read", commits: 9, unjoined: 2 });
	expect(joined.get("other")?.history).toEqual({ kind: "read", commits: 3, unjoined: 1 });
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

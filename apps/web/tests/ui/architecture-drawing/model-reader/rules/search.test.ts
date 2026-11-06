// Find reaches anything a reading can open. What these catch: an exact path that sinks
// under names that merely contain it, a kind of destination that Find cannot reach, and
// a former address that crowds out the living names.

import { expect, test } from "bun:test";

import { findInModel } from "#ui/architecture-drawing/model-reader/rules/search.ts";
import { SHOP } from "#tests/ui/support/model-reader/scene.ts";

type Searchable = Parameters<typeof findInModel>[0];

const PART = {
	schemaVersion: 1 as const,
	kind: "module",
	order: 0,
	file: "part.module.json",
	outgoing: [],
};

const MODEL: Searchable = {
	...SHOP,
	modules: [
		{ ...PART, id: "model", name: "model", binding: { repo: "repo", path: "packages/model" } },
		{ ...PART, id: "store", name: "Store", binding: { repo: "repo", path: "packages/model/src" } },
		{ ...PART, id: "worker", name: "Worker", responsibility: "Drains the model queue" },
	],
	collections: [
		{
			schemaVersion: 1,
			id: "orders",
			name: "Orders",
			file: "orders.flows.json",
			flows: [{ id: "flow", name: "Order placed", participants: ["model"], steps: [] }],
		},
	],
	walkthroughs: [
		{
			schemaVersion: 1,
			id: "tour",
			name: "Order tour",
			target: { state: "Current" },
			file: "tour.json",
			beats: [],
		},
	],
	migration: {
		bookmarks: [
			{
				id: "mark",
				legacy: "mark",
				board: "model",
				file: "mark.json",
				name: "Order bookmark",
				summary: "Kept",
				reading: {
					selection: [],
					focus: [],
					filters: { relationships: [], groups: [] },
					grammar: "architecture",
				},
				diagnostics: [],
			},
		],
		addresses: [
			{ address: "orders-before", board: "model", state: "Before", canonical: "Current" },
		],
	},
};

/**
 * What Find lists.
 * @param query The reader's words.
 * @returns The kind and identity of each hit, in order.
 */
function found(query: string): string[] {
	return findInModel(MODEL, query).map((hit) => `${hit.kind}:${hit.id}`);
}

test("an exact path comes first, then a path that holds it, then words that mention it", () => {
	expect(found("packages/model")).toEqual(["module:model", "module:store"]);
	expect(found("model")).toEqual(["module:model", "module:store", "module:worker"]);
});

test("flows, walkthroughs, bookmarks and former addresses are all within reach", () => {
	expect(found("order")).toEqual([
		"bookmark:mark",
		"flow:flow",
		"walkthrough:tour",
		"address:orders-before",
	]);
});

test("a former address comes first only when it is pasted whole", () => {
	expect(found("orders-before")).toEqual(["address:orders-before"]);
	expect(found("orders")[0]).toBe("address:orders-before");
});

test("nothing is listed before the reader asks", () => {
	expect(found("   ")).toEqual([]);
});

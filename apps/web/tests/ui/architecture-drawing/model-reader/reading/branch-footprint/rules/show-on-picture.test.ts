// Where Show on picture opens a list, and what it selects there: the nearest shared parent of the
// listed modules, and the drawn module that stands for each of them.

import { expect, test } from "bun:test";
import { showList } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/show-on-picture.ts";

/**
 * A tree of modules from the parent of each one.
 * @param parents Each module and what holds it, or null at the root.
 * @returns The modules.
 */
function tree(parents: Record<string, string | null>): Parameters<typeof showList>[0] {
	return Object.entries(parents).map(([id, parent]) => (parent === null ? { id } : { id, parent }));
}

const MODULES = tree({
	shop: null,
	gateway: "shop",
	handler: "gateway",
	auth: "gateway",
	worker: "shop",
	queue: "worker",
	billing: null,
});

test("a list opens its nearest shared parent and selects the drawn module that holds each", () => {
	expect(showList(MODULES, ["handler", "queue"])).toEqual({
		scope: "shop",
		selected: ["gateway", "worker"],
	});
	expect(showList(MODULES, ["handler", "auth"])).toEqual({
		scope: "gateway",
		selected: ["handler", "auth"],
	});
});

test("a list with no shared parent opens the root reading", () => {
	expect(showList(MODULES, ["queue", "billing"])).toEqual({
		scope: null,
		selected: ["shop", "billing"],
	});
});

test("a module that holds another listed module stands for both, and an unknown one is left out", () => {
	expect(showList(MODULES, ["gateway", "handler", "gone"])).toEqual({
		scope: "shop",
		selected: ["gateway"],
	});
});

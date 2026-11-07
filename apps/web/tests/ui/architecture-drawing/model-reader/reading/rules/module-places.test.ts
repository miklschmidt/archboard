// The rows of a list of modules on About. What these catch: rows in authored order rather than the
// order of the tree, a nested list that walks the whole forest, and a part listed twice.

import { expect, test } from "bun:test";

import type { VariantContent } from "@archboard/model/content";
import { moduleTree } from "#ui/architecture-drawing/model-reader/rules/module-tree.ts";
import { modulePlaces } from "#ui/architecture-drawing/model-reader/reading/rules/module-places.ts";

type Node = VariantContent["nodes"][number];

/**
 * A module.
 * @param id Its identity and name.
 * @param path Its code path, which orders siblings.
 * @param parent The module that holds it.
 * @returns The node.
 */
function node(id: string, path: string, parent?: string): Node {
	return {
		id,
		order: 0,
		name: id,
		kind: "service",
		...(parent === undefined ? {} : { parent }),
		binding: { repo: "repo", path },
	};
}

const NODES = [
	node("b", "b"),
	node("a", "a"),
	node("a1", "a/1", "a"),
	node("a2", "a/2", "a"),
	node("deep", "a/1/x", "a1"),
];
const ALL = new Map(NODES.map((one) => [one.id, one]));
const TREE = moduleTree({ nodes: NODES });
const ROOTS = NODES.filter((one) => one.parent === undefined);

test("a nested list follows the tree one rail deep and says what each row holds", () => {
	const rows = modulePlaces(ROOTS, TREE, ALL, true);
	expect(rows.map(({ module, depth, holds }) => [module.id, depth, holds])).toEqual([
		["a", 0, 2],
		["a1", 1, 1],
		["a2", 1, 0],
		["b", 0, 0],
	]);
});

test("a flat list brings no parts", () => {
	const rows = modulePlaces(ROOTS, TREE, ALL, false);
	expect(rows.map(({ module }) => module.id)).toEqual(["a", "b"]);
});

test("a part the list states itself stands once", () => {
	const rows = modulePlaces([...ROOTS, ALL.get("a1")!], TREE, ALL, true);
	expect(rows.filter(({ module }) => module.id === "a1")).toHaveLength(1);
});

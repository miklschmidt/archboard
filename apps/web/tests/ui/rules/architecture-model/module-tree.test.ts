// The Modules tree: its order, its folds, and where the reader's moves lead. What these
// catch: a sibling order that follows authored order alone, an unbound module among the
// bound ones, a fold that shows its steps as rows, and an Up that opens the same picture.

import { expect, test } from "bun:test";

import type { VariantContent } from "@archboard/board/content";
import {
	endWithin,
	moduleTree,
	pathTo,
	siblingOf,
	treeRows,
	upFrom,
} from "#ui/rules/architecture-model/module-tree.ts";

type Node = VariantContent["nodes"][number];

/**
 * A module.
 * @param id Its identity and name.
 * @param parent The module that holds it.
 * @param path Its code path.
 * @returns The node.
 */
function node(id: string, parent?: string, path?: string): Node {
	return {
		id,
		order: 0,
		name: id,
		kind: "service",
		...(parent === undefined ? {} : { parent }),
		...(path === undefined ? {} : { binding: { repo: "repo", path } }),
	};
}

/**
 * The tree of some modules.
 * @param nodes The modules, in authored order.
 * @returns The tree.
 */
function treeOf(...nodes: Node[]) {
	return moduleTree({ nodes });
}

test("siblings sort by code path, with unbound modules last and authored order for ties", () => {
	const tree = treeOf(
		node("unbound"),
		node("zebra", undefined, "packages/zebra"),
		node("first", undefined, "apps/same"),
		node("second", undefined, "apps/same"),
		node("alpha", undefined, "apps/alpha"),
	);
	expect(tree.roots.map((branch) => branch.id)).toEqual([
		"alpha",
		"first",
		"second",
		"zebra",
		"unbound",
	]);
});

test("a chain folds into one row that opens its last step, and a part with no parts ends it", () => {
	const tree = treeOf(
		node("top"),
		node("middle", "top"),
		node("bottom", "middle"),
		node("left", "bottom"),
		node("right", "bottom"),
		node("single"),
		node("leaf", "single"),
	);
	const [top, single] = tree.roots;
	expect(top?.name).toBe("top / middle / bottom");
	expect(top?.end).toBe("bottom");
	expect(top?.children.map((branch) => branch.id)).toEqual(["left", "right"]);
	expect(single?.steps).toEqual(["single"]);
	expect(pathTo(tree, "middle").map((branch) => branch.id)).toEqual(["top"]);
});

test("only the open branches draw their rows", () => {
	const tree = treeOf(node("a"), node("a1", "a"), node("a2", "a"), node("b"));
	expect(treeRows(tree, new Set()).map((row) => row.id)).toEqual(["a", "b"]);
	expect(treeRows(tree, new Set(["a"])).map((row) => [row.id, row.depth])).toEqual([
		["a", 0],
		["a1", 1],
		["a2", 1],
		["b", 0],
	]);
});

test("the siblings walk within one parent and end at its edges", () => {
	const tree = treeOf(node("a"), node("a1", "a"), node("a2", "a"), node("b"));
	expect(siblingOf(tree, "a1", 1)?.id).toBe("a2");
	expect(siblingOf(tree, "a2", 1)).toBeNull();
	expect(siblingOf(tree, "a", -1)).toBeNull();
	expect(siblingOf(tree, "a", 1)?.id).toBe("b");
	expect(endWithin(tree, null, -1)?.id).toBe("b");
	expect(endWithin(tree, "a", 1)?.id).toBe("a1");
	expect(endWithin(tree, "a1", 1)).toBeNull();
});

test("Up leaves a whole fold, so it never opens the same picture", () => {
	const tree = treeOf(
		node("top"),
		node("middle", "top"),
		node("bottom", "middle"),
		node("left", "bottom"),
		node("right", "bottom"),
	);
	expect(upFrom(tree, "left")).toBe("bottom");
	expect(upFrom(tree, "bottom")).toBeNull();
	expect(upFrom(tree, "middle")).toBeNull();
});

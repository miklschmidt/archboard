import { expect, test } from "bun:test";

import { projectModel, type Model } from "@archboard/model/content";
import {
	relationshipRows,
	soloed,
	toggled,
} from "#ui/architecture-drawing/model-reader/reading/rules/legend-rows.ts";
import { lensStatus } from "#ui/architecture-drawing/model-reader/reading/components/ModelLens.tsx";
import { SHOP } from "#tests/ui/support/model-reader/scene.ts";

type Relationship = Model["relationships"][number];

/**
 * The shop with some relationships between its two branches.
 * @param edges Each relationship's id, ends, kind and effect.
 * @returns The model.
 */
function shopWith(edges: readonly Pick<Relationship, "id" | "from" | "to" | "kind" | "effect">[]): Model {
	return {
		...SHOP,
		relationships: edges.map((edge, order) => ({ order, emphasis: "normal", ...edge })),
	} as Model;
}

const SHOP_LINES = shopWith([
	{ id: "Shop#Write", from: "Shop#Handler", to: "Shop#Queue", kind: "sync", effect: "mutation" },
	{ id: "Shop#Look", from: "Shop#Handler", to: "Shop#Queue", kind: "sync", effect: "query" },
	{ id: "Shop#Fetch", from: "Shop#Gateway", to: "Shop#Worker", kind: "http", effect: "query" },
	{ id: "Shop#Needs", from: "Shop#Decode", to: "Shop#Queue", kind: "dependency", effect: undefined },
]);

test("the legend lists every kind and effect of the scope, and sets apart what the lens leaves out", () => {
	const projection = projectModel(SHOP_LINES, null, null, { lens: "main", hideKinds: ["http"] });
	const { kinds, effects } = relationshipRows({
		model: SHOP_LINES,
		projection,
		hideKinds: ["http"],
	});
	expect(kinds.map(({ id, hidden, dimmed, leftOut }) => ({ id, hidden, dimmed, leftOut }))).toEqual([
		{ id: "sync", hidden: false, dimmed: false, leftOut: false },
		{ id: "http", hidden: true, dimmed: true, leftOut: false },
		{ id: "dependency", hidden: false, dimmed: true, leftOut: true },
	]);
	// Main lines draws a query only over HTTP, which the reader hid, so the picture draws no query.
	expect(effects.map(({ id, dimmed, leftOut }) => ({ id, dimmed, leftOut }))).toEqual([
		{ id: "mutation", dimmed: false, leftOut: false },
		{ id: "query", dimmed: true, leftOut: false },
		{ id: "declared", dimmed: true, leftOut: true },
	]);
	expect(lensStatus(projection)).toBe(`Main lines · ${String(projection.leftOut)} lines left out`);
});

test("a row's name shows it alone, again shows every row, and its eye toggles only it", () => {
	const projection = projectModel(SHOP_LINES, null, null, { lens: "main" });
	const { kinds } = relationshipRows({ model: SHOP_LINES, projection });
	// A kind the lens leaves out has no switch, so showing a row alone never names it.
	expect(soloed(kinds, "sync")).toEqual(["http"]);
	const alone = relationshipRows({ model: SHOP_LINES, projection, hideKinds: ["http"] }).kinds;
	expect(soloed(alone, "sync")).toEqual([]);
	expect(toggled(alone, "http")).toEqual([]);
	expect(toggled(alone, "sync")).toEqual(["http", "sync"]);
});

test("the line above the picture says when the default lens drew nothing and every relationship shows", () => {
	const declared = shopWith([
		{ id: "Shop#Needs", from: "Shop#Decode", to: "Shop#Queue", kind: "dependency", effect: undefined },
	]);
	expect(lensStatus(projectModel(declared))).toBe(
		"Main lines has no lines here · Showing all relationships",
	);
});

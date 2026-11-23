// The engine a recipe names. A version 1 recipe kept while Track was an engine reads as Lanes,
// which replaced it (ADR 0096); a version 2 recipe names the engine its picture was drawn with,
// and one kept before it was stated reads as Blocks.

import { expect, test } from "bun:test";
import { readRenderRecipe } from "#runtime/recipe/operations/read-recipe.ts";
import { embedRecipeInSvg } from "#runtime/recipe/operations/svg-recipe.ts";

const digest = (digit: string) => `sha256:${digit.repeat(64)}`;
const V1 = {
	recipe: 1,
	board: { id: "b1", name: "Ledger" },
	vault: { repo: null },
	variant: "current",
	view: "overview",
	comparison: "on",
	theme: "light",
	layout: null,
	title: null,
	legend: null,
	fingerprint: digest("1"),
	picture: digest("2"),
};
const V2 = {
	recipe: 2,
	model: { id: "m1", name: "Shop" },
	vault: { repo: null },
	reading: { grammar: "architecture", legend: "horizontal" },
	fingerprint: digest("1"),
	picture: digest("2"),
};

/**
 * What a file holding this recipe reads back as.
 * @param recipe What the file holds.
 * @returns The recipe, or the reason it cannot be read.
 */
function readBack(recipe: object) {
	return readRenderRecipe(Buffer.from(embedRecipeInSvg("<svg><g/>\n</svg>", recipe as never)));
}

test("a version 1 recipe that names Track reads as Lanes, and any other stranger is refused", () => {
	const layoutOf = (layout: unknown) => {
		const read = readBack({ ...V1, layout });
		return read.kind === "recipe" && "board" in read.recipe ? read.recipe.layout : read.kind;
	};
	expect(layoutOf("track")).toBe("lanes");
	expect(layoutOf("lanes")).toBe("lanes");
	expect(layoutOf("blocks")).toBe("blocks");
	expect(layoutOf(null)).toBeNull();
	expect(layoutOf("graphviz")).toBe("unreadable");
});

test("a version 2 recipe keeps the engine it was drawn with, and one without reads as Blocks", () => {
	const layoutOf = (reading: object) => {
		const read = readBack({ ...V2, reading });
		return read.kind === "recipe" && "model" in read.recipe
			? read.recipe.reading.layout
			: read.kind;
	};
	expect(layoutOf({ ...V2.reading, layout: "lanes" })).toBe("lanes");
	expect(layoutOf(V2.reading)).toBe("blocks");
});

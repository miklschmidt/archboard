// A recipe an embed holds from the days Track was an engine still reads: whatever engine it
// names, it parses, and it reads as the recipe of a picture Blocks draws.

import { expect, test } from "bun:test";
import { readRenderRecipe } from "#runtime/recipe/operations/read-recipe.ts";
import { embedRecipeInSvg } from "#runtime/recipe/operations/svg-recipe.ts";
import type { RenderRecipe } from "#runtime/recipe/operations/schema.ts";

const digest = (digit: string) => `sha256:${digit.repeat(64)}`;
const RECIPE: RenderRecipe = {
	recipe: 1,
	board: { id: "b1", name: "Ledger" },
	vault: { repo: null },
	variant: "current",
	view: "overview",
	comparison: "on",
	theme: "light",
	title: null,
	legend: null,
	fingerprint: digest("1"),
	picture: digest("2"),
};

test("a recipe that names Track, Blocks or no engine reads as one that names none", () => {
	for (const layout of ["track", "blocks", null]) {
		const embed = embedRecipeInSvg("<svg><g/>\n</svg>", { ...RECIPE, layout } as never);
		expect(readRenderRecipe(Buffer.from(embed, "utf8"))).toEqual({
			kind: "recipe",
			recipe: RECIPE,
		});
	}
});

test("a recipe that names an engine that never existed is refused", () => {
	const embed = embedRecipeInSvg("<svg><g/>\n</svg>", { ...RECIPE, layout: "graphviz" } as never);
	expect(readRenderRecipe(Buffer.from(embed, "utf8")).kind).toBe("unreadable");
});

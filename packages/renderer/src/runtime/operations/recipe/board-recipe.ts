// The recipe of one board render, from what the render asked and answered.

import type { SemanticBoard } from "@archboard/board/document";
import type { DrawnBoard } from "@archboard/board/render-reply";
import type { BoardRenderChoices, DrawnInput } from "#shared/rules/render/board.ts";
import { inputFingerprint, sha256Of } from "#runtime/operations/recipe/digest.ts";
import { RENDER_RECIPE_VERSION, type RenderRecipe } from "#runtime/operations/recipe/schema.ts";

/** The vault of a board render, as its recipe names it: the repository identity of its checkout. */
interface RecipeVault {
	readonly repo: string | null;
}

/**
 * What a render drew, by id: the variant or `current` when it named none, the
 * view or the overview, and how it reads against another variant.
 * @param choices What the render asked for.
 * @param reply What it answered.
 * @returns The recipe's selection.
 */
function selection(
	choices: BoardRenderChoices,
	reply: DrawnBoard,
): Pick<RenderRecipe, "variant" | "view" | "comparison"> {
	return {
		variant: choices.variant === undefined ? "current" : { id: reply.variant.id },
		view: reply.view === null ? "overview" : { id: reply.view.id },
		comparison: comparison(choices, reply),
	};
}

/**
 * How a recipe says the picture reads against another variant.
 * @param choices What the render asked for.
 * @param reply What it answered.
 * @returns `off`, the variant it was asked to be drawn against, or `on` for the board's own reading.
 * @throws {Error} When a picture asked against a variant answered no comparison.
 */
function comparison(choices: BoardRenderChoices, reply: DrawnBoard): RenderRecipe["comparison"] {
	if (choices.comparison === false) return "off";
	if (choices.against === undefined) return "on";
	if (reply.changes === null) {
		throw new Error("A picture drawn against a variant answered no comparison.");
	}
	return { against: reply.changes.against.id };
}

/**
 * The drawing choices of a render that stands alone.
 * @param choices What the render asked for.
 * @returns The theme, the layout, the title and the legend.
 * @throws {Error} When the render does not stand alone, which no recipe can draw again.
 */
function drawingChoices(
	choices: BoardRenderChoices,
): Pick<RenderRecipe, "theme" | "layout" | "title" | "legend"> {
	if (choices.theme === undefined) {
		throw new Error("Only a render that stands alone, in a theme of its own, carries a recipe.");
	}
	return {
		theme: choices.theme,
		layout: choices.layout ?? null,
		title: choices.title ?? null,
		legend: legendOf(choices),
	};
}

/**
 * The legend a render asked for.
 * @param choices What the render asked for.
 * @returns Its layout and whether it stands alone, or null for none.
 */
function legendOf(choices: BoardRenderChoices): RenderRecipe["legend"] {
	return choices.legend === undefined
		? null
		: { layout: choices.legend, alone: choices.legendOnly === true };
}

/**
 * The recipe of one board render. The picture digest is of the SVG as drawn,
 * before the recipe goes in, so a picture drawn again compares by what the
 * renderer drew.
 * @param board The board, as read.
 * @param choices What the render asked for.
 * @param reply What the render answered.
 * @param input What the picture was drawn from.
 * @param vault The vault the recipe names.
 * @returns The recipe.
 */
function boardRecipe(
	board: SemanticBoard,
	choices: BoardRenderChoices,
	reply: DrawnBoard,
	input: DrawnInput,
	vault: RecipeVault,
): RenderRecipe {
	return {
		recipe: RENDER_RECIPE_VERSION,
		board: { id: board.id, name: board.name },
		vault: { repo: vault.repo },
		...selection(choices, reply),
		...drawingChoices(choices),
		fingerprint: inputFingerprint(input),
		picture: sha256Of(reply.svg),
	};
}

export { boardRecipe, type RecipeVault };

// The render route's request that draws a recipe again (ADR 0057): the
// variant, the view and the variant drawn against by id, and every drawing
// choice the recipe records. The route finds a board by name, so the caller
// names the board that now holds the recipe's id; the recipe's own name may be
// an old one.

import type {
	LayoutEngineName,
	LegendLayout,
	StandaloneTheme,
} from "@archboard/board/render-reply";
import type { RenderRecipe } from "#runtime/operations/recipe/schema.ts";

/** The render route's selectors that draw one recipe again, as the route reads them. */
interface RecipeRenderRequest {
	readonly theme: StandaloneTheme;
	readonly variant?: string;
	readonly view?: string;
	readonly against?: string;
	readonly comparison?: "off";
	readonly layout?: LayoutEngineName;
	readonly title?: string;
	readonly titled?: "on";
	readonly legend?: LegendLayout;
	readonly legendOnly?: "on";
}

/**
 * How the recipe reads against another variant, as the route asks for it.
 * @param comparison The recipe's comparison.
 * @returns `comparison=off`, the variant to read it against, or nothing for the board's own reading.
 */
function comparisonRequest(
	comparison: RenderRecipe["comparison"],
): Pick<RecipeRenderRequest, "comparison" | "against"> {
	if (comparison === "off") return { comparison: "off" };
	return comparison === "on" ? {} : { against: comparison.against };
}

/**
 * The title and the legend the recipe records, as the route asks for them.
 * @param recipe The recipe.
 * @returns The title's words or `titled=on`, and the legend's layout with `legendOnly=on` when it stands alone.
 */
function framingRequest(
	recipe: RenderRecipe,
): Pick<RecipeRenderRequest, "title" | "titled" | "legend" | "legendOnly"> {
	const title =
		recipe.title === true
			? { titled: "on" as const }
			: recipe.title === null
				? {}
				: { title: recipe.title };
	if (recipe.legend === null) return title;
	return {
		...title,
		legend: recipe.legend.layout,
		...(recipe.legend.alone ? { legendOnly: "on" as const } : {}),
	};
}

/**
 * The render route's request that draws a recipe's picture again. A bitmap's
 * scale and region are not the route's: the rasterizer applies them to the SVG
 * this request draws.
 * @param recipe The recipe.
 * @returns The selectors, without the board.
 */
function recipeRenderRequest(recipe: RenderRecipe): RecipeRenderRequest {
	return {
		theme: recipe.theme,
		...(recipe.variant === "current" ? {} : { variant: recipe.variant.id }),
		...(recipe.view === "overview" ? {} : { view: recipe.view.id }),
		...comparisonRequest(recipe.comparison),
		...(recipe.layout === null ? {} : { layout: recipe.layout }),
		...framingRequest(recipe),
	};
}

export { recipeRenderRequest, type RecipeRenderRequest };

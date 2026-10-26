// The render recipe a file carries, read from its bytes alone: a PNG by its
// text chunk, anything else as text that may hold an SVG's recipe element.

import { readPngDimensions } from "#runtime/operations/rasterizer/png.ts";
import { pngRecipeText } from "#runtime/operations/recipe/png-recipe.ts";
import { RenderRecipeSchema, type RenderRecipe } from "#runtime/operations/recipe/schema.ts";
import { svgRecipeText } from "#runtime/operations/recipe/svg-recipe.ts";

/**
 * What a file says about how it was drawn: its recipe, no recipe at all, or a
 * recipe that cannot be read, with what is wrong with it. A file without a
 * recipe is no embed; one whose recipe is unreadable is an embed nobody can
 * draw again, which a check has to say.
 */
type RenderRecipeRead =
	| { readonly kind: "recipe"; readonly recipe: RenderRecipe }
	| { readonly kind: "absent" }
	| { readonly kind: "unreadable"; readonly problem: string };

/**
 * What a failed read says.
 * @param error What it threw.
 * @returns The message.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Whether the bytes are a PNG.
 * @param bytes The file.
 * @returns True when they begin as one.
 */
function isPng(bytes: Uint8Array): boolean {
	try {
		readPngDimensions(bytes);
		return true;
	} catch {
		return false;
	}
}

/**
 * The recipe text a file carries.
 * @param bytes The file.
 * @returns The recipe's JSON text, or undefined when it carries none.
 */
function recipeText(bytes: Uint8Array): string | undefined {
	if (isPng(bytes)) return pngRecipeText(bytes);
	return svgRecipeText(Buffer.from(bytes).toString("utf8"));
}

/**
 * The render recipe a file carries.
 * @param bytes The file's bytes.
 * @returns The recipe, its absence, or why it cannot be read.
 */
function readRenderRecipe(bytes: Uint8Array): RenderRecipeRead {
	let text: string | undefined;
	try {
		text = recipeText(bytes);
	} catch (error) {
		return { kind: "unreadable", problem: errorMessage(error) };
	}
	if (text === undefined) return { kind: "absent" };
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		return { kind: "unreadable", problem: `The recipe is not JSON: ${errorMessage(error)}` };
	}
	const parsed = RenderRecipeSchema.safeParse(json);
	return parsed.success
		? { kind: "recipe", recipe: parsed.data }
		: { kind: "unreadable", problem: parsed.error.issues.map(issueLine).join("; ") };
}

/**
 * One schema refusal, with where it is.
 * @param issue The refusal.
 * @param issue.path Where in the recipe it is.
 * @param issue.message What is wrong.
 * @returns The line.
 */
function issueLine(issue: {
	readonly path: readonly PropertyKey[];
	readonly message: string;
}): string {
	return issue.path.length === 0
		? issue.message
		: `${issue.path.map(String).join(".")}: ${issue.message}`;
}

export { readRenderRecipe, type RenderRecipeRead };

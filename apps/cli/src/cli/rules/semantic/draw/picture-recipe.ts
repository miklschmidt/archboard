// What both drawing commands need from the SVG the server drew: its render
// recipe (ADR 0057). A server that started before the recipe existed draws
// none, and the commands refuse that picture in their own words.

import { readRenderRecipe, type RenderRecipe } from "@archboard/renderer/recipe";

/** The refusal of a server that cannot say which repository holds the vault, as a command declares it. */
const vaultRepositoryUnknownRefusal = {
	code: "VAULT_REPOSITORY_UNKNOWN",
	exit: 1,
	stream: "stderr" as const,
	description:
		"Git did not say whether a repository holds the vault (it timed out or failed), so the render's recipe cannot name the vault's repository. Nothing was drawn; try again.",
};

/**
 * The recipe in the server's picture, or why it gives none.
 * @param svg The standalone SVG the server drew.
 * @returns The recipe, or the problem to tell the person.
 */
function recipeOfPicture(
	svg: string,
): { readonly recipe: RenderRecipe } | { readonly problem: string } {
	const read = readRenderRecipe(Buffer.from(svg, "utf8"));
	if (read.kind === "recipe") return { recipe: read.recipe };
	return {
		problem:
			read.kind === "absent"
				? "The server's picture carries no render recipe. A server that started before this checkout's " +
					"source changed draws none: run `archboard restart`, then try again."
				: `The server's picture carries a render recipe that cannot be read: ${read.problem}.`,
	};
}

export { recipeOfPicture, vaultRepositoryUnknownRefusal };

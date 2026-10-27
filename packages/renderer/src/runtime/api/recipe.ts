// The render recipe a board render carries: writing it into a PNG, reading it from a file, replacing it in one, and the render request that draws it again. A caller derives the recipe's type from what the read answers.
export { embedRecipeInPng } from "#runtime/operations/recipe/png-recipe.ts";
export { readRenderRecipe, replaceRenderRecipe } from "#runtime/operations/recipe/read-recipe.ts";

export { recordArchitectureRecipe } from "#runtime/operations/recipe/model-recipe.ts";

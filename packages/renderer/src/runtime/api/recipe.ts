// The render recipe a document render carries: writing it into a PNG, reading it from a file, replacing it in one, and the render request that draws it again. A caller derives the recipe's type from what the read answers.
export { embedRecipeInPng } from "#runtime/recipe/operations/png-recipe.ts";
export { readRenderRecipe, replaceRenderRecipe } from "#runtime/recipe/operations/read-recipe.ts";

export { recordArchitectureRecipe } from "#runtime/recipe/operations/model-recipe.ts";

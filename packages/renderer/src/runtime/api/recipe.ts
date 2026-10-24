// The render recipe a board render carries: its shape, writing it into a PNG, and reading it from a file.
export { embedRecipeInPng } from "#runtime/operations/recipe/png-recipe.ts";
export { readRenderRecipe } from "#runtime/operations/recipe/read-recipe.ts";
export type { RenderRecipeRead } from "#runtime/operations/recipe/read-recipe.ts";
export type { RenderRecipe } from "#runtime/operations/recipe/schema.ts";

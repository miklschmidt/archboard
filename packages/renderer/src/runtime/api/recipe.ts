// The render recipe a board render carries: its shape, writing it into a PNG, reading it from a file, replacing it in one, and the render request that draws it again.
export { embedRecipeInPng } from "#runtime/operations/recipe/png-recipe.ts";
export { readRenderRecipe, replaceRenderRecipe } from "#runtime/operations/recipe/read-recipe.ts";
export type { RenderRecipeRead } from "#runtime/operations/recipe/read-recipe.ts";
export { recipeRenderRequest } from "#runtime/operations/recipe/render-request.ts";
export type { RenderRecipe } from "#runtime/operations/recipe/schema.ts";

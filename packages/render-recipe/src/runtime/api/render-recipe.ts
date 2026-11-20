// The render recipe a picture file carries (ADR 0057): read it from a file's bytes, replace it in
// an SVG or a PNG, record a model render's recipe in its SVG, and the size a PNG states.
export { readRenderRecipe, replaceRenderRecipe } from "#runtime/operations/read-recipe.ts";
export { recordArchitectureRecipe } from "#runtime/operations/model-recipe.ts";
export { readPngDimensions } from "#runtime/operations/png.ts";

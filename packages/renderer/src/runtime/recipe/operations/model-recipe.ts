import type { z } from "zod";
import type {
	ArchitectureModelRead,
	ArchitectureRenderRequestSchema,
} from "@archboard/model/contract";
import { ArchitectureRecipeSchema } from "#runtime/recipe/operations/schema.ts";
import { inputFingerprint, sha256Of } from "#runtime/recipe/operations/digest.ts";
import { embedRecipeInSvg } from "#runtime/recipe/operations/svg-recipe.ts";
/**
 * Record exact canonical selectors through the existing render metadata owner.
 * @param svg The rendered SVG before metadata.
 * @param model The exact coherent reading.
 * @param reading The rendering selectors.
 * @param repo The portable vault identity.
 * @returns The SVG with its reproducible canonical recipe.
 */
function recordArchitectureRecipe(
	svg: string,
	model: Extract<ArchitectureModelRead, { success: true }>,
	reading: z.infer<typeof ArchitectureRenderRequestSchema>,
	repo: string | null,
): string {
	const recipe = ArchitectureRecipeSchema.parse({
		recipe: 2,
		model: { id: model.manifest.id, name: model.manifest.name },
		vault: { repo },
		reading: {
			...reading,
			module: model.selectedModule ?? undefined,
			flow: model.selectedFlow ?? undefined,
			state: reading.state === undefined ? undefined : model.selectedState?.id,
		},
		fingerprint:
			model.comparison === undefined
				? `sha256:${model.revision.digest}`
				: inputFingerprint({
						revision: model.revision.digest,
						comparison: {
							against: model.comparison.against,
							checkpoint: model.comparison.checkpoint,
							subjects: model.comparison.subjects,
						},
					}),
		picture: sha256Of(svg),
	});
	return embedRecipeInSvg(svg, recipe);
}
export { recordArchitectureRecipe };

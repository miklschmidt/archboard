import { createHash } from "node:crypto";
import { StateMetadataSchema } from "#shared/schemas/model-definitions.ts";
import { configurationOf } from "#shared/schemas/semantic-policy.ts";
import type { ArchitectureModel } from "#shared/canonical-contracts/schemas/model.ts";

/**
 * Identify complete predecessor meaning independently of sibling files.
 * @param model The coherent predecessor.
 * @returns A stable fingerprint of meaning and metadata.
 */
function predecessorRevision(model: ArchitectureModel): string {
	const state =
		model.selectedState === null ? null : StateMetadataSchema.strip().parse(model.selectedState);
	return createHash("sha256")
		.update(
			JSON.stringify({
				manifest: { ...model.manifest, retiredIds: model.manifest.retiredIds ?? [] },
				state,
				// The configuration form: a digest of an old reading stays what it was before lenses.
				policy: configurationOf(model.policy),
				modules: model.modules,
				collections: model.collections,
				...(model.walkthroughs.length === 0 ? {} : { walkthroughs: model.walkthroughs }),
			}),
		)
		.digest("hex");
}

export { predecessorRevision };

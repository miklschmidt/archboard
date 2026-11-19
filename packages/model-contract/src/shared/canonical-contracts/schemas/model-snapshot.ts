import { z } from "zod";
import { ArchitectureModelSchema } from "#shared/canonical-contracts/schemas/model.ts";
import { VaultCheckSchema } from "#shared/schemas/semantic-policy.ts";

/**
 * One state of a model and its comparison state in one portable file.
 * `archboard model snapshot` writes both readings with their policies and
 * the vault check. The icon paths cover all three policies, the default
 * vocabulary, and the renderer. A consumer can draw these inputs without an
 * Archboard server. A reader that meets another `format` refuses the file.
 */
const ModelSnapshotSchema = z.strictObject({
	format: z.literal(1),
	/** The version of the CLI that wrote the file. */
	cliVersion: z.string().min(1),
	/** The selected state, read with its comparison metadata. */
	reading: ArchitectureModelSchema,
	/** The state the reading is compared against, or null when it compares nothing. */
	comparisonReading: ArchitectureModelSchema.nullable(),
	check: VaultCheckSchema,
	/** The `<path d>` data for both readings and the check, by icon name. Missing icons use the renderer fallback. */
	icons: z.record(z.string(), z.array(z.string())),
});

export { ModelSnapshotSchema };

import { z } from "zod";
import { ArchitectureModelSchema } from "#shared/canonical-contracts/schemas/model.ts";
import { VaultCheckSchema } from "#shared/schemas/semantic-policy.ts";

/**
 * One state of a model and its comparison state in one portable file, which
 * `archboard model snapshot` writes. A reader draws it with no Archboard
 * server: the file holds both readings, the vault check whose policy the
 * pictures are drawn under, and the path data of every icon that policy
 * names. A reader that meets another `format` refuses the file.
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
	/** The `<path d>` data of each icon the policy names, by icon name. */
	icons: z.record(z.string(), z.array(z.string())),
});

export { ModelSnapshotSchema };

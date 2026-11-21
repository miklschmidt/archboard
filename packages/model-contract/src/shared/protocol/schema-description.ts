// The JSON Schemas of what an agent reads and writes, rendered from the Zod
// authorities of this installation. The skill names them, and `archboard model
// schema` prints them, so they always match the installed program and no copy
// of the skill has to carry them.

import { z } from "zod";
import { ArchitectureModelSchema } from "#shared/canonical-contracts/schemas/model.ts";
import { ArchitectureModuleEditSchema } from "#shared/canonical-contracts/schemas/model-operations.ts";
import { ArchitectureMigrationRequestSchema } from "#shared/schemas/migration-installation.ts";
import {
	ArchitectureImportRequestSchema,
	ArchitectureInitializationRequestSchema,
} from "#shared/schemas/model-portable.ts";
import { VaultConfigurationSchema } from "#shared/schemas/vault-configuration.ts";

/** The JSON that `model edit` reads. `--doing` gives the doing line, so the JSON leaves it out. */
const [correction, proposal, description, batch] = ArchitectureModuleEditSchema.options;
const ModelEditRequestSchema = z.union([
	correction.omit({ doing: true }),
	proposal.omit({ doing: true }),
	description.omit({ doing: true }),
	batch.omit({ doing: true }),
]);

/** The schemas, by the names the skill uses, in the order it lists them. */
const SCHEMA_NAMES = [
	"model-manifest",
	"module",
	"flows",
	"model-initialize",
	"model-edit",
	"model-import",
	"model-migrate",
	"vault-config",
] as const;

/** The name of a printed schema. */
type ModelSchemaName = (typeof SCHEMA_NAMES)[number];

/** Each schema by its name: its title and the Zod authority it renders. */
const SCHEMAS: Readonly<Record<ModelSchemaName, readonly [string, z.ZodType]>> = {
	"model-manifest": ["Canonical model manifest", ArchitectureModelSchema.shape.manifest],
	module: [
		"Canonical module definition",
		ArchitectureModelSchema.shape.modules.element.omit({ file: true }),
	],
	flows: [
		"Independent flow collection",
		ArchitectureModelSchema.shape.collections.element.omit({ file: true }),
	],
	"model-initialize": ["Canonical initialization intent", ArchitectureInitializationRequestSchema],
	"model-edit": ["Claimed canonical edit intent", ModelEditRequestSchema],
	"model-import": ["Portable canonical installation", ArchitectureImportRequestSchema],
	"model-migrate": ["Explicit legacy migration intent", ArchitectureMigrationRequestSchema],
	"vault-config": ["Shared semantic vocabulary", VaultConfigurationSchema],
};

/** A printed schema as a list names it. */
interface ModelSchemaListing {
	readonly name: ModelSchemaName;
	readonly title: string;
}

/**
 * The printed schemas, in the order the skill lists them.
 * @returns Each schema's name and title.
 */
function describeModelSchema(): readonly ModelSchemaListing[];
/**
 * One JSON Schema, as an editor or a validator reads it: the input that the runtime accepts.
 * @param name The schema's name.
 * @returns The JSON Schema.
 */
function describeModelSchema(name: ModelSchemaName): Record<string, unknown>;
/**
 * The printed schemas, or one of them.
 * @param name The schema's name, or nothing for the list.
 * @returns The list, or the JSON Schema.
 */
function describeModelSchema(
	name?: ModelSchemaName,
): readonly ModelSchemaListing[] | Record<string, unknown> {
	if (name === undefined) {
		return SCHEMA_NAMES.map((listed) => ({ name: listed, title: SCHEMAS[listed][0] }));
	}
	const [title, schema] = SCHEMAS[name];
	return {
		$id: `https://archboard.local/schemas/${name}.schema.json`,
		title,
		...z.toJSONSchema(schema, { io: "input" }),
		"x-archboard": {
			runtimeObligations: [
				"The complete canonical candidate must be coherent.",
				"Continuing identities remain stable.",
				"A write requires its complete revision, intent, and claim.",
			],
		},
	};
}

export { describeModelSchema, type ModelSchemaListing, type ModelSchemaName };

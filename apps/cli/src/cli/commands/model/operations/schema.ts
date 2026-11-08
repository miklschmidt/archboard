// The JSON Schemas of what an agent reads and writes, rendered from the Zod
// authorities of this installation. The skill names them and reads them through
// this command, so they always match the installed program and no copy of the
// skill has to carry them.

import { z } from "zod";
import {
	ArchitectureModelReadSchema,
	ArchitectureInitializationRequestSchema,
	ArchitectureModuleEditSchema,
	ArchitectureImportRequestSchema,
	ArchitectureMigrationRequestSchema,
} from "@archboard/model/contract";
import { VaultConfigurationSchema } from "@archboard/model/vault-policy";
import { defineCommand } from "#cli/contract/protocol/contract.ts";

const model = ArchitectureModelReadSchema.options[0];

/** The schemas, by the names that the skill uses. */
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
type SchemaName = (typeof SCHEMA_NAMES)[number];

/** Each schema by its name: its title and the Zod authority it renders. */
const SCHEMAS: Readonly<Record<SchemaName, readonly [string, z.ZodType]>> = {
	"model-manifest": ["Canonical model manifest", model.shape.manifest],
	module: ["Canonical module definition", model.shape.modules.element.omit({ file: true })],
	flows: ["Independent flow collection", model.shape.collections.element.omit({ file: true })],
	"model-initialize": ["Canonical initialization intent", ArchitectureInitializationRequestSchema],
	"model-edit": ["Claimed canonical edit intent", ArchitectureModuleEditSchema],
	"model-import": ["Portable canonical installation", ArchitectureImportRequestSchema],
	"model-migrate": ["Explicit legacy migration intent", ArchitectureMigrationRequestSchema],
	"vault-config": ["Shared semantic vocabulary", VaultConfigurationSchema],
};

/**
 * One JSON Schema, as an editor or a validator reads it: the input that the runtime accepts.
 * @param name The schema's name.
 * @returns The JSON Schema.
 */
function jsonSchema(name: SchemaName): Record<string, unknown> {
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

const SchemaListSchema = z.object({
	schemas: z.array(z.object({ name: z.enum(SCHEMA_NAMES), title: z.string() })),
});

const modelSchemaContract = defineCommand({
	path: ["model", "schema"],
	shared: [],
	summary: "List the JSON Schemas of the model files and requests, or print one",
	description: [
		"Without a name, lists each schema's name and title. With a name, prints that JSON Schema, rendered from the validation of this installation.",
		"",
		"Needs no server and no vault.",
		"",
		"A valid shape is not yet valid architecture. A write also checks:",
		"- Names.",
		"- Identities.",
		"- The claim.",
		"- The complete revision.",
	].join("\n"),
	examples: ["archboard model schema", "archboard model schema model-edit"],
	parameters: [
		{
			kind: "positional",
			key: "name",
			name: "name",
			placeholder: SCHEMA_NAMES.join("|"),
			description: "The schema to print",
		},
	],
	input: { ingress: z.object({ name: z.enum(SCHEMA_NAMES).optional() }) },
	result: z.union([SchemaListSchema, z.record(z.string(), z.unknown())]),
	output: {
		cases: [
			{ id: "json", when: {}, mode: "json", description: "The schema list, or one JSON Schema" },
		],
		/**
		 * Select the only output case.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	/**
	 * List the schemas, or print the named one.
	 * @param input The schema name, when one was given.
	 * @returns The list or the schema.
	 */
	async handler(input) {
		if (input.name !== undefined) return { result: jsonSchema(input.name) };
		return {
			result: { schemas: SCHEMA_NAMES.map((name) => ({ name, title: SCHEMAS[name][0] })) },
		};
	},
});

export { SCHEMA_NAMES, jsonSchema, modelSchemaContract };

// The JSON Schemas of what an agent reads and writes, rendered from the Zod
// authorities of this installation. The skill names them and reads them through
// this command, so they always match the installed program and no copy of the
// skill has to carry them.

import { z } from "zod";
import { describeModelSchema, type ModelSchemaName } from "@archboard/model-contract";
import { defineCommand } from "#cli/contract/protocol/contract.ts";

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
] as const satisfies readonly ModelSchemaName[];

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
		if (input.name !== undefined) return { result: describeModelSchema(input.name) };
		return { result: { schemas: describeModelSchema() } };
	},
});

export { SCHEMA_NAMES, modelSchemaContract };

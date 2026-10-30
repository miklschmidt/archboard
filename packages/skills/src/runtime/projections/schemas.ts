import { z } from "zod";
import {
	ArchitectureModelReadSchema,
	ArchitectureInitializationRequestSchema,
	ArchitectureModuleEditSchema,
	ArchitectureImportRequestSchema,
	ArchitectureMigrationRequestSchema,
} from "@archboard/board/model";
import { SemanticBoardConfigurationSchema } from "@archboard/board/vault-policy";
interface GeneratedSchema {
	readonly file: string;
	readonly purpose: string;
	readonly schema: Record<string, unknown>;
}
/**
 * Generate consumer schemas from the canonical runtime authorities.
 * @returns The current manifest, definitions, requests, and shared vocabulary.
 */
function generatedSchemas(): GeneratedSchema[] {
	const model = ArchitectureModelReadSchema.options[0];
	const definitions = [
		["model-manifest.schema.json", "Canonical model manifest", model.shape.manifest],
		[
			"module.schema.json",
			"Canonical module definition",
			model.shape.modules.element.omit({ file: true }),
		],
		[
			"flows.schema.json",
			"Independent flow collection",
			model.shape.collections.element.omit({ file: true }),
		],
		[
			"model-initialize.schema.json",
			"Canonical initialization intent",
			ArchitectureInitializationRequestSchema,
		],
		["model-edit.schema.json", "Claimed canonical edit intent", ArchitectureModuleEditSchema],
		[
			"model-import.schema.json",
			"Portable canonical installation",
			ArchitectureImportRequestSchema,
		],
		[
			"model-migrate.schema.json",
			"Explicit legacy migration intent",
			ArchitectureMigrationRequestSchema,
		],
		["vault-config.schema.json", "Shared semantic vocabulary", SemanticBoardConfigurationSchema],
	] as const;
	return definitions.map(([file, purpose, schema]) => ({
		file,
		purpose,
		schema: {
			$id: `https://archboard.local/schemas/${file}`,
			title: purpose,
			...z.toJSONSchema(schema, { io: "input" }),
			"x-archboard": {
				runtimeObligations: [
					"The complete canonical candidate must be coherent.",
					"Continuing identities remain stable.",
					"A write requires its complete revision, intent, and claim.",
				],
			},
		},
	}));
}
export { generatedSchemas, type GeneratedSchema };

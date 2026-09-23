// The JSON Schemas the skill ships, generated from the Zod schemas that are the
// only authority on what a board, a configuration or an authoring payload is.
//
// Nothing here is a second description of anything. Each document is the Zod
// schema rendered by Zod's own JSON Schema writer, with the identity and
// purpose an agent needs stamped on top, and with the checks JSON Schema cannot
// express — reference integrity, acyclic containment, configured vocabulary —
// named as runtime obligations rather than silently left out.

import { z } from "zod";
import {
	BoardCreateInputSchema,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	VariantEditInputSchema,
} from "@/shared/semantic-board/index";
import { SemanticBoardConfigurationSchema } from "@/runtime/semantic-board-store/index";

/** One generated schema: where it goes, and the document itself. */
interface GeneratedSchema {
	/** The file name under the skill's `references/generated/` directory. */
	readonly file: string;
	/** What the schema describes, in a sentence. */
	readonly purpose: string;
	/** The JSON Schema document, ready to write. */
	readonly schema: Readonly<Record<string, unknown>>;
}

/** The checks a board document must also pass, which its JSON Schema cannot say. */
const BOARD_RUNTIME_OBLIGATIONS = [
	"within each variant, node, edge, flow, step, walkthrough and beat ids share one namespace and are unique; inherited subject ids may repeat across variants",
	"board, variant and board-owned view ids do not collide with each other or with ids used on any variant",
	"variant ids and names and board-owned view ids and names are unique; current is reserved as a designation rather than a variant name",
	"the schemaVersion major is supported by this build; at most one variant has lifecycle current, and current is present exactly when one does and names it (a board for something nobody has built has none)",
	"every variant.parent names another variant and variant ancestry is acyclic",
	"reconciliation names the variant's parent, refers only to variants in the family, and cannot claim a future board version",
	"edge ends, flow participants and step ends name valid nodes, each step end is a participant, and flow names are unique within a variant",
	"walkthrough names are unique within a variant, every walkthrough has a beat, beat subjects have supported kinds, and beat views name board-owned views",
	"containment (node.parent) resolves within its variant and is acyclic",
	"persisted group memberships are unique and in canonical order; flow self steps, nonempty view selections and reconciliation standing satisfy their cross-field rules",
	"node.groups, node.kind, edge.kind and level are keys the vault configuration defines",
	"a valid configuration refuses newly authored unknown vocabulary; retained references stay readable with warnings",
];

/** The checks a configuration must also pass, which its JSON Schema cannot say. */
const CONFIG_RUNTIME_OBLIGATIONS = [
	"removing a level, kind or group the boards still reference keeps them readable and reports each reference",
];

/** The checks an authoring payload must also pass, which its JSON Schema cannot say. */
const AUTHORING_RUNTIME_OBLIGATIONS = [
	"a name reference resolves to exactly one node of the variant; an ambiguous name is refused",
	"a stated id names a subject already on the variant; new subjects leave the id out",
	"a same-write handle (as) is spent within the write and never persisted",
	"input strings are trimmed before their length and nonempty constraints are checked",
	"the resulting family passes every board obligation; a write that would not is refused whole",
];

/**
 * One schema with its identity and purpose stamped on.
 * @param file The file name.
 * @param title What the schema is called.
 * @param purpose What it describes.
 * @param schema The rendered schema.
 * @param obligations What the runtime checks beyond it.
 * @returns The generated schema.
 */
function stamped(
	file: string,
	title: string,
	purpose: string,
	schema: Record<string, unknown>,
	obligations: readonly string[],
): GeneratedSchema {
	const { $schema, ...rest } = schema;
	return {
		file,
		purpose,
		schema: {
			$schema,
			$id: `https://archboard.local/schemas/${file}`,
			title,
			description: purpose,
			"x-archboard": {
				semanticBoardSchemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
				runtimeObligations: obligations,
			},
			...rest,
		},
	};
}

/**
 * Every schema the skill ships, in the order the guidance lists them.
 * @returns The schemas, rendered fresh.
 */
function generatedSchemas(): GeneratedSchema[] {
	return [
		stamped(
			"semantic-board.schema.json",
			"Archboard semantic board document",
			`One persisted board family as the vault stores it (schemaVersion ${SEMANTIC_BOARD_SCHEMA_VERSION}): every variant, its lifecycle, ancestry and content. This is what the store writes and semantic show reads, not what an agent sends.`,
			z.toJSONSchema(SemanticBoardSchema, { io: "output" }),
			BOARD_RUNTIME_OBLIGATIONS,
		),
		stamped(
			"vault-config.schema.json",
			"Archboard vault configuration",
			"The .archboard/config.yaml a vault's consumer authors: levels, node kinds with icons and colors, relationship kinds, and groups.",
			z.toJSONSchema(SemanticBoardConfigurationSchema, { io: "input" }),
			CONFIG_RUNTIME_OBLIGATIONS,
		),
		stamped(
			"semantic-create-input.schema.json",
			"Archboard semantic new payload",
			"The JSON an agent gives semantic new: a board's level and initial content, with subjects named rather than identified. The board's name is the command's positional argument, not a field of the payload.",
			// The command supplies the name from its own argument, so the payload an
			// agent writes is the create input without it.
			z.toJSONSchema(BoardCreateInputSchema.omit({ name: true }), { io: "input" }),
			AUTHORING_RUNTIME_OBLIGATIONS,
		),
		stamped(
			"semantic-edit-input.schema.json",
			"Archboard semantic edit payload",
			"The JSON an agent gives semantic edit: one batch of stated subjects and removals against one variant, with names, ids or same-write handles as references.",
			z.toJSONSchema(VariantEditInputSchema, { io: "input" }),
			AUTHORING_RUNTIME_OBLIGATIONS,
		),
	];
}

export { generatedSchemas, type GeneratedSchema };

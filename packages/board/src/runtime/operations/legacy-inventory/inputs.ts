import { errorMessage } from "@archboard/diagnostics/errno";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import { SemanticBoardConfigurationSchema } from "#runtime/store/configuration.ts";
import { decodeSemanticBoardDocument } from "#runtime/store/format/decode.ts";
import { unknownVocabularyReferences } from "#runtime/operations/check/vocabulary.ts";
import { migrationConflict } from "#shared/rules/legacy-inventory/conflict.ts";

/**
 * Decode one original document in memory while retaining its exact source text.
 * @param file The original relative path.
 * @param bytes The exact original bytes.
 * @param diagnostics Unreadable document diagnostics.
 * @returns The original source with its normalized reading when supported.
 */
function decodeLegacyInput(
	file: string,
	bytes: Buffer,
	diagnostics: LegacyInventory["diagnostics"],
): LegacyInventory["boards"][number] {
	const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	const decoded = decodeSemanticBoardDocument(source);
	if (decoded.ok) return { file, source, document: decoded.board };
	diagnostics.push({
		code: "LEGACY_INVALID",
		file,
		message: decoded.problem,
		recovery: "Repair the original document explicitly, then inventory it again.",
	});
	return { file, source };
}

/**
 * Decode the captured policy without substituting bundled vocabulary.
 * @param bytes The exact policy input, when present.
 * @param diagnostics Invalid or absent policy evidence.
 * @returns The original policy, or undefined when it needs an owner choice.
 */
function decodeLegacyPolicy(
	bytes: Buffer | undefined,
	diagnostics: LegacyInventory["diagnostics"],
): LegacyInventory["policy"] {
	try {
		return SemanticBoardConfigurationSchema.parse(
			Bun.YAML.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
		);
	} catch (error) {
		diagnostics.push({
			code: "INVALID_POLICY",
			file: ".archboard/config.yaml",
			message: errorMessage(error),
			recovery: "Record a policy choice. Inventory never substitutes bundled defaults.",
		});
		return undefined;
	}
}

/**
 * Locate unknown vocabulary through the existing policy authority, including retained bases.
 * @param inventory The exact source, policy, original families and selected namespace.
 * @returns Policy decisions that the owner must resolve before composition.
 */
function legacyPolicyConflicts(
	inventory: Pick<LegacyInventory, "boards" | "policy" | "plan" | "source">,
): LegacyInventory["conflicts"] {
	const { policy } = inventory;
	if (policy === undefined)
		return [
			migrationConflict(inventory, "policy", [
				{ file: ".archboard/config.yaml", path: ".", value: null },
			]),
		];
	return inventory.boards.flatMap(({ file, document }) => {
		if (document === undefined) return [];
		return unknownVocabularyReferences(document, policy).map((reference) =>
			migrationConflict(inventory, "policy", [
				{
					file,
					state: reference.variant,
					subject:
						reference.subject === undefined
							? undefined
							: `${inventory.plan.origin}/${document.id}#${reference.subject.id}`,
					path: reference.path,
					value: { vocabulary: reference.vocabulary, key: reference.value },
				},
			]),
		);
	});
}
export { decodeLegacyInput, decodeLegacyPolicy, legacyPolicyConflicts };

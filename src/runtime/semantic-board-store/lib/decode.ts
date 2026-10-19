// Decode a board document without reading a vault, claiming a board or
// persisting a migration. The disk reader and the history lens use exactly
// the same legacy checks, registered migrations and canonical validation.

import { migrateSemanticBoardDocument } from "@/runtime/semantic-board-store/lib/migrations";
import { parseSemanticBoard, type SemanticBoardParse } from "@/shared/semantic-board/index";
import { errorMessage } from "@archboard/diagnostics/errno";

type DecodedSemanticBoard =
	| (Extract<SemanticBoardParse, { readonly ok: true }> & {
			/** Migrated raw JSON, kept for persistence without introducing parser defaults. */
			readonly value: unknown;
			readonly changed: boolean;
	  })
	| Extract<SemanticBoardParse, { readonly ok: false }>;

/**
 * Decode and migrate board bytes in memory, refusing malformed or unsupported
 * old documents. This performs no file access and changes no board version or
 * timestamp. The store's disk read alone may persist a validated migration.
 * @param text The JSON document, from disk or a historical Git blob.
 * @returns A coherent current-shape board and its migrated raw document, or a refusal.
 */
function decodeSemanticBoardDocument(text: string): DecodedSemanticBoard {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return { ok: false, problem: `not JSON: ${errorMessage(error)}` };
	}
	const legacy = legacyGroupProblem(value);
	if (legacy !== null) return { ok: false, problem: legacy };
	const migration = migrateSemanticBoardDocument(value);
	if (!migration.ok) return migration;
	const parsed = parseSemanticBoard(migration.value);
	return parsed.ok ? { ...parsed, value: migration.value, changed: migration.changed } : parsed;
}

/**
 * The one-time conversion a document from before schema 2.2.0 needs, when it
 * needs one.
 *
 * Nodes used to carry a free-text `group` label; they now carry `groups`, a
 * list of ids the vault configuration defines. The store never rewrites a
 * board it was not asked to write, and a label is not an id — "the write
 * path" has to become some configured key somebody chose — so the file is
 * refused with exactly what to do, rather than read with the membership
 * silently dropped or a key invented for it.
 * @param value The document as parsed from disk, before the contract sees it.
 * @returns The conversion to make, or null when nothing in it is legacy.
 */
function legacyGroupProblem(value: unknown): string | null {
	const labelled = legacyGroupedNodes(value);
	if (labelled.length === 0) {
		return null;
	}
	const listed = labelled.map(({ name, group }) => `${JSON.stringify(name)} (${group})`).join(", ");
	return (
		`this board is from before schema 2.2.0 and ${labelled.length} node(s) still carry the ` +
		`retired singular "group" label: ${listed}. Convert it by hand once: define each group ` +
		`under "groups" in .archboard/config.yaml with a stable id, replace every node's ` +
		`"group": "<label>" with "groups": ["<id>"], and set "schemaVersion" to "2.2.0". ` +
		"Nothing is rewritten for you, so no membership is lost and no id is invented."
	);
}

/** One node still carrying the retired label, as far as the refusal needs to name it. */
interface LegacyGroupedNode {
	readonly name: string;
	readonly group: string;
}

/**
 * Every node of every variant that still carries a singular `group`.
 * @param value The document as parsed from disk.
 * @returns The nodes, with the label each carries.
 */
function legacyGroupedNodes(value: unknown): LegacyGroupedNode[] {
	const variants = isRecord(value) ? value["variants"] : undefined;
	if (!Array.isArray(variants)) {
		return [];
	}
	return variants.flatMap(nodesOfVariant).flatMap((node) => {
		const label = legacyLabel(node);
		return label === null ? [] : [label];
	});
}

/**
 * The nodes one decoded variant holds, whatever shape it turned out to be.
 * @param variant One entry of the document's variants.
 * @returns Its nodes, or none when it holds nothing readable.
 */
function nodesOfVariant(variant: unknown): unknown[] {
	const content = isRecord(variant) ? variant["content"] : undefined;
	const nodes = isRecord(content) ? content["nodes"] : undefined;
	return Array.isArray(nodes) ? nodes : [];
}

/**
 * The retired label one decoded node carries, when it carries one.
 * @param node One decoded node.
 * @returns What to call the node and the label, or null when it has none.
 */
function legacyLabel(node: unknown): LegacyGroupedNode | null {
	if (!isRecord(node) || typeof node["group"] !== "string") {
		return null;
	}
	const name = typeof node["name"] === "string" ? node["name"] : "?";
	return { name, group: node["group"] };
}

/**
 * Whether a decoded JSON value is a plain object.
 * @param value The value.
 * @returns True for an object that is neither null nor an array.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export { type DecodedSemanticBoard, decodeSemanticBoardDocument };

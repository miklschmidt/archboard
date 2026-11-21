import { parseDocument, type VariantContent } from "@archboard/model-contract";

/**
 * Whether a standing is something a model may hold: it is written on a variant and read back after
 * a restart, so a value the contract refused would make the model unreadable.
 * @param standing What a variant is waiting on, as written.
 * @param content The variant's own content.
 * @returns The reading of the board that holds it, so a failure carries the contract's reason.
 */
export function readStanding(standing: Record<string, unknown>, content: VariantContent) {
	return parseDocument("legacyBoard", {
		schemaVersion: "2.5.0",
		kind: "semantic-board",
		id: "bd",
		name: "payments",
		level: "system",
		version: 3,
		createdAt: "2026-09-27T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		variants: [
			{ id: "v1", name: "Before", lifecycle: "historical", content },
			{
				id: "v2",
				name: "After",
				lifecycle: "draft",
				parent: "v1",
				content,
				reconciliation: standing,
			},
		],
	});
}

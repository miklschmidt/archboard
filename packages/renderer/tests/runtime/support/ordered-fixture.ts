import { type VariantContent } from "@archboard/model-contract";
import { fixtureDocument } from "#tests/runtime/support/model-documents.ts";

/**
 * Supply orders for old fixture arrays; explicit test orders take precedence. A repeated order is
 * nudged just past the one it repeats, so the contract's one-order-per-subject rule holds and the
 * array still reads in the order the repeat had by position.
 */
function ordered(items: unknown): unknown {
	if (!Array.isArray(items)) return items;
	const used = new Set<number>();
	return items.map((item, index) => {
		let order: number = item.order ?? (index + 1) * 1000;
		while (used.has(order)) order += 1;
		used.add(order);
		return { ...item, order };
	});
}

/** Give legacy renderer test inputs authored order before strict content validation. */
export function orderedFixture(value: unknown): VariantContent {
	const content = value as Record<string, unknown>;
	return fixtureDocument("variantContent", {
		...content,
		...(content["nodes"] === undefined ? {} : { nodes: ordered(content["nodes"]) }),
		...(content["edges"] === undefined ? {} : { edges: ordered(content["edges"]) }),
	});
}

import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";

/** Supply orders for old fixture arrays; explicit test orders take precedence. */
function ordered(items: unknown): unknown {
	return Array.isArray(items)
		? items.map((item, index) => ({ ...item, order: item.order ?? (index + 1) * 1000 }))
		: items;
}

/** Give legacy renderer test inputs authored order before strict content validation. */
export function orderedFixture(value: unknown): VariantContent {
	const content = value as Record<string, unknown>;
	return VariantContentSchema.parse({
		...content,
		...(content["nodes"] === undefined ? {} : { nodes: ordered(content["nodes"]) }),
		...(content["edges"] === undefined ? {} : { edges: ordered(content["edges"]) }),
	});
}

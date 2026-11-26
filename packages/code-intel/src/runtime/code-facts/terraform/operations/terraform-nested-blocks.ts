// Depth-1 named nested blocks and 1-hop intra-resource sibling name links
// inside Terraform and OpenTofu `resource` blocks (ADR 0046, TASK-682.03).
//
// Only unique `(blockType, literalName)` depth-1 nested blocks of a managed
// resource emit `visibility: "block"` definitions and participate in sibling
// links. Sibling links store only resolved canonical block symbols, never raw
// attribute string values.

import type { Node } from "web-tree-sitter";
import type { Definition, SiblingLink } from "#runtime/code-facts/operations/facts.ts";
import { sourceRange } from "#runtime/code-facts/operations/spans.ts";
import { decodeHclString } from "#runtime/code-facts/terraform/operations/terraform-address.ts";

/** A string template interpolation or directive marker. */
const TEMPLATE_MARKER = /[$%]\{/u;

/** One attribute name and value expression node inside a block body. */
interface AttributeExpr {
	readonly name: string;
	readonly expression: Node;
}

/** One candidate depth-1 named nested block inside a resource body. */
interface NamedNestedBlock {
	readonly blockType: string;
	readonly name: string;
	readonly key: string;
	readonly node: Node;
	readonly body: Node | undefined;
}

/** One unique depth-1 named nested block with its canonical symbol. */
interface UniqueNestedBlock extends NamedNestedBlock {
	readonly symbol: string;
}

/** Nested-block definitions and 1-hop sibling links of one resource block. */
interface ResourceNestedFacts {
	readonly definitions: readonly Definition[];
	readonly siblingLinks: readonly SiblingLink[];
}

/**
 * The single named child of a node when the node has the expected type.
 * @param node The parent node.
 * @param type The required node type of the parent.
 * @returns Its sole named child, or undefined.
 */
function onlyChild(node: Node | undefined, type: string): Node | undefined {
	return node?.type === type && node.namedChildren.length === 1 ? node.namedChildren[0] : undefined;
}

/**
 * The `string_lit` node inside a plain literal expression, if any.
 * @param expression An attribute's value node.
 * @returns The `string_lit` node, or undefined when the expression is not a single literal string.
 */
function literalStringNode(expression: Node | undefined): Node | undefined {
	const literal = onlyChild(expression, "expression");
	const stringLit = onlyChild(literal, "literal_value");
	return stringLit?.type === "string_lit" ? stringLit : undefined;
}

/**
 * The unescaped string value of a plain literal double-quoted HCL expression,
 * rejecting template interpolations and directives.
 * @param expression The expression node.
 * @returns The decoded literal string, or undefined when not a plain literal.
 */
function literalStringValue(expression: Node | undefined): string | undefined {
	const stringLit = literalStringNode(expression);
	if (stringLit === undefined || TEMPLATE_MARKER.test(stringLit.text)) return undefined;
	return decodeHclString(stringLit.text);
}

/**
 * Literal double-quoted string values carried by an attribute's expression:
 * either a single literal string or the literal string elements of a literal
 * HCL tuple, ignoring non-literal elements.
 * @param expression The attribute's value node.
 * @returns The decoded literal strings in order.
 */
function literalStringsOf(expression: Node | undefined): string[] {
	const single = literalStringValue(expression);
	if (single !== undefined) return [single];
	const tuple = onlyChild(onlyChild(expression, "expression"), "collection_value");
	if (tuple?.type !== "tuple") return [];
	return tuple.namedChildren.flatMap((child) => {
		const value = literalStringValue(child);
		return value === undefined ? [] : [value];
	});
}

/**
 * A nested block's identifier kind and body node.
 * @param block The block node.
 * @returns Its kind and body.
 */
function blockParts(block: Node): { readonly kind: string; readonly body: Node | undefined } {
	const [kind] = block.namedChildren;
	return {
		kind: kind?.type === "identifier" ? kind.text : "",
		body: block.namedChildren.find((node) => node.type === "body"),
	};
}

/**
 * The attributes directly in a block's body.
 * @param body The body node.
 * @returns Each direct attribute's name and value expression.
 */
function directAttributes(body: Node | undefined): AttributeExpr[] {
	return (body?.namedChildren ?? []).flatMap((node) => {
		if (node.type !== "attribute") return [];
		const [name, expression] = node.namedChildren;
		return name === undefined || expression === undefined ? [] : [{ name: name.text, expression }];
	});
}

/**
 * Every attribute anywhere inside a block's body, including deeper sub-blocks.
 * @param body The body node.
 * @returns All attributes in document order.
 */
function attributesDeep(body: Node | undefined): AttributeExpr[] {
	return (body?.namedChildren ?? []).flatMap((node) => {
		if (node.type === "attribute") {
			const [name, expression] = node.namedChildren;
			return name === undefined || expression === undefined
				? []
				: [{ name: name.text, expression }];
		}
		return node.type === "block" ? attributesDeep(blockParts(node).body) : [];
	});
}

/**
 * The unescaped value of a direct literal double-quoted `name` attribute on a
 * nested block body, rejecting template interpolations and directives.
 * @param body The nested block's body.
 * @returns The unescaped literal string, or undefined when absent or non-literal.
 */
function literalBlockName(body: Node | undefined): string | undefined {
	const found = directAttributes(body).find((attribute) => attribute.name === "name");
	return literalStringValue(found?.expression);
}

/**
 * Candidate depth-1 named nested blocks directly inside a resource body,
 * skipping `dynamic` blocks and blocks without a direct literal `name`.
 * @param body The resource block's body.
 * @returns Each candidate nested block in document order.
 */
function namedNestedBlocks(body: Node | undefined): NamedNestedBlock[] {
	return (body?.namedChildren ?? []).flatMap((node) => {
		if (node.type !== "block") return [];
		const { kind: blockType, body: inner } = blockParts(node);
		if (blockType === "" || blockType === "dynamic") return [];
		const name = literalBlockName(inner);
		return name === undefined
			? []
			: [{ blockType, name, key: `${blockType}\0${name}`, node, body: inner }];
	});
}

/**
 * Unique depth-1 named nested blocks of a top-level `resource` block;
 * duplicated `(blockType, literalName)` pairs within the same resource emit no
 * definition and participate in no sibling links.
 * @param resourceSymbol The enclosing resource's canonical address.
 * @param body The resource block's body.
 * @returns Its unique nested blocks in document order.
 */
function uniqueNestedBlocks(resourceSymbol: string, body: Node | undefined): UniqueNestedBlock[] {
	const candidates = namedNestedBlocks(body);
	const counts = new Map<string, number>();
	for (const candidate of candidates) {
		counts.set(candidate.key, (counts.get(candidate.key) ?? 0) + 1);
	}
	return candidates.flatMap((candidate) =>
		counts.get(candidate.key) === 1
			? [
					{
						...candidate,
						symbol: `${resourceSymbol}.${candidate.blockType}[${JSON.stringify(candidate.name)}]`,
					},
				]
			: [],
	);
}

/**
 * Whether an attribute name contains a sibling's block type as an
 * underscore-bounded segment (matching `http_listener_name`,
 * `default_http_listener_name`, and `backend_address_pool_names` while
 * rejecting substring false matches like `overrule_name` for `rule`).
 * @param attrName The attribute name.
 * @param blockType The sibling block's type.
 * @returns True when `blockType` appears as an underscore-bounded segment.
 */
function matchesBlockType(attrName: string, blockType: string): boolean {
	return (
		attrName === blockType ||
		attrName.startsWith(`${blockType}_`) ||
		attrName.endsWith(`_${blockType}`) ||
		attrName.includes(`_${blockType}_`)
	);
}

/**
 * Whether an attribute's name and literal string values reference a distinct
 * sibling block in the same resource.
 * @param source The block holding the attribute.
 * @param attrName The attribute's name.
 * @param values The attribute's extracted literal string values.
 * @param target A candidate sibling block.
 * @returns True when the attribute references `target`.
 */
function matchesSibling(
	source: UniqueNestedBlock,
	attrName: string,
	values: readonly string[],
	target: UniqueNestedBlock,
): boolean {
	return (
		target.symbol !== source.symbol &&
		matchesBlockType(attrName, target.blockType) &&
		values.includes(target.name)
	);
}

/**
 * Resolved 1-hop sibling links produced by one attribute of a nested block.
 * @param source The block holding the attribute.
 * @param attribute The attribute and its value expression.
 * @param siblings All unique nested blocks of the resource.
 * @param seen Pairs already recorded, keyed by `from\0to`.
 * @returns New deduplicated sibling links.
 */
function linksForAttribute(
	source: UniqueNestedBlock,
	attribute: AttributeExpr,
	siblings: readonly UniqueNestedBlock[],
	seen: Set<string>,
): SiblingLink[] {
	const values = literalStringsOf(attribute.expression);
	if (values.length === 0) return [];
	const found: SiblingLink[] = [];
	for (const target of siblings) {
		if (!matchesSibling(source, attribute.name, values, target)) continue;
		const key = `${source.symbol}\0${target.symbol}`;
		if (!seen.has(key)) {
			seen.add(key);
			found.push({ from: source.symbol, to: target.symbol });
		}
	}
	return found;
}

/**
 * Deduplicated 1-hop sibling name links among unique depth-1 named nested
 * blocks of one resource.
 * @param blocks The resource's unique nested blocks.
 * @returns Resolved sibling links in document order.
 */
function siblingLinksIn(blocks: readonly UniqueNestedBlock[]): SiblingLink[] {
	if (blocks.length < 2) return [];
	const seen = new Set<string>();
	return blocks.flatMap((source) =>
		attributesDeep(source.body).flatMap((attribute) =>
			linksForAttribute(source, attribute, blocks, seen),
		),
	);
}

/**
 * A nested-block definition over its node's lines.
 * @param block The unique nested block.
 * @returns Its `visibility: "block"` definition.
 */
function blockDefinition(block: UniqueNestedBlock): Definition {
	return {
		symbol: block.symbol,
		kind: "value",
		start: block.node.startPosition.row + 1,
		end: block.node.endPosition.row + 1,
		source: sourceRange(block.node),
		visibility: "block",
		exposed: false,
	};
}

/**
 * Extract unique depth-1 named nested-block definitions and 1-hop intra-resource
 * sibling links for one top-level `resource` block.
 * @param resourceSymbol The enclosing resource's canonical address.
 * @param body The resource block's body.
 * @returns Its nested-block definitions and resolved sibling links.
 */
function resourceNestedFacts(resourceSymbol: string, body: Node | undefined): ResourceNestedFacts {
	const blocks = uniqueNestedBlocks(resourceSymbol, body);
	return {
		definitions: blocks.map(blockDefinition),
		siblingLinks: siblingLinksIn(blocks),
	};
}

export { type ResourceNestedFacts, resourceNestedFacts };

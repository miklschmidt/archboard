// Depth-1 named nested blocks and 1-hop intra-resource sibling name links
// inside Terraform and OpenTofu `resource` blocks (ADR 0046, TASK-682.03).
//
// Only unique `(blockType, literalName)` depth-1 nested blocks of a managed
// resource emit `visibility: "block"` definitions and participate in sibling
// links. Sibling links store only resolved canonical block symbols, never raw
// attribute string values.

import type { Node } from "web-tree-sitter";
import type { Definition, SiblingLink, Unparsed } from "#runtime/code-facts/operations/facts.ts";
import { sourceRange } from "#runtime/code-facts/operations/spans.ts";
import { decodeHclString } from "#runtime/code-facts/terraform/operations/terraform-address.ts";

/** AST node types that mark dynamic HCL template interpolation or directives. */
const DYNAMIC_TEMPLATE_NODES = new Set(["template_interpolation", "template_directive"]);

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

/** Nested-block definitions, sibling links, ambiguous duplicates, and unfollowed blocks of one resource. */
interface ResourceNestedFacts {
	readonly definitions: readonly Definition[];
	readonly siblingLinks: readonly SiblingLink[];
	readonly ambiguousSymbols: readonly string[];
	readonly unparsed: readonly Unparsed[];
}

/**
 * The named children of a syntax node, excluding HCL comments.
 * @param node The syntax node.
 * @returns Non-comment named children in source order.
 */
function syntaxChildren(node: Node | undefined): Node[] {
	return (node?.namedChildren ?? []).filter((child) => child.type !== "comment");
}

/**
 * The single non-comment named child of a node when the node has the expected type.
 * @param node The parent node.
 * @param type The required node type of the parent.
 * @returns Its sole meaningful child, or undefined.
 */
function onlyChild(node: Node | undefined, type: string): Node | undefined {
	if (node?.type !== type) return undefined;
	const children = syntaxChildren(node);
	return children.length === 1 ? children[0] : undefined;
}

/**
 * Whether a `string_lit` node contains any dynamic HCL template interpolation
 * or directive (escaped `$${` and `%%{` stay inside `template_literal`).
 * @param stringLit The string literal node.
 * @returns True when the string contains dynamic template syntax.
 */
function hasDynamicTemplate(stringLit: Node): boolean {
	return syntaxChildren(stringLit).some((child) => DYNAMIC_TEMPLATE_NODES.has(child.type));
}

/**
 * Unwrap parenthesized HCL `expression` wrappers (`((expr))` -> `expr`).
 * @param node The expression node.
 * @returns The innermost wrapped `expression` node.
 */
function unwrapExpression(node: Node | undefined): Node | undefined {
	let current = node;
	while (current?.type === "expression") {
		const inner = onlyChild(current, "expression");
		if (inner?.type !== "expression") break;
		current = inner;
	}
	return current;
}

/**
 * Split text into lines while preserving each line's original line ending (`\n` or `\r\n`).
 * @param text The raw text.
 * @returns The lines, each ending with its original newline sequence if present.
 */
function splitLinesPreservingEndings(text: string): string[] {
	const lines: string[] = [];
	let start = 0;
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] === "\n") {
			lines.push(text.slice(start, index + 1));
			start = index + 1;
		}
	}
	if (start < text.length) lines.push(text.slice(start));
	return lines;
}

/** Extended grapheme cluster segmenter matching HCL's `textseg.TokenGraphemeClusters`. */
const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * Count leading whitespace grapheme clusters on one segmented heredoc line.
 * @param clusters The grapheme clusters of the line without its trailing newline.
 * @returns Number of leading clusters whose first code point is Unicode whitespace.
 */
function leadingWhitespaceClusters(clusters: readonly string[]): number {
	const firstNonSpace = clusters.findIndex((cluster) => !/^\p{White_Space}/u.test(cluster));
	return firstNonSpace === -1 ? clusters.length : firstNonSpace;
}

/**
 * Split one heredoc body line into its grapheme clusters before the newline
 * ending, its leading whitespace grapheme count, whether it is whitespace-only,
 * and its original trailing newline sequence.
 * @param line One line, including its trailing newline.
 * @returns Segmented line info for HCL flush-heredoc indentation stripping.
 */
function segmentHeredocLine(line: string): {
	readonly clusters: readonly string[];
	readonly ending: string;
	readonly indent: number;
	readonly blank: boolean;
} {
	const match = /\r?\n$/u.exec(line);
	const ending = match ? match[0] : "";
	const content = line.slice(0, line.length - ending.length);
	const clusters = Array.from(GRAPHEME_SEGMENTER.segment(content), ({ segment }) => segment);
	const indent = leadingWhitespaceClusters(clusters);
	return { clusters, ending, indent, blank: indent === clusters.length };
}

/**
 * Minimum leading whitespace grapheme count across non-blank heredoc lines.
 * @param segmented The segmented heredoc lines.
 * @returns The minimum indent, or 0 when no non-blank lines have leading whitespace.
 */
function minHeredocIndent(segmented: readonly ReturnType<typeof segmentHeredocLine>[]): number {
	let min = Number.POSITIVE_INFINITY;
	for (const each of segmented) {
		if (!each.blank && each.indent < min) min = each.indent;
	}
	return Number.isFinite(min) ? min : 0;
}

/**
 * Strip the minimum common leading whitespace grapheme clusters from non-blank
 * lines of an indented HCL heredoc (`<<-`), preserving whitespace-only lines
 * and original line endings verbatim.
 * @param lines The raw body lines between opening and closing markers.
 * @returns The dedented lines.
 */
function stripHeredocIndent(lines: readonly string[]): string[] {
	const segmented = lines.map(segmentHeredocLine);
	const min = minHeredocIndent(segmented);
	if (min === 0) return [...lines];
	return segmented.map((each, index) =>
		each.blank ? (lines[index] ?? "") : `${each.clusters.slice(min).join("")}${each.ending}`,
	);
}

/**
 * Decode an interpolation-free HCL heredoc template (`<<EOF` or `<<-EOF`),
 * applying HCL indentation stripping for `<<-`, preserving original line
 * endings and trailing newline, and unescaping `$${` / `%%{` template escapes
 * without touching backslashes.
 * @param heredoc The `heredoc_template` node.
 * @returns The decoded string, or undefined when dynamic or malformed.
 */
function heredocLiteralValue(heredoc: Node): string | undefined {
	if (hasDynamicTemplate(heredoc)) return undefined;
	const lines = splitLinesPreservingEndings(heredoc.text);
	if (lines.length < 2) return undefined;
	const header = lines[0] ?? "";
	const bodyLines = lines.slice(1, -1);
	if (bodyLines.length === 0) return "";
	const dedented = header.startsWith("<<-") ? stripHeredocIndent(bodyLines) : bodyLines;
	return dedented.join("").replaceAll("$${", "${").replaceAll("%%{", "%{");
}

/**
 * Decode a double-quoted `literal_value` node when it holds no dynamic template.
 * @param literal The `literal_value` node.
 * @returns The decoded string, or undefined.
 */
function quotedLiteralValue(literal: Node): string | undefined {
	const stringLit = onlyChild(literal, "literal_value");
	if (stringLit?.type !== "string_lit" || hasDynamicTemplate(stringLit)) return undefined;
	return decodeHclString(stringLit.text, true);
}

/**
 * Decode a `template_expr` node when it is an interpolation-free heredoc.
 * @param template The `template_expr` node.
 * @returns The decoded heredoc string, or undefined.
 */
function templateLiteralValue(template: Node): string | undefined {
	const heredoc = onlyChild(template, "template_expr");
	return heredoc?.type === "heredoc_template" ? heredocLiteralValue(heredoc) : undefined;
}

/**
 * The NFC-normalized unescaped string value of a plain literal HCL string or
 * interpolation-free heredoc expression (including parenthesized wrappers),
 * matching cty/HCL string normalization while rejecting dynamic templates.
 * @param expression The expression node.
 * @returns The NFC-normalized literal string, or undefined when not a plain literal.
 */
function literalStringValue(expression: Node | undefined): string | undefined {
	const inner = onlyChild(unwrapExpression(expression), "expression");
	const raw =
		inner?.type === "literal_value"
			? quotedLiteralValue(inner)
			: inner?.type === "template_expr"
				? templateLiteralValue(inner)
				: undefined;
	return raw?.normalize("NFC");
}

/**
 * Literal string values carried by an attribute's expression: either a single
 * literal string/heredoc (with optional parentheses) or the literal string
 * elements of a literal HCL tuple, ignoring non-literal elements.
 * @param expression The attribute's value node.
 * @returns The decoded literal strings in order.
 */
function literalStringsOf(expression: Node | undefined): string[] {
	const single = literalStringValue(expression);
	if (single !== undefined) return [single];
	const tuple = onlyChild(
		onlyChild(unwrapExpression(expression), "expression"),
		"collection_value",
	);
	if (tuple?.type !== "tuple") return [];
	return syntaxChildren(tuple).flatMap((child) => {
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
	const children = syntaxChildren(block);
	const [kind] = children;
	return {
		kind: kind?.type === "identifier" ? kind.text : "",
		body: children.find((node) => node.type === "body"),
	};
}

/**
 * An attribute node's identifier name and value expression, ignoring intervening comments.
 * @param node An `attribute` node.
 * @returns Its name and expression, or undefined when incomplete.
 */
function attributeExprOf(node: Node): AttributeExpr | undefined {
	const children = syntaxChildren(node);
	const name = children.find((child) => child.type === "identifier");
	const expression = children.find((child) => child.type === "expression");
	return name === undefined || expression === undefined
		? undefined
		: { name: name.text, expression };
}

/**
 * The attributes directly in a block's body.
 * @param body The body node.
 * @returns Each direct attribute's name and value expression.
 */
function directAttributes(body: Node | undefined): AttributeExpr[] {
	return syntaxChildren(body).flatMap((node) => {
		if (node.type !== "attribute") return [];
		const attr = attributeExprOf(node);
		return attr === undefined ? [] : [attr];
	});
}

/**
 * Every attribute anywhere inside a block's body, including deeper sub-blocks.
 * @param body The body node.
 * @returns All attributes in document order.
 */
function attributesDeep(body: Node | undefined): AttributeExpr[] {
	return syntaxChildren(body).flatMap((node) => {
		if (node.type === "attribute") {
			const attr = attributeExprOf(node);
			return attr === undefined ? [] : [attr];
		}
		return node.type === "block" ? attributesDeep(blockParts(node).body) : [];
	});
}

/**
 * The unescaped value of a direct literal `name` attribute on a nested block
 * body (including `""` and interpolation-free heredocs), rejecting dynamic
 * template interpolations and directives.
 * @param body The nested block's body.
 * @returns The NFC-normalized literal string, or undefined when absent or non-literal.
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
 * The canonical block symbol for a depth-1 nested block inside a resource.
 * @param resourceSymbol The enclosing resource's canonical address.
 * @param blockType The nested block's type identifier.
 * @param name The unescaped literal block name.
 * @returns The canonical block address.
 */
function blockSymbol(resourceSymbol: string, blockType: string, name: string): string {
	return `${resourceSymbol}.${blockType}[${JSON.stringify(name)}]`;
}

/**
 * Partition depth-1 named nested blocks of a resource into unique blocks and
 * deduplicated canonical symbols for duplicated `(blockType, literalName)` pairs.
 * @param resourceSymbol The enclosing resource's canonical address.
 * @param body The resource block's body.
 * @returns Its unique nested blocks and ambiguous duplicate block symbols.
 */
function partitionNestedBlocks(
	resourceSymbol: string,
	body: Node | undefined,
): { readonly unique: UniqueNestedBlock[]; readonly ambiguousSymbols: string[] } {
	const candidates = namedNestedBlocks(body);
	const counts = new Map<string, number>();
	for (const candidate of candidates) {
		counts.set(candidate.key, (counts.get(candidate.key) ?? 0) + 1);
	}
	const unique: UniqueNestedBlock[] = [];
	const ambiguous = new Set<string>();
	for (const candidate of candidates) {
		const symbol = blockSymbol(resourceSymbol, candidate.blockType, candidate.name);
		if (counts.get(candidate.key) === 1) unique.push({ ...candidate, symbol });
		else ambiguous.add(symbol);
	}
	return { unique, ambiguousSymbols: [...ambiguous] };
}

/**
 * The first static label of a nested block (`string_lit` or `identifier`).
 * @param block The block node.
 * @returns The decoded label text, or empty string when missing or non-literal.
 */
function firstBlockLabel(block: Node): string {
	const label = syntaxChildren(block)
		.slice(1)
		.find((node) => node.type === "string_lit" || node.type === "identifier");
	if (label === undefined) return "";
	if (label.type === "identifier") return label.text;
	if (hasDynamicTemplate(label)) return "";
	return decodeHclString(label.text, true) ?? "";
}

/**
 * An unparsed `under` entry spanning one block node for a nested block type.
 * @param resourceSymbol The enclosing resource's canonical address.
 * @param blockType The unfollowed nested block type.
 * @param node The block node.
 * @returns The unparsed entry.
 */
function unfollowedEntry(resourceSymbol: string, blockType: string, node: Node): Unparsed {
	return {
		start: node.startPosition.row + 1,
		end: node.endPosition.row + 1,
		names: [],
		under: `${resourceSymbol}.${blockType}`,
	};
}

/**
 * An unfollowed entry for a `dynamic "<type>"` nested block, if its label is static.
 * @param resourceSymbol The enclosing resource's canonical address.
 * @param node The `dynamic` block node.
 * @returns The unparsed entry, or undefined.
 */
function unfollowedDynamic(resourceSymbol: string, node: Node): Unparsed | undefined {
	const target = firstBlockLabel(node);
	return target === "" ? undefined : unfollowedEntry(resourceSymbol, target, node);
}

/**
 * An unfollowed entry for a direct child block with a non-literal `name` attribute.
 * @param resourceSymbol The enclosing resource's canonical address.
 * @param blockType The nested block's type.
 * @param inner The nested block's body.
 * @param node The block node.
 * @returns The unparsed entry, or undefined when unnamed or statically named.
 */
function unfollowedComputed(
	resourceSymbol: string,
	blockType: string,
	inner: Node | undefined,
	node: Node,
): Unparsed | undefined {
	const nameAttr = directAttributes(inner).find((attribute) => attribute.name === "name");
	if (nameAttr === undefined || literalStringValue(nameAttr.expression) !== undefined) {
		return undefined;
	}
	return unfollowedEntry(resourceSymbol, blockType, node);
}

/**
 * An unfollowed entry for a direct child block when it is a `dynamic "<type>"`
 * block or has a direct non-literal `name` attribute.
 * @param resourceSymbol The enclosing resource's canonical address.
 * @param node A direct child node of the resource body.
 * @returns The unparsed entry, or undefined when statically handled or unnamed.
 */
function unfollowedBlock(resourceSymbol: string, node: Node): Unparsed | undefined {
	if (node.type !== "block") return undefined;
	const { kind: blockType, body: inner } = blockParts(node);
	if (blockType === "dynamic") return unfollowedDynamic(resourceSymbol, node);
	return blockType === "" ? undefined : unfollowedComputed(resourceSymbol, blockType, inner, node);
}

/**
 * Unfollowed `dynamic` and computed-name depth-1 nested blocks of a resource.
 * @param resourceSymbol The enclosing resource's canonical address.
 * @param body The resource block's body.
 * @returns Unparsed entries in document order.
 */
function unfollowedNestedBlocks(resourceSymbol: string, body: Node | undefined): Unparsed[] {
	return (body?.namedChildren ?? []).flatMap((node) => {
		const entry = unfollowedBlock(resourceSymbol, node);
		return entry === undefined ? [] : [entry];
	});
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
 * Extract unique depth-1 named nested-block definitions, 1-hop intra-resource
 * sibling links, duplicate-name ambiguous symbols, and unfollowed dynamic or
 * computed-name entries for one top-level `resource` block.
 * @param resourceSymbol The enclosing resource's canonical address.
 * @param body The resource block's body.
 * @returns Its nested-block facts.
 */
function resourceNestedFacts(resourceSymbol: string, body: Node | undefined): ResourceNestedFacts {
	const { unique, ambiguousSymbols } = partitionNestedBlocks(resourceSymbol, body);
	return {
		definitions: unique.map(blockDefinition),
		siblingLinks: siblingLinksIn(unique),
		ambiguousSymbols,
		unparsed: unfollowedNestedBlocks(resourceSymbol, body),
	};
}

export { type ResourceNestedFacts, resourceNestedFacts };

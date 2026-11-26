// Nested-block span lookup and 1-hop intra-resource sibling adjacency for one
// Terraform or OpenTofu root module (ADR 0046, TASK-682.03).
//
// Sibling links stay scoped to their module instance and never enter the
// declaration reach graph: they support anchors between co-located nested
// blocks without emitting relationship evidence.

import type {
	Definition,
	Reference,
	SiblingLink,
	SyntaxFacts,
	Unparsed,
} from "#runtime/code-facts/operations/facts.ts";
import { lastName } from "#runtime/code-facts/operations/text-reading.ts";
import {
	parseTerraformAddress,
	splitAddressSegments,
	type ParsedTerraformAddress,
} from "#runtime/code-facts/terraform/operations/terraform-address.ts";

/** One emitted depth-1 nested block's canonical address and file span. */
interface NestedBlockSpan {
	readonly address: string;
	readonly path: string;
	readonly start: number;
	readonly end: number;
}

/** Per-root index of depth-1 nested block spans, sibling adjacency, and ambiguous duplicates. */
interface NestedBlockIndex {
	/** Symmetric 1-hop sibling adjacency, keyed by module-scoped canonical block address. */
	readonly edges: Map<string, Set<string>>;
	/** Depth-1 nested blocks belonging to each resource declaration address. */
	readonly blocksByDeclaration: Map<string, NestedBlockSpan[]>;
	/** Module-scoped canonical block addresses suppressed due to duplicate literal names. */
	readonly ambiguous: Set<string>;
}

/** Nested-block and sibling-link queries exposed on `TerraformConfiguration`. */
interface NestedBlockQueries {
	/**
	 * Whether two canonical block addresses are directly 1-hop linked siblings
	 * within the same resource and module instance, in either direction.
	 * @param a First canonical block address.
	 * @param b Second canonical block address.
	 */
	areLinkedSiblings(a: string, b: string): boolean;
	/**
	 * The unique depth-1 nested block address belonging to `declarationAddress`
	 * that spans `(path, line)`, or undefined when outside every emitted block.
	 * @param declarationAddress The enclosing resource's canonical address.
	 * @param path The file, relative to the checkout.
	 * @param line The 1-based line number.
	 */
	nestedBlockAt(declarationAddress: string, path: string, line: number): string | undefined;
}

/**
 * Create an empty nested-block and sibling-link index for one root module.
 * @returns An empty index.
 */
function createNestedIndex(): NestedBlockIndex {
	return { edges: new Map(), blocksByDeclaration: new Map(), ambiguous: new Set() };
}

/**
 * Record one directed edge in the symmetric sibling adjacency map.
 * @param edges The adjacency map.
 * @param from First block address.
 * @param to Second block address.
 */
function addEdge(edges: Map<string, Set<string>>, from: string, to: string): void {
	const linked = edges.get(from);
	if (linked === undefined) edges.set(from, new Set([to]));
	else linked.add(to);
}

/**
 * Record one nested-block span under its enclosing resource declaration.
 * @param index The root module's nested-block index.
 * @param path The file path.
 * @param scope The module instance scope.
 * @param definition The block definition.
 */
function recordBlockSpan(
	index: NestedBlockIndex,
	path: string,
	scope: string,
	definition: Definition,
): void {
	const address = `${scope}${definition.symbol}`;
	const declaration = parseTerraformAddress(address)?.declaration;
	if (declaration === undefined) return;
	const span: NestedBlockSpan = { address, path, start: definition.start, end: definition.end };
	const existing = index.blocksByDeclaration.get(declaration);
	if (existing === undefined) index.blocksByDeclaration.set(declaration, [span]);
	else existing.push(span);
}

/**
 * Record symmetric 1-hop sibling links under a module instance scope.
 * @param edges The adjacency map.
 * @param links The file's sibling links.
 * @param scope The module instance scope.
 */
function recordSiblingLinks(
	edges: Map<string, Set<string>>,
	links: readonly SiblingLink[],
	scope: string,
): void {
	for (const { from, to } of links) {
		const scopedFrom = `${scope}${from}`;
		const scopedTo = `${scope}${to}`;
		addEdge(edges, scopedFrom, scopedTo);
		addEdge(edges, scopedTo, scopedFrom);
	}
}

/**
 * Record a file's depth-1 nested block spans, ambiguous duplicates, and 1-hop
 * sibling links under one module instance scope.
 * @param index The root module's nested-block index.
 * @param facts The file's parsed Terraform facts.
 * @param scope The module instance scope (`""` or `module.<name>.`).
 */
function recordNestedBlocks(index: NestedBlockIndex, facts: SyntaxFacts, scope: string): void {
	for (const definition of facts.definitions) {
		if (definition.visibility === "block") recordBlockSpan(index, facts.path, scope, definition);
	}
	for (const symbol of facts.ambiguousSymbols ?? []) index.ambiguous.add(`${scope}${symbol}`);
	recordSiblingLinks(index.edges, facts.siblingLinks ?? [], scope);
}

/**
 * The narrowest top-level declaration of a file that holds a line, ignoring
 * nested blocks so references still attach to their enclosing resource.
 * @param facts The file's facts.
 * @param line The line.
 * @returns The definition, or undefined outside every declaration.
 */
function holderAt(facts: SyntaxFacts, line: number): Definition | undefined {
	return facts.definitions
		.filter((each) => each.visibility !== "block" && each.start <= line && line <= each.end)
		.toSorted((left, right) => left.end - left.start - (right.end - right.start))[0];
}

/**
 * The depth-1 nested block of a declaration spanning a file line in an index.
 * @param index The root module's nested-block index.
 * @param declarationAddress The enclosing resource's canonical address.
 * @param path The file, relative to the checkout.
 * @param line The 1-based line number.
 * @returns The nested block's canonical address, or undefined.
 */
function nestedBlockAtIn(
	index: NestedBlockIndex,
	declarationAddress: string,
	path: string,
	line: number,
): string | undefined {
	return index.blocksByDeclaration
		.get(declarationAddress)
		?.find((block) => block.path === path && block.start <= line && line <= block.end)?.address;
}

/**
 * Find an unfollowed dynamic/computed-name block or syntax-error entry in a
 * scope's unparsed list matching a parsed Terraform address.
 * @param parsed The parsed Terraform address.
 * @param scope The scope holding `parts`.
 * @param parts The unparsed entries recorded in `scope`.
 * @returns The matching file and unparsed entry, or undefined.
 */
function unparsedPartIn(
	parsed: ParsedTerraformAddress,
	scope: string,
	parts: readonly { readonly path: string; readonly unparsed: Unparsed }[],
): { readonly path: string; readonly unparsed: Unparsed } | undefined {
	if (parsed.kind === "block" && parsed.nested !== undefined) {
		const target = `${parsed.declaration}.${parsed.nested.blockType}`;
		const match = parts.find(
			(each) => each.unparsed.under !== undefined && `${scope}${each.unparsed.under}` === target,
		);
		if (match !== undefined) return match;
	}
	const name = lastName(parsed.address);
	return parts.find(
		(each) => each.unparsed.under === undefined && each.unparsed.names.includes(name),
	);
}

/**
 * The plan JSON path when a nested-block selector targets a resource known only from a plan.
 * @param declarations The address space's declarations.
 * @param parsed The parsed Terraform address.
 * @returns The plan path, or undefined.
 */
function planOnlyParentPath(
	declarations: ReadonlyMap<
		string,
		{ readonly kind: string; readonly path?: string; readonly planPath?: string }
	>,
	parsed: ParsedTerraformAddress,
): string | undefined {
	if (parsed.kind !== "block") return undefined;
	const parent = declarations.get(parsed.declaration);
	return parent?.kind === "resource" && parent.path === undefined ? parent.planPath : undefined;
}

/**
 * Build the nested-block and sibling-link query methods over a finished index.
 * @param index The root module's nested-block index.
 * @returns The query methods for `TerraformConfiguration`.
 */
function nestedQueries(index: NestedBlockIndex): NestedBlockQueries {
	return {
		/**
		 * Whether two canonical block addresses are 1-hop linked siblings.
		 * @param a First canonical block address.
		 * @param b Second canonical block address.
		 * @returns True when directly linked in either direction.
		 */
		areLinkedSiblings(a, b) {
			return index.edges.get(a)?.has(b) === true;
		},
		/**
		 * The depth-1 nested block of a declaration spanning a file line.
		 * @param declarationAddress The enclosing resource's canonical address.
		 * @param path The file, relative to the checkout.
		 * @param line The 1-based line number.
		 * @returns The nested block's canonical address, or undefined.
		 */
		nestedBlockAt(declarationAddress, path, line) {
			return nestedBlockAtIn(index, declarationAddress, path, line);
		},
	};
}

/**
 * Where the checkout holds an address: its own block, else the block of the
 * nearest module call or resource that holds it.
 * @param declarations The address space.
 * @param address The address.
 * @returns The site, or undefined when no declaration of the checkout holds it.
 */
function siteIn(
	declarations: ReadonlyMap<string, { readonly path?: string; readonly definition?: Definition }>,
	address: string,
): { readonly path: string; readonly definition: Definition } | undefined {
	const names = splitAddressSegments(address);
	for (let count = names.length; count > 0; count -= 1) {
		const held = declarations.get(names.slice(0, count).join("."));
		if (held?.path !== undefined && held.definition !== undefined) {
			return { path: held.path, definition: held.definition };
		}
	}
	return undefined;
}

/**
 * Optional metadata attached to a written reference from a Terraform file.
 * @param reference The file reference.
 * @param block The nested block spanning the reference, if any.
 * @returns The optional fields present on the reference.
 */
function writtenExtras(
	reference: Reference,
	block: string | undefined,
): {
	readonly argument?: string;
	readonly joins?: NonNullable<Reference["joins"]>;
	readonly block?: string;
} {
	return {
		...(reference.argument === undefined ? {} : { argument: reference.argument }),
		...(reference.joins === undefined ? {} : { joins: reference.joins }),
		...(block === undefined ? {} : { block }),
	};
}

/**
 * The references one file of a module instance writes, each from the
 * narrowest top-level declaration that holds it, tagged with its depth-1
 * nested block when written inside one.
 * @param facts The file's facts.
 * @param scope The module instance.
 * @param nested The root module's nested-block index.
 * @returns The references; one outside every declaration or non-code is none.
 */
function writtenIn(facts: SyntaxFacts, scope: string, nested: NestedBlockIndex) {
	return facts.references.flatMap((reference) => {
		const holder = holderAt(facts, reference.line);
		if (holder === undefined || reference.via !== "code") return [];
		const { symbol, line } = reference;
		const from = `${scope}${holder.symbol}`;
		const block = nestedBlockAtIn(nested, from, facts.path, line);
		const kind = reference.kind ?? ("configured-path" as const);
		return [
			{
				from,
				scope,
				names: symbol.split("."),
				path: facts.path,
				line,
				symbol,
				kind,
				...writtenExtras(reference, block),
			},
		];
	});
}

export {
	type NestedBlockIndex,
	type NestedBlockQueries,
	createNestedIndex,
	holderAt,
	nestedBlockAtIn,
	nestedQueries,
	planOnlyParentPath,
	recordNestedBlocks,
	siteIn,
	unparsedPartIn,
	writtenIn,
};

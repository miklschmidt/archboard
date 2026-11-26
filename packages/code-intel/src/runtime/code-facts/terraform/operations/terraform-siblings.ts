// Nested-block span lookup and 1-hop intra-resource sibling adjacency for one
// Terraform or OpenTofu root module (ADR 0046, TASK-682.03).
//
// Sibling links stay scoped to their module instance and never enter the
// declaration reach graph: they support anchors between co-located nested
// blocks without emitting relationship evidence.

import type { Definition, SyntaxFacts } from "#runtime/code-facts/operations/facts.ts";
import {
	parseTerraformAddress,
	splitAddressSegments,
} from "#runtime/code-facts/terraform/operations/terraform-address.ts";

/** One emitted depth-1 nested block's canonical address and file span. */
interface NestedBlockSpan {
	readonly address: string;
	readonly path: string;
	readonly start: number;
	readonly end: number;
}

/** Per-root index of depth-1 nested block spans and 1-hop sibling adjacency. */
interface NestedBlockIndex {
	/** Symmetric 1-hop sibling adjacency, keyed by module-scoped canonical block address. */
	readonly edges: Map<string, Set<string>>;
	/** Depth-1 nested blocks belonging to each resource declaration address. */
	readonly blocksByDeclaration: Map<string, NestedBlockSpan[]>;
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
	return { edges: new Map(), blocksByDeclaration: new Map() };
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
 * Record a file's depth-1 nested block spans and 1-hop sibling links under one
 * module instance scope.
 * @param index The root module's nested-block index.
 * @param facts The file's parsed Terraform facts.
 * @param scope The module instance scope (`""` or `module.<name>.`).
 */
function recordNestedBlocks(index: NestedBlockIndex, facts: SyntaxFacts, scope: string): void {
	for (const definition of facts.definitions) {
		if (definition.visibility === "block") recordBlockSpan(index, facts.path, scope, definition);
	}
	for (const { from, to } of facts.siblingLinks ?? []) {
		const scopedFrom = `${scope}${from}`;
		const scopedTo = `${scope}${to}`;
		addEdge(index.edges, scopedFrom, scopedTo);
		addEdge(index.edges, scopedTo, scopedFrom);
	}
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
			return index.blocksByDeclaration
				.get(declarationAddress)
				?.find((block) => block.path === path && block.start <= line && line <= block.end)?.address;
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

export {
	type NestedBlockIndex,
	type NestedBlockQueries,
	createNestedIndex,
	holderAt,
	nestedQueries,
	recordNestedBlocks,
	siteIn,
};

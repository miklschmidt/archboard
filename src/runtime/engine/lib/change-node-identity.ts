// Who a shape is, across two moments of the same board.
//
// `compareBoards` joins on node ids, and most shapes on a working board have
// none. This module hands every anonymous shape a temporary `el:<elementId>`
// identity so the diff can talk about it, and resolves promotion's logical-id
// transition before the comparison runs — otherwise a promotion reads as one
// node departing and an unrelated one arriving.

import { nodeIdOf, readElementMetadata } from "@/runtime/engine/metadata";
import type { ServerElement } from "@/runtime/engine/types";

/** A borrowing view over inert diff data. */
type DeepReadonly<T> = T extends readonly (infer Item)[]
	? readonly DeepReadonly<Item>[]
	: T extends object
		? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
		: T;

// Synthetic ids cannot be mistaken for promoted node ids.
const ANON_NODE_PREFIX = "el:";

const CONNECTOR_TYPES = new Set(["arrow", "line"]);

/** One shape's node id before and after, and the elements that carry it. */
interface IdentityPair {
	previousNode: string;
	node: string;
	elementIds: string[];
}

/**
 * Whether a node id is one of the temporary ones this module mints, rather
 * than an id somebody promoted the shape under.
 * @param node The node id.
 * @returns True when it is synthetic.
 */
function isAnonymousNode(node: string): boolean {
	return node.startsWith(ANON_NODE_PREFIX);
}

/**
 * Whether a shape already has an identity of its own, or belongs to another
 * shape's: promoted nodes, connectors and bound labels each already answer to
 * something, and minting a second identity for them would double-count them.
 * @param el The element.
 * @returns True when it needs no synthetic id.
 */
function alreadyIdentified(el: ServerElement): boolean {
	if (nodeIdOf(el) !== undefined || CONNECTOR_TYPES.has(el.type)) {
		return true;
	}
	// Bound labels belong to their containers.
	return el.type === "text" && typeof el.containerId === "string" && el.containerId.length > 0;
}

/**
 * The board's elements with a temporary node id on every anonymous shape.
 *
 * Returns identified copies; the stored board elements are never mutated.
 * @param elements The board's elements.
 * @returns The same elements, each one now answering to something.
 */
function withSyntheticNodeIds<const Elements extends readonly ServerElement[]>(
	elements: Elements,
): ServerElement[] | Extract<Elements, never> {
	const identified: ServerElement[] = [];
	for (const el of elements) {
		if (alreadyIdentified(el)) {
			identified.push(el);
			continue;
		}
		const custom = el.customData ?? {};
		const block = {
			...readElementMetadata(el).archboard,
			node: `${ANON_NODE_PREFIX}${el.id}`,
		};
		identified.push({ ...el, customData: { ...custom, archboard: block } });
	}
	return identified;
}

/**
 * Which node each element belonged to at one moment.
 * @param elements The board's elements.
 * @returns Element id to node id, skipping elements with no node.
 */
const nodeByElement = <const Elements extends readonly ServerElement[]>(
	elements: Elements,
): Map<Elements[number]["id"], string> => {
	const map = new Map<string, string>();
	for (const el of elements) {
		const node = nodeIdOf(el);
		if (node !== undefined) {
			map.set(el.id, node);
		}
	}
	return map;
};

/**
 * The node one element left, when it left one at all.
 * @param was Which node each element belonged to before.
 * @param elementId The element.
 * @param node The node it belongs to now.
 * @returns The node it came from, or undefined when it stayed put or never had one.
 */
function movedFrom(
	was: ReadonlyMap<string, string>,
	elementId: string,
	node: string,
): string | undefined {
	const previous = was.get(elementId);
	return previous === undefined || previous.length === 0 || previous === node
		? undefined
		: previous;
}

/**
 * For each old node id, the new ids its elements ended up under, with the
 * elements that moved to each one.
 * @param was Which node each element belonged to before.
 * @param now Which node each element belongs to now.
 * @returns Old node id to new node id to the elements that made the move.
 */
function transitionCandidates(
	was: ReadonlyMap<string, string>,
	now: ReadonlyMap<string, string>,
): Map<string, Map<string, string[]>> {
	const candidates = new Map<string, Map<string, string[]>>();
	for (const [elementId, node] of now) {
		const previous = movedFrom(was, elementId, node);
		if (previous === undefined) {
			continue;
		}
		const byNew = candidates.get(previous) ?? new Map<string, string[]>();
		byNew.set(node, [...(byNew.get(node) ?? []), elementId]);
		candidates.set(previous, byNew);
	}
	return candidates;
}

/**
 * The new node id most of an old node's elements moved to.
 *
 * Takes the largest claim, so that splitting a node leaves the remainder to
 * read as an arrival rather than turning one node into two half-matches.
 * @param byNew Each new node id and the elements that went to it.
 * @returns The winning id and its elements, or undefined when there are none.
 */
function largestClaim(byNew: ReadonlyMap<string, string[]>): [string, string[]] | undefined {
	return [...byNew.entries()].toSorted(
		(a: DeepReadonly<[string, string[]]>, b: DeepReadonly<[string, string[]]>) =>
			(b.at(1)?.length ?? 0) - (a.at(1)?.length ?? 0),
	)[0];
}

/**
 * The shapes whose node id changed between the two moments, matched by the
 * elements they are made of.
 *
 * Stable element overlap resolves promotion's logical-id transition before
 * comparison, preventing false node and cluster departures or arrivals.
 * @param before The board's elements at the earlier moment.
 * @param after The board's elements now.
 * @returns One pair per shape that changed identity.
 */
function identityPairs<const Elements extends readonly ServerElement[]>(
	before: Elements,
	after: Elements,
): IdentityPair[] {
	const candidates = transitionCandidates(nodeByElement(before), nodeByElement(after));
	const pairs: IdentityPair[] = [];
	const claimed = new Set<string>();
	for (const [previousNode, byNew] of candidates) {
		const first = largestClaim(byNew);
		if (!first) {
			continue;
		}
		const [node, elementIds] = first;
		if (claimed.has(node)) {
			continue;
		}
		claimed.add(node);
		pairs.push({ previousNode, node, elementIds: [...elementIds] });
	}
	return pairs;
}

/**
 * The earlier board rewritten so each shape already carries the node id it
 * ends up with, which is what lets the diff see one changed node instead of a
 * departure and an arrival.
 * @param before The board's elements at the earlier moment.
 * @param pairs The identity changes to apply.
 * @returns Copies of the elements under their new ids.
 */
function applyIdentityPairs<const Elements extends readonly ServerElement[]>(
	before: Elements,
	pairs: readonly DeepReadonly<IdentityPair>[],
): ServerElement[] | Extract<Elements, never> {
	const rename = new Map<string, string>();
	for (const pair of pairs) {
		rename.set(pair.previousNode, pair.node);
	}
	const aligned: ServerElement[] = [];
	for (const el of before) {
		const node = nodeIdOf(el);
		const renamed = node === undefined ? undefined : rename.get(node);
		if (renamed === undefined) {
			aligned.push(el);
			continue;
		}
		const custom = el.customData ?? {};
		aligned.push({
			...el,
			customData: {
				...custom,
				archboard: { ...readElementMetadata(el).archboard, node: renamed },
			},
		});
	}
	return aligned;
}

export {
	ANON_NODE_PREFIX,
	type IdentityPair,
	applyIdentityPairs,
	identityPairs,
	isAnonymousNode,
	withSyntheticNodeIds,
};

// The graph a board draws: which nodes its connectors join, and how many
// connectors reach each.

import { bindingOf, hasText } from "@/runtime/engine/lib/describe-scene-model";
import type { Edge, Item, NodeFold } from "@/runtime/engine/lib/describe-scene-model";

/** How many connectors arrive at and leave one node. */
interface Degree {
	in: number;
	out: number;
}

/**
 * The connectors that join two nodes, resolved to the names a person uses.
 *
 * A connector bound to a folded member names the node it belongs to, so an
 * arrow drawn to one piece of a three-element node still reads as an edge to
 * that node. Ids stay alongside the names so callers that parse them keep
 * working.
 * @param connectors The board's unpromoted arrows and lines.
 * @param nodeFold Which primary each folded member belongs to.
 * @param nameOf What each element is called.
 * @returns The edges, in connector order.
 */
function edgesFrom(
	connectors: readonly Item[],
	nodeFold: NodeFold,
	nameOf: ReadonlyMap<string, string>,
): Edge[] {
	const edges: Edge[] = [];
	for (const item of connectors) {
		const edge = edgeFrom(item, nodeFold, nameOf);
		if (edge) {
			edges.push(edge);
		}
	}
	return edges;
}

/**
 * One connector as an edge, when either of its ends is bound to something.
 * @param item The connector.
 * @param nodeFold Which primary each folded member belongs to.
 * @param nameOf What each element is called.
 * @returns The edge, or null when the connector joins nothing.
 */
function edgeFrom(
	item: Item,
	nodeFold: NodeFold,
	nameOf: ReadonlyMap<string, string>,
): Edge | null {
	const el: unknown = item.el;
	const from = endOf(bindingOf(el, "start"), nodeFold, nameOf);
	const to = endOf(bindingOf(el, "end"), nodeFold, nameOf);
	if (!from.id && !to.id) {
		return null;
	}
	const label = labelOn(item);
	return {
		arrow: item.el,
		...(from.id === undefined ? {} : { fromId: from.id }),
		...(to.id === undefined ? {} : { toId: to.id }),
		fromName: from.name,
		toName: to.name,
		...(label === undefined ? {} : { label }),
	};
}

/**
 * What one end of a connector is bound to: the node it belongs to, and what
 * that node is called.
 * @param bound The element the end names, when it names one.
 * @param nodeFold Which primary each folded member belongs to.
 * @param nameOf What each element is called.
 * @returns The node's id and name; "?" for an end bound to nothing.
 */
function endOf(
	bound: string | undefined,
	nodeFold: NodeFold,
	nameOf: ReadonlyMap<string, string>,
): { id: string | undefined; name: string } {
	const id = primaryOf(bound, nodeFold);
	if (!hasText(id)) {
		return { id: undefined, name: "?" };
	}
	return { id, name: nameOf.get(id) ?? "?" };
}

/**
 * What a connector is called: its own words, else the kind it claims.
 * @param item The connector.
 * @returns The label, or undefined.
 */
function labelOn(item: Item): string | undefined {
	if (hasText(item.labelText)) {
		return item.labelText;
	}
	return hasText(item.meta.kind) ? item.meta.kind : undefined;
}

/**
 * The element a node is named by, for an id that may be one of its folded
 * members rather than the primary.
 * @param id The element id.
 * @param nodeFold Which primary each folded member belongs to.
 * @returns The primary's id, or the id itself.
 */
function primaryOf(id: string | undefined, nodeFold: NodeFold): string | undefined {
	if (id === undefined || id.length === 0) {
		return id;
	}
	return nodeFold.primaryOf.get(id) ?? id;
}

/**
 * How many connectors reach each node.
 * @param edges The board's edges.
 * @returns The degree by node id; a node nothing reaches is absent.
 */
function degreesOf(edges: readonly Edge[]): Map<string, Degree> {
	const degree = new Map<string, Degree>();
	for (const e of edges) {
		bump(degree, e.fromId, "out");
		bump(degree, e.toId, "in");
	}
	return degree;
}

/**
 * Count one more connector at a node.
 * @param degree The degrees so far, extended in place.
 * @param id The node.
 * @param dir Whether the connector arrives or leaves.
 */
function bump(degree: Map<string, Degree>, id: string | undefined, dir: "in" | "out"): void {
	if (id === undefined || id.length === 0) {
		return;
	}
	const d = degree.get(id) ?? { in: 0, out: 0 };
	d[dir]++;
	degree.set(id, d);
}

export { type Degree, degreesOf, edgesFrom };

// What one part is connected to: the other end of every relationship that
// crosses its edge, said as what it sends to and what it receives from.
//
// A container's relationships are the ones that cross its edge, so the parts
// inside it are not its neighbours: it stands for everything it holds.
//
// The same reading says what the picture lights when a part is poked (`litBy`):
// the part and all it holds, every relationship that touches any of it, and the
// parts at their other ends. A step through a chosen design question's answer
// lights every subject of the answer, and what a pick of the one the person is
// at lights (`litByAnswer`, ADR 0057).

import type { SemanticEdge, SemanticNode, VariantContent } from "@archboard/board/content";
import type { SemanticAtlas } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { subjectBox } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";

/** The parts and relationships of a variant, as far as containment and wiring are concerned. */
interface Wiring {
	readonly nodes: readonly Pick<SemanticNode, "id" | "parent">[];
	readonly edges: readonly Pick<SemanticEdge, "id" | "from" | "to">[];
}

/** One relationship, seen from the part it is asked about. */
interface Link {
	/** The relationship. */
	readonly edge: SemanticEdge;
	/** The part at its other end, when the variant still holds it. */
	readonly other: SemanticNode | undefined;
}

/** What a part sends to and what it receives from. */
interface Connections {
	readonly sends: readonly Link[];
	readonly receives: readonly Link[];
}

/**
 * A part and every part nested inside it. A part that holds nothing is its own subtree.
 * @param nodes Every part of the variant.
 * @param id The part.
 * @returns The ids.
 */
function subtreeOf(nodes: Wiring["nodes"], id: string): ReadonlySet<string> {
	const inside = new Set([id]);
	const open = [id];
	while (open.length > 0) {
		const here = open.pop();
		for (const node of nodes) {
			if (node.parent === here && !inside.has(node.id)) {
				inside.add(node.id);
				open.push(node.id);
			}
		}
	}
	return inside;
}

/**
 * What a part sends to and receives from.
 * @param content What the variant says.
 * @param id The part.
 * @returns Both lists, in the order the variant states the relationships.
 */
function connectionsOf(content: VariantContent, id: string): Connections {
	const byId = new Map(content.nodes.map((node) => [node.id, node]));
	const inside = subtreeOf(content.nodes, id);
	const sends = content.edges
		.filter((edge) => inside.has(edge.from) && !inside.has(edge.to))
		.map((edge) => ({ edge, other: byId.get(edge.to) }));
	const receives = content.edges
		.filter((edge) => inside.has(edge.to) && !inside.has(edge.from))
		.map((edge) => ({ edge, other: byId.get(edge.from) }));
	return { sends, receives };
}

/**
 * Add the containers that hold some of a set of parts, so a lit part is never
 * seen inside a frame that has receded.
 * @param nodes Every part of the variant.
 * @param lit The ids lit so far, which this adds to.
 */
function withContainers(nodes: Wiring["nodes"], lit: Set<string>): void {
	const parentOf = new Map(nodes.map((node) => [node.id, node.parent]));
	for (const id of lit) {
		for (let up = parentOf.get(id); up !== undefined && !lit.has(up); up = parentOf.get(up)) {
			lit.add(up);
		}
	}
}

/**
 * Add the parts at both ends of every relationship lit so far.
 * @param edges Every relationship of the variant.
 * @param lit The ids lit so far, which this adds to.
 */
function withEnds(edges: Wiring["edges"], lit: Set<string>): void {
	for (const edge of edges) {
		if (lit.has(edge.id)) {
			lit.add(edge.from);
			lit.add(edge.to);
		}
	}
}

/**
 * A part, what it holds, and every relationship with an end in any of it.
 * @param wiring What the variant says.
 * @param id The part.
 * @returns The ids.
 */
function aroundPart(wiring: Wiring, id: string): Set<string> {
	const lit = new Set(subtreeOf(wiring.nodes, id));
	for (const edge of wiring.edges) {
		if (lit.has(edge.from) || lit.has(edge.to)) lit.add(edge.id);
	}
	return lit;
}

/**
 * Everything the picture leaves standing when a part, or a relationship, is poked.
 *
 * For a part that is the part and what it holds, every relationship with an end
 * in any of it (those between its own parts included, which are its content),
 * the parts at their other ends, and the containers that hold any of them. For
 * a relationship it is the relationship, its two ends and their containers.
 * @param wiring What the variant says.
 * @param id The semantic id that was poked.
 * @returns The ids, or null for an id that is neither a part nor a relationship.
 */
function litBy(wiring: Wiring, id: string): ReadonlySet<string> | null {
	const isPart = wiring.nodes.some((node) => node.id === id);
	if (!isPart && !wiring.edges.some((edge) => edge.id === id)) {
		return null;
	}
	const lit = isPart ? aroundPart(wiring, id) : new Set([id]);
	withEnds(wiring.edges, lit);
	withContainers(wiring.nodes, lit);
	return lit;
}

/**
 * What a trace lights: what the pick lights, and everything the trace reached
 * beyond it, with the containers that hold any of them.
 * @param wiring What the variant says.
 * @param lit What the pick lights.
 * @param reach The subjects the trace reached beyond that, by how many hops.
 * @returns The ids to leave standing.
 */
function withReach(
	wiring: Wiring,
	lit: ReadonlySet<string>,
	reach: ReadonlyMap<string, number>,
): ReadonlySet<string> {
	const light = new Set([...lit, ...reach.keys()]);
	withContainers(wiring.nodes, light);
	return light;
}

/**
 * What the picture lights for a poke, when it has anything drawn to light: a
 * part wired to nothing the picture draws has nothing to say.
 * @param wiring What the variant says, or null while that is not known.
 * @param atlas Where every subject of the picture ended up.
 * @param id The semantic id that was poked, or null.
 * @returns The ids to leave standing, or null for no light.
 */
function litInPicture(
	wiring: Wiring | null,
	atlas: SemanticAtlas,
	id: string | null,
): ReadonlySet<string> | null {
	const lit = wiring === null || id === null ? null : litBy(wiring, id);
	return lit !== null && [...lit].some((one) => one in atlas.edges) ? lit : null;
}

/** A step through a chosen design question's answer, as far as the light is concerned. */
interface AnswerStep {
	/** Every subject the answer names. */
	readonly subjects: readonly string[];
	/** The subject the person is at. */
	readonly at: string;
}

/**
 * What the picture lights for a step through a chosen design question's
 * answer: every subject of the answer, what a pick of the subject the person
 * is at lights, and every container that holds any of them. A subject the view
 * does not draw stands through the nearest container it draws.
 * @param wiring What the variant says, or null while that is not known.
 * @param atlas Where every subject of the picture ended up.
 * @param answer The step, or null while no question is chosen.
 * @returns The ids to leave standing, or null when the picture draws none of them.
 */
function litByAnswer(
	wiring: Wiring | null,
	atlas: SemanticAtlas,
	answer: AnswerStep | null,
): ReadonlySet<string> | null {
	if (wiring === null || answer === null) {
		return null;
	}
	const lit = new Set([...answer.subjects, ...(litBy(wiring, answer.at) ?? [])]);
	withContainers(wiring.nodes, lit);
	return [...lit].some((one) => subjectBox(atlas, one) !== null) ? lit : null;
}

export {
	connectionsOf,
	litBy,
	litByAnswer,
	litInPicture,
	subtreeOf,
	withReach,
	type AnswerStep,
	type Connections,
	type Link,
	type Wiring,
};

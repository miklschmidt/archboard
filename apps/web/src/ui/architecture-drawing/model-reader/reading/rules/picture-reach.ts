import type { projectModel } from "@archboard/model/content";
import { openModules } from "#ui/architecture-drawing/model-reader/rules/expansion.ts";
import {
	reachOf,
	type Reach,
	type Way,
} from "#ui/architecture-drawing/canvas/picture/camera/rules/reach.ts";

type Projection = ReturnType<typeof projectModel>;

/**
 * Every module that holds a card.
 * @param parents What holds each module.
 * @param cards The cards of the picture.
 * @returns The modules.
 */
function holdersOf(
	parents: ReadonlyMap<string, string | undefined>,
	cards: ReadonlySet<string>,
): ReadonlySet<string> {
	const holders = new Set<string>();
	for (const card of cards) {
		for (let up = parents.get(card); up !== undefined; up = parents.get(up)) holders.add(up);
	}
	return holders;
}

/**
 * The relationships of the whole model, each between what stands for its ends: the card that holds
 * an end, or else the outermost module that holds it and no card. So everything a walk meets
 * stands for all it holds, and onward and back are the same walk in reverse.
 * @param depicted The whole model.
 * @param cards The cards of the picture.
 * @returns The relationships to walk.
 */
function walkedEdges(depicted: Projection["depicted"], cards: ReadonlySet<string>) {
	const parents = new Map(depicted.nodes.map(({ id, parent }) => [id, parent]));
	const holders = holdersOf(parents, cards);
	/**
	 * What stands for a module.
	 * @param id The module.
	 * @returns Its card, or the outermost module that holds it and no card.
	 */
	const standIn = (id: string): string => {
		let outermost = id;
		for (let at: string | undefined = id; at !== undefined; at = parents.get(at)) {
			if (cards.has(at)) return at;
			if (!holders.has(at)) outermost = at;
		}
		return outermost;
	};
	return depicted.edges.map(({ id, from, to }) => ({ id, from: standIn(from), to: standIn(to) }));
}

/**
 * How far a part reaches on the picture of a reading. The walk covers the whole model, because a
 * path can leave the picture through one door and come back through another. Then it says each
 * hop as what the picture draws: a card, or a line by the nearest relationship it joins.
 * @param projection The reading.
 * @param part The part.
 * @param way Onward along what it sends to, or back along what sends to it.
 * @returns How far each card and line is, and how many cards that is besides the part and the
 * frames of the open modules.
 */
function pictureReach(projection: Projection, part: string, way: Way): Reach {
	const { depicted, content, connections } = projection;
	const cards = new Set(content.nodes.map(({ id }) => id));
	const edges = walkedEdges(depicted, cards);
	const { hops } = reachOf({ nodes: content.nodes, edges }, part, way);
	const drawn = new Map(
		[...cards].flatMap((id) => (hops.has(id) ? [[id, hops.get(id) ?? 0]] : [])),
	);
	const open = openModules(projection);
	const parts = [...drawn.keys()].filter((id) => id !== part && !open.has(id)).length;
	for (const { line, joins } of connections) {
		const reached = joins.flatMap(({ id }) => hops.get(id) ?? []);
		if (reached.length > 0) drawn.set(line.id, Math.min(...reached));
	}
	return { hops: drawn, parts };
}

export { pictureReach };

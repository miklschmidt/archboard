// What a door stands for, read from the relationships behind its lines.
//
// A door is a card with a name only, so a picture says that a module is touched
// and not by what. Selecting a door lists its real endpoints, grouped by the
// child that reaches them. An endpoint is reached through the part that holds it.

import type { projectModel } from "#shared/rules/model-projection.ts";

type Projection = ReturnType<typeof projectModel>;
type Edge = Projection["listed"][number]["joins"][number];

/** One child of the open module, or the module itself, with what it exchanges with a door. */
interface DoorEndpoints {
	readonly part: string;
	readonly edges: readonly Edge[];
}

/**
 * The part of the reading that holds an authored endpoint.
 * @param id The endpoint.
 * @param parents Each module's parent.
 * @param parts The parts of the reading.
 * @returns The child that holds it, or the outermost module when none does.
 */
function holdingPart(
	id: string,
	parents: ReadonlyMap<string, string | undefined>,
	parts: ReadonlySet<string>,
): string {
	let at = id;
	for (let up = parents.get(at); !parts.has(at) && up !== undefined; up = parents.get(at)) at = up;
	return at;
}

/**
 * The real endpoints behind a door, grouped by child.
 * @param projection The current reading.
 * @param door The door's module identity.
 * @returns Each reaching child and its relationships, in drawn order, or nothing for another module.
 */
function doorEndpoints(projection: Projection, door: string): DoorEndpoints[] {
	if (!projection.context.some((module) => module.id === door)) return [];
	const parents = new Map(projection.complete.nodes.map((node) => [node.id, node.parent]));
	const parts = new Set(projection.children.map((node) => node.id));
	const groups = new Map<string, Edge[]>();
	const lines = projection.listed.filter(({ line }) => line.from === door || line.to === door);
	for (const { line, joins } of lines) {
		for (const edge of joins) {
			const part = holdingPart(line.from === door ? edge.to : edge.from, parents, parts);
			groups.set(part, [...(groups.get(part) ?? []), edge]);
		}
	}
	return [...groups].map(([part, edges]) => ({ part, edges }));
}

export { doorEndpoints };

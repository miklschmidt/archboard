// What a reading opens beside its scope: which frames stand in the picture, what a door's or a
// frame's control asks of the address, and the order a keyboard walks the picture in.

import { siblingOf, type ModuleTree } from "#ui/rules/architecture-model/module-tree.ts";
import type { Projection } from "#ui/rules/architecture-model/scene.ts";

/**
 * The frames that a reading opens beside its scope.
 * @param projection The reading.
 * @returns Each frame once.
 */
function framesOf(projection: Pick<Projection, "expanded">): readonly string[] {
	return [...new Set(projection.expanded.map(({ frame }) => frame))];
}

/**
 * Every module that a reading draws open.
 * @param projection The reading.
 * @returns The open module, or null for the roots, and each expanded frame.
 */
function openModules(
	projection: Pick<Projection, "opened" | "expanded">,
): ReadonlySet<string | null> {
	return new Set([projection.opened, ...framesOf(projection)]);
}

/**
 * The control that a subject wears in a reading.
 * @param projection The reading.
 * @param id The subject.
 * @returns Whether it expands or collapses, or nothing for a subject with no control.
 */
function toggleOf(projection: Pick<Projection, "content">, id: string) {
	return projection.content.nodes.find((node) => node.id === id)?.toggle;
}

/**
 * The list of the address once a control acts. It keeps only what still opens, so a collapse also
 * lets go of what the model no longer holds.
 * @param projection The reading.
 * @param id The door or frame.
 * @returns The next list, or null for a subject with no control.
 */
function toggled(
	projection: Pick<Projection, "content" | "expanded">,
	id: string,
): readonly string[] | null {
	const toggle = toggleOf(projection, id);
	if (toggle === undefined) return null;
	const kept = projection.expanded.filter(({ frame }) => frame !== id).map(({ asked }) => asked);
	return toggle === "expand" ? [...kept, id] : kept;
}

/**
 * The cards of a picture in the order a keyboard walks them: the parts of the open module, each
 * expanded frame with its parts, then the doors.
 * @param projection The reading.
 * @returns The cards.
 */
function pictureCards(projection: Projection): readonly string[] {
	const { opened, children, context } = projection;
	const frames = framesOf(projection);
	/**
	 * The closed cards that an open module holds.
	 * @param frame The open module, or null for the roots.
	 * @returns The cards.
	 */
	const partsOf = (frame: string | null): readonly string[] =>
		children
			.filter(({ id, parent }) => (parent ?? null) === frame && !frames.includes(id))
			.map(({ id }) => id);
	return [
		...partsOf(opened),
		...frames.flatMap((frame) => [frame, ...partsOf(frame)]),
		...context.map(({ id }) => id),
	];
}

/**
 * The card beside a selected card. A card that the picture does not draw walks its siblings.
 * @param tree The modules.
 * @param projection The reading.
 * @param card The selected card.
 * @param step How far to walk: -1 for the one before, 1 for the one after.
 * @returns The card, or null where the walk ends.
 */
function cardBeside(
	tree: ModuleTree,
	projection: Projection,
	card: string,
	step: number,
): string | null {
	const cards = pictureCards(projection);
	const at = cards.indexOf(card);
	return at === -1 ? (siblingOf(tree, card, step)?.id ?? null) : (cards[at + step] ?? null);
}

export { cardBeside, framesOf, openModules, toggled, toggleOf };

// Text elements Excalidraw minted arrive with 21-character ids, and a note
// can only hold eight (`src/shared/ids/ids.ts`). They are renamed before the
// report that would otherwise get them renamed by the server, and every
// reference in the scene follows.

import { derivedId, isBlockId } from "@/shared/ids/ids";
import type { SceneElement } from "@/ui/canvas/lib/reporting-state";

/** id -> replacement id. */
type Renames = ReadonlyMap<string, string>;

/**
 * Text elements whose ids a note cannot hold, excluding those under an editor.
 * @param scene The scene.
 * @param withheld Ids under an open editor, which must keep their ids (TASK-098).
 * @returns The elements to rename.
 */
function foreignTexts(
	scene: readonly SceneElement[],
	withheld: ReadonlySet<string>,
): SceneElement[] {
	return scene.filter(
		(element) =>
			element.type === "text" &&
			element.isDeleted !== true &&
			!withheld.has(element.id) &&
			!isBlockId(element.id),
	);
}

/**
 * Mint a note-safe id for each foreign text.
 * @param scene The scene, whose ids are all taken.
 * @param foreign The elements to rename.
 * @returns The renames.
 */
function planRenames(scene: readonly SceneElement[], foreign: readonly SceneElement[]): Renames {
	const taken = new Set(scene.map((element) => element.id));
	const renames = new Map<string, string>();
	for (const element of foreign) {
		const name = derivedId(element.id, taken);
		taken.add(name);
		renames.set(element.id, name);
	}
	return renames;
}

/**
 * Follow the renames through an element's arrow bindings, touching only a
 * binding that names a renamed element so no key is added to one that had none.
 * @param next The element copy being renamed.
 * @param renames The renames.
 */
function renameBindings(next: SceneElement, renames: Renames): void {
	const start = renamedBinding(next.startBinding, renames);
	if (start !== undefined) {
		next.startBinding = start;
	}
	const end = renamedBinding(next.endBinding, renames);
	if (end !== undefined) {
		next.endBinding = end;
	}
}

/**
 * A binding with its element id renamed, when the binding names a renamed element.
 * @param binding The binding, when the element has one.
 * @param renames The renames.
 * @returns The renamed binding, or undefined when nothing changes.
 */
function renamedBinding<Binding extends { elementId: string }>(
	binding: Binding | null | undefined,
	renames: Renames,
): Binding | undefined {
	const target = binding ? renames.get(binding.elementId) : undefined;
	return binding && target !== undefined ? { ...binding, elementId: target } : undefined;
}

/**
 * Follow the renames through one element and everything it points at.
 * @param element The element.
 * @param renames The renames.
 * @returns A copy with every renamed reference updated.
 */
function renameReferences(element: SceneElement, renames: Renames): SceneElement {
	const next: SceneElement = { ...element, id: renames.get(element.id) ?? element.id };
	if (Array.isArray(next.boundElements)) {
		next.boundElements = next.boundElements.map((bound) => {
			const renamed = renames.get(bound.id);
			return renamed === undefined ? bound : { ...bound, id: renamed };
		});
	}
	const containerId =
		typeof next.containerId === "string" ? renames.get(next.containerId) : undefined;
	if (containerId !== undefined) {
		next.containerId = containerId;
	}
	renameBindings(next, renames);
	return next;
}

/**
 * Rename every foreign text id in the scene, and every reference to one.
 * @param scene The scene.
 * @param withheldIds Ids under an open editor, which keep their ids.
 * @returns The renamed scene, or null when nothing needed renaming.
 */
function renameTextIds(
	scene: readonly SceneElement[],
	withheldIds: readonly string[],
): SceneElement[] | null {
	const foreign = foreignTexts(scene, new Set(withheldIds));
	if (foreign.length === 0) {
		return null;
	}
	const renames = planRenames(scene, foreign);
	return scene.map((element) => renameReferences(element, renames));
}

export { renameTextIds };

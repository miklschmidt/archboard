// What an open file brings into the picture (TASK-648). The server names the file's owners by the
// code check's own rule (ADR 0046, "Bound code"), so this file only decides where the picture goes
// with them: owners that share a parent open that parent, as Find opens a module among its
// siblings, and owners spread over several parents become a focus, which draws exactly them.

import type { CodeFile } from "#ui/architecture-drawing/code-browser/clients/code-files.ts";
import type { FileTarget } from "#ui/panes/reading-routing/hooks/use-model-location.ts";

/** A module, as the owners rule reads it. */
interface ModuleParent {
	readonly id: string;
	readonly parent?: string | undefined;
}

/**
 * Every module that owns a file: those bound to the file as a whole, then those bound to a symbol
 * in it, each once.
 * @param owners The file's owners.
 * @returns Their identities, in that order.
 */
function ownerIds(owners: CodeFile["owners"]): readonly string[] {
	return [...new Set([...owners.file, ...owners.symbols.map((one) => one.subject)])];
}

/**
 * Where the picture goes with a file.
 * @param ids The file's owners.
 * @param modules Every module of the reading.
 * @param drawnOpen Whether the picture already draws a module open, so its parts stay where they stand.
 * @param opened The module the reading opens now.
 * @returns The scope that holds them all, a focus on them, or null when no module owns the file.
 */
function ownerPicture(
	ids: readonly string[],
	modules: readonly ModuleParent[],
	drawnOpen: (id: string | null) => boolean,
	opened: string | null,
): FileTarget["picture"] {
	if (ids.length === 0) return null;
	const parents = new Set(
		ids.map((id) => modules.find((module) => module.id === id)?.parent ?? null),
	);
	if (parents.size > 1) return { focus: ids };
	const [parent = null] = parents;
	return { scope: drawnOpen(parent) ? opened : parent };
}

export { ownerIds, ownerPicture };

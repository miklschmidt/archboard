import type { ArchitectureModel } from "#shared/schemas/model.ts";

/** A state that names the state it follows. */
type Following = Pick<NonNullable<ArchitectureModel["selectedState"]>, "id" | "predecessor">;

/**
 * Whether a draft follows Current: its chain of predecessors, through the other drafts, reaches
 * the current state. A draft written on a planning root, or on a state that Current has since
 * replaced, does not, and Current is not what it was written on. The reading and the control
 * beside it both ask this, so that the base they name is the same one.
 * @param draft The draft.
 * @param drafts Every active draft.
 * @param currentId The current state, when the model has one.
 * @returns True when the chain reaches the current state.
 */
function followsCurrent(
	draft: Following,
	drafts: readonly Following[],
	currentId: string | undefined,
): boolean {
	if (currentId === undefined) return false;
	const seen = new Set<string>();
	let at: Following | undefined = draft;
	while (at !== undefined && !seen.has(at.id)) {
		seen.add(at.id);
		if (at.predecessor === currentId) return true;
		const next: string | null | undefined = at.predecessor;
		at = drafts.find(({ id }) => id === next);
	}
	return false;
}

export { followsCurrent };

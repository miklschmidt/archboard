import type { Model } from "@archboard/board/content";

type Walkthrough = Model["walkthroughs"][number];

/**
 * Whether a module sits in a scope.
 * @param id The module.
 * @param scope The scope.
 * @param parents The containment of the reading.
 * @returns True for the scope and for what it holds.
 */
function within(
	id: string,
	scope: string,
	parents: ReadonlyMap<string, string | undefined>,
): boolean {
	for (let at: string | undefined = id; at !== undefined; at = parents.get(at)) {
		if (at === scope) return true;
	}
	return false;
}

/**
 * The walkthroughs that concern a scope: those with a step that opens it or a part of it,
 * or that names a subject inside it.
 * @param model The modules and walkthroughs.
 * @param scope The open module, or null for the whole model, which every walkthrough concerns.
 * @returns The walkthroughs, in authored order.
 */
function walkthroughsAbout(
	model: Pick<Model, "modules" | "walkthroughs">,
	scope: string | null,
): readonly Walkthrough[] {
	if (scope === null) return model.walkthroughs;
	const parents = new Map(model.modules.map((module) => [module.id, module.parent]));
	return model.walkthroughs.filter((walkthrough) =>
		walkthrough.beats.some(({ reading }) =>
			[reading.scope, ...reading.focus, ...reading.selection].some(
				(id) => id !== undefined && within(id, scope, parents),
			),
		),
	);
}

export { walkthroughsAbout };

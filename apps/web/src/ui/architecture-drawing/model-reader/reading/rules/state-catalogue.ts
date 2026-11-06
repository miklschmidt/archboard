import type { Model } from "@archboard/model/content";

const NO_STATES: Readonly<NonNullable<Model["states"]>> = Object.freeze([]);

/**
 * Read complete state metadata. A current snapshot has only the authored states, so they take the
 * places they hold in the complete catalogue: a menu does not shift when a read brings the rest.
 * @param model The current public catalogue, when available.
 * @returns Its known logical readings without another content cache.
 */
function stateCatalogue(model: Model | undefined): Readonly<NonNullable<Model["states"]>> {
	if (model === undefined) return NO_STATES;
	if (model.states !== undefined) return model.states;
	const { current } = model.manifest;
	if (current === null) return model.proposals;
	return [{ ...current, lifecycle: "current" }, ...model.proposals];
}

export { stateCatalogue };

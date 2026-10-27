import type { Model } from "#ui/rules/architecture-model/projection.ts";

const NO_STATES: Readonly<NonNullable<Model["states"]>> = Object.freeze([]);

/**
 * Read complete state metadata while older current snapshots still expose active proposals.
 * @param model The current public catalogue, when available.
 * @returns Its known logical readings without another content cache.
 */
function stateCatalogue(model: Model | undefined): Readonly<NonNullable<Model["states"]>> {
	return model?.states ?? model?.proposals ?? NO_STATES;
}

export { stateCatalogue };

import type {
	LegacyInventory,
	LegacyOccurrence,
	MigrationConflict,
} from "#shared/schemas/migration.ts";

/**
 * Identify a decision by its exact source revision and source coordinates.
 * @param inventory The exact source revision.
 * @param kind The decision category.
 * @param options Original candidate values with their locations.
 * @returns An unresolved decision that cannot survive an unnoticed source edit.
 */
function migrationConflict(
	inventory: Pick<LegacyInventory, "source">,
	kind: MigrationConflict["kind"],
	options: LegacyOccurrence[],
): MigrationConflict {
	return {
		key: `${inventory.source.digest}:${kind}:${JSON.stringify(options.map(({ file, state, subject, path }) => [file, state, subject, path]))}`,
		kind,
		options,
	};
}

export { migrationConflict };

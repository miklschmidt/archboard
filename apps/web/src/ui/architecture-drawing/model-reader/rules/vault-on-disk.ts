// Whether a reading is the vault on disk. An agent explains it, the code check and the history
// lens read its checkout, and claims mark it. An original under migration and a branch reading
// (the vault as a source ref holds it, read from Git) are not the vault on disk, so they offer none
// of that.

/** What says where a reading comes from. */
interface ReadingSource {
	readonly migrationPreview?: unknown;
	readonly sourceRef?: unknown;
}

/**
 * Whether a reading is the vault on disk.
 * @param model The reading.
 * @returns False for an original under migration and for a branch reading.
 */
function readsVaultOnDisk(model: ReadingSource): boolean {
	return model.migrationPreview === undefined && model.sourceRef === undefined;
}

export { readsVaultOnDisk };

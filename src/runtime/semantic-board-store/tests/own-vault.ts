// Proof that a test's boards land in the vault the test made.
//
// The vault is read from the environment once, when the config module is first
// imported, and an import runs before any statement in the file that wrote it.
// That is why these owners set `ARCHBOARD_VAULT` at the top and then reach the
// store through `await import(...)` inside `beforeAll`: a static import of
// anything that pulls the config would fix the vault to whatever the caller
// happened to have — a person's own, with their boards in it — before the
// assignment ran at all.
//
// This file therefore imports nothing. It is handed the path a board resolved
// to and says whether that is where the test meant to write. Nothing here can
// prevent a mislanding; what it does is make it loud, before the first write,
// instead of leaving a scatter of fixture boards in somebody's vault.

/**
 * Refuse to run unless the boards land where this test says they do.
 * @param vault The directory the test made for itself.
 * @param landing Where a board of this test actually resolves, from the store.
 * @throws {Error} When that is outside the test's own vault.
 */
function ownVaultOrRefuse(vault: string, landing: string): void {
	if (!landing.startsWith(vault)) {
		throw new Error(
			`This owner writes boards, and the vault it resolved is not the one it made: ${landing} ` +
				`is outside ${vault}. Run it in its own process — \`bun test --isolate <this file>\` — ` +
				"rather than alongside a file that resolved the vault first.",
		);
	}
}

export { ownVaultOrRefuse };

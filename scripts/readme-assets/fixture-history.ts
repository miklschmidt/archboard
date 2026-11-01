// Restore the history that copied canonical inputs require, through the public importer.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ArchitectureImportRequestSchema } from "@archboard/board/model";
import { exportArchitectureModel, importArchitectureModel } from "@archboard/board/store-write";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { ROOT, attempt, inOrder, run } from "./tools.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import type { TrackedVault } from "./server.ts";

/** Public Git identity and signing configuration inherited by a copied example. */
const IDENTITY = [
	"user.name",
	"user.email",
	"user.signingkey",
	"gpg.format",
	"gpg.ssh.program",
	"gpg.ssh.allowedSignersFile",
	"commit.gpgsign",
] as const;

/**
 * Initialize only the disposable take repository with the configured signer.
 * @param holder The copied repository directory.
 * @param source The authored source of this take.
 */
async function initializeTakeRepository(holder: string, source: TrackedVault): Promise<void> {
	await run(["git", "init", "-q", holder]);
	await inOrder(IDENTITY, async (key) => {
		const value = await attempt(["git", "config", "--get", key]);
		if (value.status === 0) await run(["git", "-C", holder, "config", key, value.stdout.trim()]);
	});
	const origin =
		source === "examples/web-shop"
			? "https://example.invalid/web-shop.git"
			: (await run(["git", "remote", "get-url", "origin"])).stdout.trim();
	await run(["git", "-C", holder, "remote", "add", "origin", origin]);
}

/**
 * Read the example archive or export this checkout's complete live architecture.
 * @param source The tracked vault copied by the take.
 * @returns An import request with the exact copied-input revision.
 * @throws {Error} When the source cannot supply complete portable history.
 */
async function importRequest(source: TrackedVault) {
	if (source === "examples/web-shop") {
		return ArchitectureImportRequestSchema.parse(
			JSON.parse(readFileSync(join(ROOT, source, "history.import.json"), "utf8")),
		);
	}
	const exported = await exportArchitectureModel(join(ROOT, source));
	if (!exported.success) throw new Error(JSON.stringify(exported));
	return {
		bundle: exported.bundle,
		expectedRevision: exported.bundle.revision,
		operationId: "restore-readme-take",
		writer: "readme",
		doing: "Restore the copied architecture and its complete retained history",
	};
}

/**
 * Restore archive dependencies without replacing different authored inputs.
 * @param source The tracked vault copied by the take.
 * @param holder The disposable repository that holds the copy.
 * @throws {Error} When copied inputs differ or history cannot be restored.
 */
async function restoreFixtureHistory(source: TrackedVault, holder: string): Promise<void> {
	const request = await importRequest(source);
	await initializeTakeRepository(holder, source);
	const restored = await importArchitectureModel(join(holder, ".archboard", "vault"), request);
	if (!restored.success) throw new Error(JSON.stringify(restored));
}

export { restoreFixtureHistory };

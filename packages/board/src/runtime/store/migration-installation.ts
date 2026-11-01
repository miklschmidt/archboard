import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import { MIGRATION_PLAN_PATH } from "#runtime/store/migration-plan.ts";
import { checkoutContext } from "#runtime/store/model-state.ts";
import type { ArchiveContext } from "#runtime/store/model-archive.ts";
/**
 * Capture the saved plan beside all source and destination inputs.
 * @param vault The explicitly addressed vault.
 * @returns Complete source, plan and target images.
 */
function migrationInstallationFiles(vault: string) {
	const captured = readModelFiles(vault),
		path = join(vault, MIGRATION_PLAN_PATH);
	if (existsSync(path)) {
		if (!lstatSync(path).isFile())
			captured.diagnostics.push({
				code: "UNSAFE_PATH",
				file: MIGRATION_PLAN_PATH,
				message: "The saved migration plan is not a regular file.",
				recovery: "Restore the original regular plan file before migration recovery.",
			});
		else captured.inputs.set(MIGRATION_PLAN_PATH, readFileSync(path));
	}
	return { ...captured, revision: modelRevision(captured.inputs) };
}
/**
 * Bind preview intent to one addressed checkout without publishing machine paths.
 * @param vault The explicitly addressed vault.
 * @param context The complete context.
 * @returns The exact private checkout fingerprint.
 */
async function migrationContextFingerprint(vault: string, context: ArchiveContext) {
	return createHash("sha256")
		.update(JSON.stringify({ vault: resolve(vault), checkout: await checkoutContext(context) }))
		.digest("hex");
}
export { migrationInstallationFiles, migrationContextFingerprint };

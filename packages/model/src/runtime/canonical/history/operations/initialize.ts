import type { z } from "zod";
import type { ArchitectureArchiveInitializationSchema } from "#shared/canonical-contracts/schemas/model.ts";
import {
	initializePrivateArchive,
	privateArchiveLocation,
} from "#runtime/canonical/archive/store/model-archive-location.ts";
import { withModelLock } from "#runtime/canonical/installation/store/model-state.ts";
import { historyResult } from "#runtime/canonical/history/operations/result.ts";

/**
 * Explicitly initialize private history without creating or changing a source repository.
 * @param vault The explicitly addressed vault.
 * @returns Local setup information or actionable archive diagnostics.
 */
async function initializeArchitectureArchive(
	vault: string,
): Promise<z.infer<typeof ArchitectureArchiveInitializationSchema>> {
	return historyResult("ARCHIVE_WRITE_FAILED", async () => {
		await privateArchiveLocation(vault);
		return withModelLock(vault, async () => ({
			success: true as const,
			archive: await initializePrivateArchive(vault),
		}));
	});
}
export { initializeArchitectureArchive };

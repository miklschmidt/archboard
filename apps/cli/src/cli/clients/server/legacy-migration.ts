import {
	LegacyInventoryReadSchema,
	type LegacyInventoryRead,
	type LegacyMappingWrite,
} from "@archboard/board/migration";
import { isRecord } from "@archboard/diagnostics/unknown-record";
import { currentWriteDoing, requestJson } from "@archboard/server-lifecycle/server-client";

/**
 * Preserve structured runtime refusals across the HTTP boundary.
 * @param path The explicit migration route.
 * @param init The request method and optional body.
 * @returns The inventory or its actionable refusal.
 */
async function migrationRequest(path: string, init?: RequestInit): Promise<LegacyInventoryRead> {
	try {
		return LegacyInventoryReadSchema.parse(await requestJson<unknown>(path, init));
	} catch (error) {
		const parsed = LegacyInventoryReadSchema.safeParse(
			isRecord(error) ? error["answer"] : undefined,
		);
		if (parsed.success && !parsed.data.success) return parsed.data;
		throw error;
	}
}

/**
 * Inventory legacy inputs without changing architecture or creating a plan file.
 * @param origin The owner's stable import namespace.
 * @returns Original coverage, evidence and any saved mapping choices.
 */
function readLegacyInventoryOnServer(origin: string): Promise<LegacyInventoryRead> {
	return migrationRequest(
		`/api/architecture/migration/inventory?${new URLSearchParams({ origin })}`,
	);
}

/**
 * Save explicit choices separately from active architecture.
 * @param request The complete plan and previously observed plan revision.
 * @returns The inventory with its saved choices or a stale-write refusal.
 */
function saveLegacyMappingPlanOnServer(
	request: Omit<LegacyMappingWrite, "doing">,
): Promise<LegacyInventoryRead> {
	return migrationRequest("/api/architecture/migration/plan", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...request, doing: currentWriteDoing() }),
	});
}
export { readLegacyInventoryOnServer, saveLegacyMappingPlanOnServer };

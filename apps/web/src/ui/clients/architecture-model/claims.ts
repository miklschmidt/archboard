import type { ArchitectureClaimList } from "@archboard/board/model";
import { inVault, requestJson } from "@archboard/server-requests";

/**
 * End the exact claim that the person selected.
 * @param vault The explicitly addressed vault.
 * @param claim The displayed claim identity.
 * @returns The remaining claims after the human action.
 */
function takeBackClaim(vault: string, claim: string): Promise<ArchitectureClaimList> {
	return requestJson(inVault("/api/architecture/claims/take-back", vault), {
		method: "POST",
		payload: { vault, claim, origin: "human" },
	});
}

export { takeBackClaim };

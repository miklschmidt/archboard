// What "Fix with Codex" asks the agent: run the checker against the vault this
// browser shows, repair what is clear, ask about what is not, and check again.

const REPAIR_INSTRUCTIONS =
	"Repair clear configuration and board issues reported by the checker. Ask me when a repair is ambiguous. Use ordinary board claims and version checks for all board writes; do not bypass them. Run the checker again after repairs and report any remaining diagnostics.";

/**
 * The repair request, addressed to the canvas this browser shows.
 * @param serverUrl The canvas origin.
 * @returns The message for the agent.
 */
function vaultRepairRequest(serverUrl: string): string {
	return `Run archboard --url ${serverUrl} check for this vault. Use this same --url for every archboard command. ${REPAIR_INSTRUCTIONS}`;
}

export { vaultRepairRequest };

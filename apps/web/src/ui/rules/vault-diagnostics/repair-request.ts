// What "Fix with Codex" asks the agent: run the semantics check, the checker
// the pane's diagnostics come from, against the vault the focused pane is in,
// repair what is clear, ask about what is not, and check again. The vault is
// named with -C on every command (ADR 0049), because the agent may work in
// another checkout than the one the person is reading, and -C on a vault
// directory finds that same vault.

const REPAIR_INSTRUCTIONS =
	"Repair clear configuration and board issues reported by the checker. Ask me when a repair is ambiguous. Use ordinary board claims and version checks for all board writes; do not bypass them. Run the checker again after repairs and report any remaining diagnostics.";

/**
 * The repair request, addressed to the server this browser shows and the vault it diagnosed.
 * @param serverUrl The server's origin.
 * @param vault The vault the diagnostics are about.
 * @returns The message for the agent.
 */
function vaultRepairRequest(serverUrl: string, vault: string): string {
	const named = `'${vault.replaceAll("'", String.raw`'\''`)}'`;
	return `Run archboard -C ${named} --url ${serverUrl} check semantics. Use this same -C and --url for every archboard command. ${REPAIR_INSTRUCTIONS}`;
}

export { vaultRepairRequest };

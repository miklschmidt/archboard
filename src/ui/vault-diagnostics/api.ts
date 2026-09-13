import {
	readComposerLink,
	type WorkbenchComposerController,
	type WorkbenchComposerSubmissionResult,
} from "@/ui/workbench-composer";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

interface VaultRepairTarget {
	transport: BrowserWorkbenchTransport;
	composer: WorkbenchComposerController;
}

const REPAIR_INSTRUCTIONS =
	"Repair clear configuration and board issues reported by the checker. Ask me when a repair is ambiguous. Use ordinary board claims and version checks for all board writes; do not bypass them. Run the checker again after repairs and report any remaining diagnostics.";

/**
 * Start an idle workhorse or queue behind its active turn.
 * @param target The current pane's owners.
 * @param chooseThread The existing link/create chooser.
 * @param serverUrl The canvas origin, to target the vault shown in this browser.
 * @returns What happened, without treating delivery as a repair.
 */
async function requestVaultRepair(
	target: {
		transport: Pick<BrowserWorkbenchTransport, "state">;
		composer: Pick<WorkbenchComposerController, "submit">;
	} | null,
	chooseThread: () => void,
	serverUrl: string,
): Promise<string> {
	if (target === null)
		return "Open a board to attach a Codex workhorse, then choose Fix with Codex again.";
	const link = readComposerLink(target.transport.state());
	if (link.kind === "unbound" || link.kind === "inspect_only") {
		chooseThread();
		return "Link or create a workhorse, then choose Fix with Codex again.";
	}
	if (link.kind === "unavailable") return link.reason;
	const result = await target.composer.submit({
		text: `Run archboard --url ${serverUrl} check for this vault. Use this same --url for every archboard command. ${REPAIR_INSTRUCTIONS}`,
		delivery: link.turn.kind === "idle" ? "send" : "queue",
	});
	return repairMessage(result);
}

/**
 * Explain dispatch separately from the checker's result.
 * @param result The composer settlement.
 * @returns The user-visible delivery state.
 */
function repairMessage(result: WorkbenchComposerSubmissionResult): string {
	if (result.outcome === "queued") return "Repair request added to the workhorse queue.";
	if (result.outcome === "delivered")
		return "Repair request sent to Codex. Diagnostics clear only after the checker confirms the repair.";
	return result.reason;
}

export { requestVaultRepair, type VaultRepairTarget };

// Every fact a dynamic coordination card discloses: the full call identity,
// the exact target, prompt and fork boundary, both OperationIds, the
// immutable effect hash, and the tool result once the host published one.

import type { BrowserDynamicApproval } from "@/shared/codex-browser-model";
import type { WorkbenchApprovalDisclosure } from "@/ui/workbench-approvals/contracts";
import { row, timestampText } from "@/ui/workbench-approvals/lib/disclosure";

type Effect = BrowserDynamicApproval["effect"];
type Rows = readonly WorkbenchApprovalDisclosure[];

/**
 * The identity of the call that raised the approval.
 * @param approval The request.
 * @returns The rows.
 */
function dynamicIdentityRows(approval: BrowserDynamicApproval): Rows {
	const identity = approval.identity;
	return Object.freeze([
		row("Calling thread", identity.threadId, true),
		row("Calling turn", identity.turnId, true),
		row("Dynamic call id", identity.callId, true),
		row("Tool namespace", identity.namespace, true),
		row("Tool", identity.tool, true),
		row("Manifest hash", identity.manifestHash, true),
		row("OperationId", identity.operationId, true),
		row("Child", identity.child, true),
		row("Child epoch", identity.epoch, true),
	]);
}

/**
 * The words for a fork's effective boundary.
 * @param effect The effect.
 * @returns The words.
 */
function boundaryText(effect: Effect): string {
	if (effect.tool !== "fork_thread") {
		return "Not applicable: this effect has no fork boundary.";
	}
	const boundary = effect.effectiveBoundary;
	if (boundary.relation === "self") {
		return `Self fork before the calling turn ${boundary.beforeTurnId}.`;
	}
	return boundary.beforeTurnId === null
		? "Fork of another thread from its current head."
		: `Fork of another thread before turn ${boundary.beforeTurnId}.`;
}

/**
 * The prompt an effect carries.
 * @param effect The effect.
 * @returns The prompt, or the words for a fork that starts no turn.
 */
function promptText(effect: Effect): string {
	if (effect.tool === "fork_thread") {
		return effect.arguments.prompt ?? "No prompt: this fork starts no turn.";
	}
	return effect.arguments.prompt;
}

/**
 * The effect exactly as the host published it.
 * @param approval The request.
 * @returns The rows.
 */
function dynamicEffectRows(approval: BrowserDynamicApproval): Rows {
	const effect = approval.effect;
	const initialTurn = effect.initialTurnOperationId;
	return Object.freeze([
		row(
			"Target thread",
			effect.target ?? "A new thread that does not exist yet.",
			effect.target !== null,
		),
		row("Prompt", promptText(effect)),
		row("Effective fork boundary", boundaryText(effect)),
		row("Mutation OperationId", effect.mutationOperationId, true),
		initialTurn === null
			? row("Initial turn OperationId", "None: this effect starts no turn.")
			: row("Initial turn OperationId", initialTurn, true),
		row("Effect hash", approval.effectHash, true),
		row("Created", timestampText(approval.createdAtMs), true),
		row("Expires", timestampText(approval.expiresAtMs), true),
		row("Host summary", effect.visualSummary),
		approval.toolResult === null
			? row("Tool result", "The host published no tool result yet.")
			: row("Tool result", approval.toolResult, true),
	]);
}

export { dynamicEffectRows, dynamicIdentityRows };

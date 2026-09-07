import { createHash } from "node:crypto";

import type {
	BrowserCommand,
	BrowserDynamicApprovalResponse,
	BrowserSnapshot,
	DeliveryOutcome,
} from "@/shared/codex-browser-model";
import type { BrowserCommandId, JsonRpcRequestId } from "@/shared/codex-workbench-identity";
import { parseApprovalResponse } from "@/runtime/codex-approvals";
import { SupportedLoginAccountParamsSchema } from "@/runtime/codex-protocol";
import type { BrowserLeaseManager } from "@/server/codex-workbench/lib/lease";
import {
	CodexWorkbenchGatewayError,
	type BrowserAccountLoginCommand,
	type BrowserActionContext,
	type BrowserActionResult,
	type BrowserApprovalCommand,
	type BrowserGatewayMessage,
	type BrowserLeaseRecord,
	type BrowserPublishedPayload,
} from "@/server/codex-workbench/lib/contract";

/** The readiness states a login, cancellation or logout may be sent from. */
const ACCOUNT_READINESS = new Set([
	"login_capable",
	"signed_out",
	"login_pending",
	"account_ready",
	"thread_capable",
]);

/** The readiness state every thread-scoped command requires. */
const THREAD_READINESS = new Set(["thread_capable"]);

/**
 * A browser command this gateway owns: the model's command union, with the
 * two commands whose payload the gateway parses into its own shape.
 */
type OwnedBrowserCommand =
	| Exclude<BrowserCommand, { readonly command: "accountLogin" | "approvalRespond" }>
	| BrowserAccountLoginCommand
	| BrowserApprovalCommand;

/** One action per command name, which is what makes the dispatch total. */
type BrowserActionDispatch = {
	readonly [Name in OwnedBrowserCommand["command"]]: (
		command: Extract<OwnedBrowserCommand, { readonly command: Name }>,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
};

/**
 * Whether a value is a plain object that can be read by key.
 * @param value Anything that arrived over the socket.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Whether two values are the same on the wire, which is the only sameness a
 * browser binding can be compared by.
 * @param left One value.
 * @param right The other.
 * @returns True when both serialize identically.
 */
function sameWireValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * A command's fingerprint, so a retry of the same command id can be told from
 * a different command reusing it.
 * @param command The command.
 * @returns The fingerprint.
 */
function fingerprintCommand(command: OwnedBrowserCommand): string {
	return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

/**
 * Parse the payloads the gateway owns rather than the browser model: a login's
 * account parameters and an approval's response.
 * @param command The command as the model parsed it.
 * @returns The command this gateway acts on.
 */
function normalizeBrowserCommand(command: BrowserCommand): OwnedBrowserCommand {
	if (command.command === "accountLogin")
		return {
			...command,
			login: SupportedLoginAccountParamsSchema.parse(command.login),
		};
	if (command.command === "approvalRespond")
		return {
			...command,
			response: parseApprovalResponse(command.response),
		};
	return command;
}

/**
 * Whether a value is one of the three delivery outcomes.
 * @param value The candidate.
 * @returns True for a delivery outcome.
 */
function isDeliveryOutcome(value: unknown): value is DeliveryOutcome {
	return value === "delivered" || value === "not_delivered" || value === "outcome_unknown";
}

/**
 * What an action's own result says became of the command it carried out.
 * @param value The action's result.
 * @returns The outcome; an action that answers nothing delivered.
 */
function actionOutcome(value: BrowserActionResult): DeliveryOutcome {
	if (value === undefined) return "delivered";
	return value.outcome;
}

/**
 * What a thrown failure says became of the command: what it named, or nothing
 * delivered.
 * @param error The failure.
 * @returns The outcome.
 */
function errorOutcome(error: unknown): DeliveryOutcome {
	if (isRecord(error) && isDeliveryOutcome(error["outcome"])) return error["outcome"];
	return "not_delivered";
}

/**
 * The refusal code a failure answers with.
 * @param error The failure.
 * @returns Its own code, or the one its outcome implies.
 */
function errorCode(error: unknown): CodexWorkbenchGatewayError["code"] {
	if (error instanceof CodexWorkbenchGatewayError) return error.code;
	return errorOutcome(error) === "outcome_unknown" ? "outcome_unknown" : "command_failed";
}

/** What each refusal code says to the browser, in words a person can act on. */
const REFUSAL_MESSAGES: Partial<Record<CodexWorkbenchGatewayError["code"], string>> = {
	disposed: "The browser gateway is closed.",
	invalid_input: "The browser request is malformed.",
	invalid_command: "The browser command is invalid for this workbench.",
	invalid_projection: "The workbench published invalid browser state.",
	not_ready: "The workbench is not ready for this command.",
	thread_capability_required: "Thread capability is not ready for this command.",
	link_required: "An executable current thread link is required.",
	link_changed: "The pane thread link changed; claim a new command lease.",
	lease_required: "Claim the command lease before sending this command.",
	lease_expired: "The command lease expired; claim a new lease.",
	lease_released: "The command lease was released; claim a new lease.",
	lease_transferred: "The command lease belongs to another browser or pane.",
	child_disconnected: "The Codex child disconnected; inspect state before retrying.",
	approval_not_pending: "That approval is no longer pending.",
	dynamic_approval_not_pending: "That coordination approval is no longer pending.",
	unsupported_command: "The browser command is not supported by this gateway.",
};

/**
 * What a command result says, which is fixed text per outcome and code: the
 * browser is never shown a message built from what it sent.
 * @param outcome What became of the command.
 * @param code The refusal code, or null for a delivered command.
 * @returns The message, or null when there is nothing to say.
 */
function staticMessage(
	outcome: DeliveryOutcome,
	code: CodexWorkbenchGatewayError["code"] | null,
): string | null {
	if (code === null) return null;
	if (code === "outcome_unknown" || outcome === "outcome_unknown")
		return "The command may have taken effect; inspect authoritative state before another mutation.";
	if (code === "command_failed") return "The command was not delivered.";
	return REFUSAL_MESSAGES[code] ?? "The browser command was refused.";
}

/**
 * Whether a failure is the delta bound refusing, which a whole snapshot
 * answers instead.
 * @param error The failure.
 * @returns True for the oversized-delta refusal.
 */
function isOversizedDelta(error: unknown): boolean {
	return (
		error instanceof Error && error.message === "the browser delta exceeds its wire-size bound"
	);
}

/**
 * The key one browser's pane connection is held under.
 * @param browserId The browser.
 * @param paneId The pane.
 * @returns The key.
 */
function connectionKey(browserId: string, paneId: string): string {
	return `${browserId}\u0000${paneId}`;
}

/**
 * Refuse an identifier that is not a short opaque name, before it is used as
 * a key or shown anywhere.
 * @param value The identifier.
 * @param field What it names, for the refusal.
 */
function assertOpaqueName(value: string, field: string): void {
	if (typeof value !== "string" || value.length === 0 || value.length > 128)
		throw new CodexWorkbenchGatewayError("invalid_input", `${field} is invalid.`);
}

/**
 * The thread a command names, when it names one.
 * @param command The command.
 * @returns The thread id, or null.
 */
function commandThreadId(command: OwnedBrowserCommand): string | null {
	if ("threadId" in command && typeof command.threadId === "string") return command.threadId;
	return null;
}

/**
 * Whether a command is about the account rather than a thread.
 * @param command The command.
 * @returns True for a login, cancellation or logout.
 */
function isAccountCommand(command: OwnedBrowserCommand): boolean {
	return (
		command.command === "accountLogin" ||
		command.command === "accountLoginCancel" ||
		command.command === "accountLogout"
	);
}

/**
 * Whether a command changes the pane's thread link, and so must not be checked
 * against the link it is replacing.
 * @param command The command.
 * @returns True for a link mutation.
 */
function isThreadLinkCommand(command: OwnedBrowserCommand): boolean {
	return (
		command.command === "threadLinkCreate" ||
		command.command === "threadLinkRefresh" ||
		command.command === "threadLinkAttach" ||
		command.command === "threadLinkRelink"
	);
}

/**
 * Whether a command answers an ordinary approval.
 * @param command The command.
 * @returns True for an approval response.
 */
function isOrdinaryApprovalCommand(
	command: OwnedBrowserCommand,
): command is BrowserApprovalCommand {
	return command.command === "approvalRespond";
}

/**
 * Whether a command answers a coordination approval.
 * @param command The command.
 * @returns True for a dynamic approval response.
 */
function isDynamicApprovalCommand(
	command: OwnedBrowserCommand,
): command is BrowserDynamicApprovalResponse {
	return command.command === "dynamicApprovalRespond";
}

/**
 * The authority an action runs under, which is the lease's own binding.
 * @param record The lease record.
 * @returns The action context.
 */
function actionContext(record: BrowserLeaseRecord): BrowserActionContext {
	return record.binding;
}

/**
 * The pane's thread link, which must be executable for a thread command.
 * @param snapshot The snapshot the command is checked against.
 * @returns The executable link.
 */
function executableLink(snapshot: BrowserSnapshot): BrowserSnapshot["threadLink"] {
	if (snapshot.threadLink.state !== "executable")
		throw new CodexWorkbenchGatewayError(
			"link_required",
			"The current pane has no executable thread link.",
		);
	return snapshot.threadLink;
}

/**
 * Why a command id is no longer the lease's, as the refusal a released lease
 * answers with.
 * @param terminalReason What the gateway remembered about that command id.
 * @returns The refusal code.
 */
function releasedLeaseCode(
	terminalReason: CodexWorkbenchGatewayError["code"] | undefined,
): CodexWorkbenchGatewayError["code"] {
	if (terminalReason === "link_changed" || terminalReason === "lease_transferred") {
		return terminalReason;
	}
	return "lease_released";
}

/**
 * Refuse a command whose lease has already expired or been released, which is
 * a different answer from never having claimed one.
 * @param manager The lease manager.
 * @param commandId The command's id, which is also its lease's id.
 * @param terminalReason What the gateway remembered about that command id.
 * @param current The lease that is active now, when one is.
 */
function refuseEndedLease(
	manager: BrowserLeaseManager,
	commandId: BrowserCommandId,
	terminalReason: CodexWorkbenchGatewayError["code"] | undefined,
	current: BrowserLeaseRecord | null,
): void {
	const state = manager.find(commandId)?.lease.state;
	if (state === "expired")
		throw new CodexWorkbenchGatewayError("lease_expired", "The command lease expired.", {
			commandId,
		});
	const answersForThisCommand = current === null || current.lease.commandId === commandId;
	if (state !== "released" || !answersForThisCommand) {
		return;
	}
	throw new CodexWorkbenchGatewayError(
		releasedLeaseCode(terminalReason),
		"The command lease was released.",
		{ commandId },
	);
}

/**
 * The lease a command must be running under, or the refusal saying why it is
 * not: expired, released, never claimed, or somebody else's.
 * @param manager The lease manager.
 * @param commandId The command's id, which is also its lease's id.
 * @param terminalReason What the gateway remembered about that command id.
 * @returns The active lease record.
 */
function currentLeaseOrThrow(
	manager: BrowserLeaseManager,
	commandId: BrowserCommandId,
	terminalReason?: CodexWorkbenchGatewayError["code"],
): BrowserLeaseRecord {
	const current = manager.current();
	refuseEndedLease(manager, commandId, terminalReason, current);
	if (current === null)
		throw new CodexWorkbenchGatewayError("lease_required", "No command lease is active.", {
			commandId,
		});
	if (current.lease.commandId !== commandId)
		throw new CodexWorkbenchGatewayError(
			"lease_transferred",
			"The command lease was transferred.",
			{
				commandId,
			},
		);
	if (current.lease.state !== "active")
		throw new CodexWorkbenchGatewayError("lease_released", "The command lease is not active.", {
			commandId,
		});
	return current;
}

/**
 * Deliver one message to every subscriber. A broken browser subscriber cannot
 * block other subscribers or the owner projection from advancing.
 * @param listeners The subscribers.
 * @param message The message.
 */
function emit(
	listeners: Set<(message: BrowserGatewayMessage) => void>,
	message: BrowserGatewayMessage,
): void {
	for (const listener of listeners) {
		try {
			listener(message);
		} catch {
			// A broken browser subscriber cannot block other subscribers or the
			// owner projection from advancing.
		}
	}
}

/**
 * The approvals a published payload carries that have reached a terminal
 * state, which are the ones the owner may stop presenting once every browser
 * has seen them.
 * @param payload What was published.
 * @returns The terminal approvals' request ids.
 */
function publishedTerminalIds(payload: BrowserPublishedPayload): readonly JsonRpcRequestId[] {
	const approvals =
		"delta" in payload
			? (payload.delta.approvals ?? [])
			: "snapshot" in payload
				? payload.snapshot.approvals
				: payload.approvals;
	return approvals.flatMap((approval) =>
		approval.lifecycle.state === "staged" || approval.lifecycle.state === "pending"
			? []
			: [approval.requestId],
	);
}

export {
	ACCOUNT_READINESS,
	actionContext,
	actionOutcome,
	assertOpaqueName,
	commandThreadId,
	connectionKey,
	currentLeaseOrThrow,
	emit,
	errorCode,
	errorOutcome,
	executableLink,
	fingerprintCommand,
	isAccountCommand,
	isDynamicApprovalCommand,
	isOrdinaryApprovalCommand,
	isOversizedDelta,
	isRecord,
	isThreadLinkCommand,
	normalizeBrowserCommand,
	publishedTerminalIds,
	sameWireValue,
	staticMessage,
	THREAD_READINESS,
};
export type { BrowserActionDispatch, OwnedBrowserCommand };

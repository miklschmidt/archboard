import type { createCodexBrowserModel } from "@/shared/codex-browser-model";
import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import {
	CodexWorkbenchGatewayError,
	type BrowserLeaseRecord,
	type CodexWorkbenchGatewayOptions,
} from "@/server/codex-workbench/lib/contract";
import {
	ACCOUNT_READINESS,
	commandThreadId,
	currentLeaseOrThrow,
	executableLink,
	isAccountCommand,
	isDynamicApprovalCommand,
	isOrdinaryApprovalCommand,
	isThreadLinkCommand,
	sameWireValue,
	THREAD_READINESS,
	type OwnedBrowserCommand,
} from "@/server/codex-workbench/lib/browser-command";
import type { ConnectionState } from "@/server/codex-workbench/lib/gateway-connections";
import type { LeaseOwner } from "@/server/codex-workbench/lib/gateway-leases";

/** What the admission checks need from the gateway around them. */
interface CommandAdmissionOwners {
	readonly options: CodexWorkbenchGatewayOptions;
	readonly model: ReturnType<typeof createCodexBrowserModel>;
	readonly now: () => number;
	readonly leases: LeaseOwner;
	readonly snapshotFor: (state: ConnectionState) => BrowserSnapshot;
}

/**
 * Refuse a command whose readiness cannot carry a login, cancellation or logout.
 * @param snapshot The snapshot it was checked against.
 */
function ensureAccountReadiness(snapshot: BrowserSnapshot): void {
	if (!ACCOUNT_READINESS.has(snapshot.readiness.state))
		throw new CodexWorkbenchGatewayError("not_ready", "The workbench is not login-capable.");
}

/**
 * Refuse a thread command before the workbench has thread capability.
 * @param snapshot The snapshot it was checked against.
 */
function ensureThreadReadiness(snapshot: BrowserSnapshot): void {
	if (!THREAD_READINESS.has(snapshot.readiness.state))
		throw new CodexWorkbenchGatewayError(
			"thread_capability_required",
			"The workbench has not composed thread capability.",
		);
}

/**
 * Refuse a command aimed at a thread the pane is no longer linked to.
 * @param command The command.
 * @param snapshot The snapshot it was checked against.
 */
function validateThreadTarget(command: OwnedBrowserCommand, snapshot: BrowserSnapshot): void {
	const link = executableLink(snapshot);
	const target = commandThreadId(command);
	if (target !== null && target !== link.threadId)
		throw new CodexWorkbenchGatewayError(
			"link_changed",
			"The command target does not match the current link.",
			{ commandId: command.commandId },
		);
}

/**
 * Refuse a command whose readiness or thread target is wrong for it.
 * @param command The command.
 * @param snapshot The snapshot it was checked against.
 */
function ensureCommandReadiness(command: OwnedBrowserCommand, snapshot: BrowserSnapshot): void {
	if (isAccountCommand(command)) {
		ensureAccountReadiness(snapshot);
		return;
	}
	ensureThreadReadiness(snapshot);
	if (!isThreadLinkCommand(command)) validateThreadTarget(command, snapshot);
}

/**
 * Refuse a login cancellation that does not name the login now waiting.
 * @param command The command.
 * @param snapshot The snapshot it was checked against.
 */
function ensureLoginCancelTarget(command: OwnedBrowserCommand, snapshot: BrowserSnapshot): void {
	if (command.command !== "accountLoginCancel" || snapshot.readiness.state !== "login_pending") {
		return;
	}
	if (command.loginId !== snapshot.readiness.loginId)
		throw new CodexWorkbenchGatewayError(
			"invalid_command",
			"The login cancellation does not match the active login.",
			{ commandId: command.commandId },
		);
}

/**
 * Refuse a command whose lease is not this browser's, this pane's, this
 * socket's and this child epoch's.
 * @param state The connection.
 * @param command The command.
 * @param record The lease it claims to run under.
 */
function ensureLeaseOwnership(
	state: ConnectionState,
	command: OwnedBrowserCommand,
	record: BrowserLeaseRecord,
): void {
	if (
		record.binding.browserId !== state.browserId ||
		record.binding.paneId !== command.paneId ||
		record.binding.connection !== state.instance
	)
		throw new CodexWorkbenchGatewayError("lease_transferred", "The lease owner changed.", {
			commandId: command.commandId,
		});
	if (command.childId !== record.lease.childId || command.epoch !== record.lease.epoch)
		throw new CodexWorkbenchGatewayError("lease_transferred", "The lease target changed.", {
			commandId: command.commandId,
		});
}

/**
 * Refuse a coordination approval response whose captured link is not the one
 * the pane now has.
 * @param command The response.
 * @param snapshot The snapshot it was checked against.
 */
function ensureCapturedLinkStands(
	command: Extract<OwnedBrowserCommand, { readonly command: "dynamicApprovalRespond" }>,
	snapshot: BrowserSnapshot,
): void {
	const link = executableLink(snapshot);
	if (
		command.capturedLink.threadId === link.threadId &&
		command.capturedLink.childId === link.childId &&
		command.capturedLink.epoch === link.epoch
	) {
		return;
	}
	throw new CodexWorkbenchGatewayError(
		"dynamic_approval_not_pending",
		"The coordination approval is bound to another thread link.",
		{ commandId: command.commandId },
	);
}

/**
 * Whether one coordination approval is the pending one a response answers.
 * @param candidate The approval on the snapshot.
 * @param command The response.
 * @param nowMs The moment the response is being checked at.
 * @returns True when the response answers exactly that pending approval.
 */
function answersApproval(
	candidate: BrowserSnapshot["dynamicApprovals"][number],
	command: Extract<OwnedBrowserCommand, { readonly command: "dynamicApprovalRespond" }>,
	nowMs: number,
): boolean {
	return (
		candidate.state === "pending" &&
		candidate.expiresAtMs > nowMs &&
		candidate.effectHash === command.effectHash &&
		sameWireValue(candidate.identity, command.identity)
	);
}

/**
 * Whether an approval response answers exactly the request that is pending on
 * this pane's link, and has not expired.
 * @param pending What the approval owner has pending, when it has one.
 * @param command The response.
 * @param snapshot The snapshot it was checked against.
 * @param nowMs The moment the response is being checked at.
 * @returns True when the response is answerable.
 */
function answersPendingRequest(
	pending: ReturnType<CodexWorkbenchGatewayOptions["actions"]["ordinaryApprovals"]["pending"]>,
	command: Extract<OwnedBrowserCommand, { readonly command: "approvalRespond" }>,
	snapshot: BrowserSnapshot,
	nowMs: number,
): boolean {
	if (pending === null) {
		return false;
	}
	const request = pending.request;
	return (
		request.requestId === command.requestId &&
		request.threadId === snapshot.threadLink.threadId &&
		request.approvalId === command.approvalId &&
		request.expiresAtMs > nowMs
	);
}

/**
 * Everything a command must satisfy before any action runs: its lease, its
 * pane binding, the workbench's readiness, and the approval it answers.
 * @param owners What the gateway around the checks provides.
 * @returns The admission check.
 */
function createCommandAdmission(
	owners: CommandAdmissionOwners,
): (state: ConnectionState, command: OwnedBrowserCommand) => BrowserLeaseRecord {
	const { options, model, now } = owners;

	/**
	 * Refuse an approval response whose approval is no longer pending on this
	 * pane's link.
	 * @param command The command.
	 * @param snapshot The snapshot it was checked against.
	 */
	const ensureOrdinaryApprovalPending = (
		command: OwnedBrowserCommand,
		snapshot: BrowserSnapshot,
	): void => {
		if (!isOrdinaryApprovalCommand(command)) {
			return;
		}
		const pending = options.actions.ordinaryApprovals.pending(command.requestId);
		if (!answersPendingRequest(pending, command, snapshot, now()))
			throw new CodexWorkbenchGatewayError(
				"approval_not_pending",
				"The ordinary approval is not pending for this link.",
				{ commandId: command.commandId },
			);
	};

	/**
	 * The coordination approval a response answers, which must still be pending
	 * on the link the response captured.
	 * @param command The response.
	 * @param snapshot The snapshot it was checked against.
	 * @returns The pending approval.
	 */
	const pendingDynamicApproval = (
		command: Extract<OwnedBrowserCommand, { readonly command: "dynamicApprovalRespond" }>,
		snapshot: BrowserSnapshot,
	): BrowserSnapshot["dynamicApprovals"][number] => {
		ensureCapturedLinkStands(command, snapshot);
		const pending = snapshot.dynamicApprovals.find((candidate) =>
			answersApproval(candidate, command, now()),
		);
		if (pending === undefined)
			throw new CodexWorkbenchGatewayError(
				"dynamic_approval_not_pending",
				"The coordination approval is not pending.",
				{ commandId: command.commandId },
			);
		return pending;
	};

	/**
	 * Refuse a coordination approval response the model cannot bind to the
	 * approval it names.
	 * @param command The command.
	 * @param snapshot The snapshot it was checked against.
	 */
	const ensureDynamicApprovalPending = (
		command: OwnedBrowserCommand,
		snapshot: BrowserSnapshot,
	): void => {
		if (!isDynamicApprovalCommand(command)) {
			return;
		}
		const pending = pendingDynamicApproval(command, snapshot);
		try {
			model.parsePendingDynamicApprovalResponse(pending, command);
		} catch (error) {
			throw new CodexWorkbenchGatewayError(
				"dynamic_approval_not_pending",
				"The coordination approval binding is stale.",
				{ commandId: command.commandId, cause: error },
			);
		}
	};

	return (state, command) => {
		const record = currentLeaseOrThrow(
			owners.leases.manager,
			command.commandId,
			owners.leases.reasonFor(command.commandId),
		);
		ensureLeaseOwnership(state, command, record);
		owners.leases.ensureLeaseBinding(state, record);
		const snapshot = owners.snapshotFor(state);
		ensureCommandReadiness(command, snapshot);
		ensureLoginCancelTarget(command, snapshot);
		ensureOrdinaryApprovalPending(command, snapshot);
		ensureDynamicApprovalPending(command, snapshot);
		return record;
	};
}

export { createCommandAdmission, ensureAccountReadiness };

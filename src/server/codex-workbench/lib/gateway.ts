import { createHash } from "node:crypto";

import { createCodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserCommand,
	BrowserCommandLease,
	BrowserDynamicApprovalResponse,
	BrowserOperationOutcome,
	BrowserSnapshot,
	DeliveryOutcome,
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	createBrowserLeaseManager,
	type BrowserLeaseManager,
	type BrowserLeaseRecord,
} from "./lease.js";
import {
	CodexWorkbenchGatewayError,
	type BrowserActionContext,
	type BrowserActionResult,
	type BrowserGatewayAccountReadResult,
	type BrowserGatewayCommandResult,
	type BrowserGatewayMessage,
	type BrowserGatewaySnapshotMessage,
	type BrowserProjection,
	type BrowserWorkbenchConnection,
	type BrowserApprovalCommand,
	type CodexWorkbenchGateway,
	type BrowserConnectionId,
	type BrowserDisconnectReason,
	type BrowserUnsubscribe,
	type CodexWorkbenchGatewayOptions,
} from "./contract.js";
import { diffBrowserSnapshots, readBrowserProjection } from "./projection.js";

const ACCOUNT_READINESS = new Set([
	"login_capable",
	"signed_out",
	"login_pending",
	"account_ready",
	"thread_capable",
]);
const THREAD_READINESS = new Set(["thread_capable"]);
const DISCONNECT_MEMORY_LIMIT = 128;

interface ConnectionState {
	readonly browserId: BrowserConnectionId;
	readonly paneId: string;
	readonly listeners: Set<(message: BrowserGatewayMessage) => void>;
	sequence: number;
	lastSnapshot: BrowserSnapshot | null;
	operation: BrowserOperationOutcome | null;
	lease: BrowserCommandLease | null;
	closed: boolean;
}

interface CachedCommand {
	readonly fingerprint: string;
	readonly browserId: BrowserConnectionId;
	readonly paneId: string;
	readonly result: Promise<BrowserGatewayCommandResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameWireValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function fingerprintCommand(command: BrowserCommand): string {
	return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

function isDeliveryOutcome(value: unknown): value is DeliveryOutcome {
	return value === "delivered" || value === "not_delivered" || value === "outcome_unknown";
}

function actionOutcome(value: BrowserActionResult): DeliveryOutcome {
	if (value === undefined) return "delivered";
	return value.outcome;
}

function errorOutcome(error: unknown): DeliveryOutcome {
	if (isRecord(error) && isDeliveryOutcome(error.outcome)) return error.outcome;
	return "not_delivered";
}

function errorCode(error: unknown): CodexWorkbenchGatewayError["code"] {
	if (error instanceof CodexWorkbenchGatewayError) return error.code;
	return errorOutcome(error) === "outcome_unknown" ? "outcome_unknown" : "command_failed";
}

function staticMessage(
	outcome: DeliveryOutcome,
	code: CodexWorkbenchGatewayError["code"] | null,
): string | null {
	if (code === null) return null;
	if (code === "outcome_unknown" || outcome === "outcome_unknown")
		return "The command may have taken effect; inspect authoritative state before another mutation.";
	if (code === "command_failed") return "The command was not delivered.";
	const messages: Partial<Record<CodexWorkbenchGatewayError["code"], string>> = {
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
	return messages[code] ?? "The browser command was refused.";
}

function isOversizedDelta(error: unknown): boolean {
	return (
		error instanceof Error && error.message === "the browser delta exceeds its wire-size bound"
	);
}

function connectionKey(browserId: string, paneId: string): string {
	return `${browserId}\u0000${paneId}`;
}

function assertOpaqueName(value: string, field: string): void {
	if (typeof value !== "string" || value.length === 0 || value.length > 128)
		throw new CodexWorkbenchGatewayError("invalid_input", `${field} is invalid.`);
}

function commandThreadId(command: BrowserCommand): string | null {
	if ("threadId" in command && typeof command.threadId === "string") return command.threadId;
	return null;
}

function isAccountCommand(command: BrowserCommand): boolean {
	return (
		command.command === "accountLogin" ||
		command.command === "accountLoginCancel" ||
		command.command === "accountLogout"
	);
}

function isThreadLinkCommand(command: BrowserCommand): boolean {
	return (
		command.command === "threadLinkCreate" ||
		command.command === "threadLinkAttach" ||
		command.command === "threadLinkRelink"
	);
}

function isOrdinaryApprovalCommand(command: BrowserCommand): command is BrowserApprovalCommand {
	return command.command === "approvalRespond";
}

function isDynamicApprovalCommand(
	command: BrowserCommand,
): command is BrowserDynamicApprovalResponse {
	return command.command === "dynamicApprovalRespond";
}

function actionContext(record: BrowserLeaseRecord): BrowserActionContext {
	return record.binding;
}

function executableLink(snapshot: BrowserSnapshot): BrowserSnapshot["threadLink"] {
	if (snapshot.threadLink.state !== "executable")
		throw new CodexWorkbenchGatewayError(
			"link_required",
			"The current pane has no executable thread link.",
		);
	return snapshot.threadLink;
}

function currentLeaseOrThrow(
	manager: BrowserLeaseManager,
	commandId: BrowserCommandId,
	terminalReason?: BrowserDisconnectReason,
): BrowserLeaseRecord {
	const current = manager.current();
	const found = manager.find(commandId);
	if (found?.lease.state === "expired")
		throw new CodexWorkbenchGatewayError("lease_expired", "The command lease expired.", {
			commandId,
		});
	if (
		found?.lease.state === "released" &&
		(current === null || current.lease.commandId === commandId)
	)
		throw new CodexWorkbenchGatewayError(
			terminalReason === "link_changed"
				? "link_changed"
				: terminalReason === "child_disconnected"
					? "child_disconnected"
					: terminalReason === "lease_transferred"
						? "lease_transferred"
						: "lease_released",
			"The command lease was released.",
			{ commandId },
		);
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

export function createCodexWorkbenchGateway(
	options: CodexWorkbenchGatewayOptions,
): CodexWorkbenchGateway {
	const identity: IdentityAuthorities = options.identity;
	const model = createCodexBrowserModel(identity);
	const connections = new Map<string, ConnectionState>();
	const cachedCommands = new Map<BrowserCommandId, CachedCommand>();
	const disconnectNotified = new Set<BrowserCommandId>();
	const disconnectReasons = new Map<BrowserCommandId, BrowserDisconnectReason>();
	const now = options.now ?? Date.now;
	let disposed = false;
	let publishing = false;
	let publishQueued = false;
	let leaseManager: BrowserLeaseManager;
	const sourceUnsubscribers: BrowserUnsubscribe[] = [];

	const notifyDisconnect = (record: BrowserLeaseRecord, reason: BrowserDisconnectReason): void => {
		const commandId = record.lease.commandId;
		if (disconnectNotified.has(commandId)) return;
		disconnectNotified.add(commandId);
		disconnectReasons.set(commandId, reason);
		for (const state of connections.values()) {
			if (state.lease?.commandId === commandId) state.lease = record.lease;
		}
		while (disconnectNotified.size > DISCONNECT_MEMORY_LIMIT) {
			const oldest = disconnectNotified.values().next().value;
			if (oldest === undefined) break;
			disconnectNotified.delete(oldest);
			disconnectReasons.delete(oldest);
		}
		const context = record.binding satisfies BrowserActionContext;
		const callbacks = [
			options.actions.ordinaryApprovals.onBrowserDisconnect,
			options.actions.dynamicApprovals.onBrowserDisconnect,
		];
		for (const callback of callbacks) {
			if (callback === undefined) continue;
			try {
				const result = callback(context, reason);
				if (result instanceof Promise) void result.catch(() => undefined);
			} catch {
				// Approval owners are notified independently; one teardown failure
				// must not keep the browser lease from being retired.
			}
		}
	};

	const finishLease = (
		record: BrowserLeaseRecord,
		state: "expired" | "released",
	): BrowserLeaseRecord | null => {
		if (leaseManager.current()?.lease.commandId !== record.lease.commandId) return null;
		const result = leaseManager.invalidate(record.lease.childId, record.lease.epoch, state);
		if (result !== null) notifyDisconnect(result, "link_changed");
		return result;
	};

	const readBinding = (paneId: string) => {
		try {
			const binding = options.threadLink.read(paneId);
			if (
				binding.paneId !== paneId ||
				!Number.isSafeInteger(binding.revision) ||
				binding.revision < 0
			)
				throw new Error("the thread-link owner returned an invalid pane binding");
			model.BrowserThreadLinkSchema.parse(binding.link);
			return binding;
		} catch (error) {
			if (error instanceof CodexWorkbenchGatewayError) throw error;
			throw new CodexWorkbenchGatewayError(
				"invalid_projection",
				"The thread-link owner returned invalid browser state.",
				{ cause: error },
			);
		}
	};

	const stateFor = (browserId: string, paneId: string): ConnectionState => {
		const state = connections.get(connectionKey(browserId, paneId));
		if (state === undefined || state.closed)
			throw new CodexWorkbenchGatewayError("invalid_input", "The browser connection is closed.");
		return state;
	};

	const expireLeaseIfDue = (): void => {
		const current = leaseManager.current();
		if (current === null || now() < current.lease.expiresAtMs) return;
		const expired = leaseManager.invalidate(current.lease.childId, current.lease.epoch, "expired");
		if (expired !== null) notifyDisconnect(expired, "lease_expired");
	};

	const leaseForSnapshot = (state: ConnectionState): BrowserCommandLease | null => {
		expireLeaseIfDue();
		const current = leaseManager.current();
		if (current?.binding.browserId === state.browserId && current.binding.paneId === state.paneId)
			return current.lease;
		return state.lease;
	};

	const snapshotFor = (state: ConnectionState): BrowserSnapshot => {
		const binding = readBinding(state.paneId);
		let projection: BrowserProjection;
		try {
			projection = options.projection.read({
				browserId: state.browserId,
				paneId: state.paneId,
				binding,
				lease: leaseForSnapshot(state),
			});
		} catch (error) {
			throw new CodexWorkbenchGatewayError(
				"invalid_projection",
				"The workbench projection could not be read.",
				{ cause: error },
			);
		}
		try {
			return readBrowserProjection({
				model,
				projection,
				context: {
					browserId: state.browserId,
					paneId: state.paneId,
					binding,
					lease: leaseForSnapshot(state),
				},
				operation: state.operation,
			});
		} catch (error) {
			throw new CodexWorkbenchGatewayError(
				"invalid_projection",
				"The workbench published invalid browser state.",
				{ cause: error },
			);
		}
	};

	const updateSnapshot = (state: ConnectionState): BrowserGatewaySnapshotMessage => {
		const snapshot = snapshotFor(state);
		if (state.lastSnapshot === null) state.sequence = 0;
		else {
			try {
				if (diffBrowserSnapshots(state.lastSnapshot, snapshot) !== null) state.sequence += 1;
			} catch (error) {
				if (!isOversizedDelta(error)) throw error;
				state.sequence += 1;
			}
		}
		state.lastSnapshot = snapshot;
		return Object.freeze({ kind: "snapshot", sequence: state.sequence, snapshot });
	};

	const publishConnection = (state: ConnectionState): void => {
		if (state.closed || state.lastSnapshot === null) return;
		const snapshot = snapshotFor(state);
		try {
			const delta = diffBrowserSnapshots(state.lastSnapshot, snapshot);
			if (delta === null) return;
			state.sequence += 1;
			state.lastSnapshot = snapshot;
			emit(
				state.listeners,
				Object.freeze({
					kind: "delta",
					sequence: state.sequence,
					delta,
				}),
			);
		} catch (error) {
			if (!isOversizedDelta(error)) throw error;
			state.sequence += 1;
			state.lastSnapshot = snapshot;
			emit(
				state.listeners,
				Object.freeze({ kind: "snapshot", sequence: state.sequence, snapshot }),
			);
		}
	};

	const publishAll = (): void => {
		if (disposed) return;
		if (publishing) {
			publishQueued = true;
			return;
		}
		publishing = true;
		try {
			do {
				publishQueued = false;
				for (const state of connections.values()) publishConnection(state);
			} while (publishQueued);
		} finally {
			publishing = false;
		}
	};

	leaseManager = createBrowserLeaseManager({
		identity,
		now,
		onFinish: (record) => notifyDisconnect(record, "lease_expired"),
		onChange: publishAll,
	});

	const ensureAccountReadiness = (snapshot: BrowserSnapshot): void => {
		if (!ACCOUNT_READINESS.has(snapshot.readiness.state))
			throw new CodexWorkbenchGatewayError("not_ready", "The workbench is not login-capable.");
	};

	const ensureThreadReadiness = (snapshot: BrowserSnapshot): void => {
		if (!THREAD_READINESS.has(snapshot.readiness.state))
			throw new CodexWorkbenchGatewayError(
				"thread_capability_required",
				"The workbench has not composed thread capability.",
			);
	};

	const ensureLeaseBinding = (state: ConnectionState, record: BrowserLeaseRecord): void => {
		const binding = readBinding(state.paneId);
		if (
			binding.revision !== record.binding.linkRevision ||
			!sameWireValue(binding.link, record.binding.link)
		) {
			finishLease(record, "released");
			throw new CodexWorkbenchGatewayError(
				"link_changed",
				"The pane link changed during lease ownership.",
				{
					commandId: record.lease.commandId,
				},
			);
		}
	};

	const validateThreadTarget = (command: BrowserCommand, snapshot: BrowserSnapshot): void => {
		const link = executableLink(snapshot);
		const target = commandThreadId(command);
		if (target !== null && target !== link.threadId)
			throw new CodexWorkbenchGatewayError(
				"link_changed",
				"The command target does not match the current link.",
				{
					commandId: command.commandId,
				},
			);
	};

	const invoke = async (
		command: BrowserCommand,
		context: BrowserActionContext,
	): Promise<BrowserActionResult> => {
		switch (command.command) {
			case "accountLogin":
				return options.actions.account.login(command, context);
			case "accountLoginCancel":
				return options.actions.account.loginCancel(command, context);
			case "accountLogout":
				return options.actions.account.logout(command, context);
			case "threadLinkCreate":
				return options.actions.threadLinks.create(command, context);
			case "threadLinkAttach":
				return options.actions.threadLinks.attach(command, context);
			case "threadLinkRelink":
				return options.actions.threadLinks.relink(command, context);
			case "queueAdd":
				return options.actions.queue.add(command, context);
			case "queueUpdate":
				return options.actions.queue.update(command, context);
			case "queueDelete":
				return options.actions.queue.delete(command, context);
			case "queueReorder":
				return options.actions.queue.reorder(command, context);
			case "queueStart":
				return options.actions.queue.start(command, context);
			case "approvalRespond":
				return options.actions.ordinaryApprovals.resolve(command, context);
			case "realtimeStart":
				return options.actions.realtime.start(command, context);
			case "realtimeAppendText":
				return options.actions.realtime.appendText(command, context);
			case "realtimeStop":
				return options.actions.realtime.stop(command, context);
			case "start":
				return options.actions.text.start(command, context);
			case "steer":
				return options.actions.text.steer(command, context);
			case "interrupt":
				return options.actions.text.interrupt(command, context);
			case "dynamicApprovalRespond":
				return options.actions.dynamicApprovals.resolve(command, context);
			default:
				throw new CodexWorkbenchGatewayError(
					"unsupported_command",
					"The command is not supported.",
				);
		}
	};

	const refusal = async (
		state: ConnectionState,
		commandId: BrowserCommandId | null,
		code: CodexWorkbenchGatewayError["code"],
		outcome: DeliveryOutcome = "not_delivered",
	): Promise<BrowserGatewayCommandResult> => {
		const message = staticMessage(outcome, code);
		if (commandId !== null)
			state.operation = Object.freeze({
				kind: "operation_outcome",
				operationId: commandId,
				outcome,
				message,
			});
		const snapshot = updateSnapshot(state).snapshot;
		return Object.freeze({
			kind: "command_result",
			commandId,
			outcome,
			code,
			message,
			snapshot,
		});
	};

	const execute = async (
		state: ConnectionState,
		command: BrowserCommand,
	): Promise<BrowserGatewayCommandResult> => {
		let actionStarted = false;
		try {
			expireLeaseIfDue();
			const record = currentLeaseOrThrow(
				leaseManager,
				command.commandId,
				disconnectReasons.get(command.commandId),
			);
			if (record.binding.browserId !== state.browserId || record.binding.paneId !== command.paneId)
				throw new CodexWorkbenchGatewayError("lease_transferred", "The lease owner changed.", {
					commandId: command.commandId,
				});
			if (command.childId !== record.lease.childId || command.epoch !== record.lease.epoch)
				throw new CodexWorkbenchGatewayError("lease_transferred", "The lease target changed.", {
					commandId: command.commandId,
				});
			ensureLeaseBinding(state, record);
			const snapshot = snapshotFor(state);
			if (isAccountCommand(command)) ensureAccountReadiness(snapshot);
			else {
				ensureThreadReadiness(snapshot);
				if (!isThreadLinkCommand(command)) validateThreadTarget(command, snapshot);
			}
			if (
				command.command === "accountLoginCancel" &&
				snapshot.readiness.state === "login_pending" &&
				command.loginId !== snapshot.readiness.loginId
			)
				throw new CodexWorkbenchGatewayError(
					"invalid_command",
					"The login cancellation does not match the active login.",
					{ commandId: command.commandId },
				);

			if (isOrdinaryApprovalCommand(command)) {
				const pending = options.actions.ordinaryApprovals.pending(command.requestId);
				if (
					pending === null ||
					pending.requestId !== command.requestId ||
					pending.threadId !== snapshot.threadLink.threadId ||
					pending.approvalId !== command.approvalId ||
					pending.expiresAtMs <= now()
				)
					throw new CodexWorkbenchGatewayError(
						"approval_not_pending",
						"The ordinary approval is not pending for this link.",
						{ commandId: command.commandId },
					);
			}

			if (isDynamicApprovalCommand(command)) {
				const link = executableLink(snapshot);
				if (
					command.capturedLink.threadId !== link.threadId ||
					command.capturedLink.childId !== link.childId ||
					command.capturedLink.epoch !== link.epoch
				)
					throw new CodexWorkbenchGatewayError(
						"dynamic_approval_not_pending",
						"The coordination approval is bound to another thread link.",
						{ commandId: command.commandId },
					);
				const pending = options.actions.dynamicApprovals
					.pending()
					.find(
						(candidate) =>
							candidate.state === "pending" &&
							candidate.expiresAtMs > now() &&
							candidate.effectHash === command.effectHash &&
							sameWireValue(candidate.identity, command.identity),
					);
				if (pending === undefined)
					throw new CodexWorkbenchGatewayError(
						"dynamic_approval_not_pending",
						"The coordination approval is not pending.",
						{ commandId: command.commandId },
					);
				try {
					model.parsePendingDynamicApprovalResponse(pending, command);
				} catch (error) {
					throw new CodexWorkbenchGatewayError(
						"dynamic_approval_not_pending",
						"The coordination approval binding is stale.",
						{ commandId: command.commandId, cause: error },
					);
				}
			}

			actionStarted = true;
			const actionResult = await invoke(command, actionContext(record));
			const linkMutation = isThreadLinkCommand(command);
			if (!linkMutation) {
				try {
					ensureLeaseBinding(state, record);
				} catch (error) {
					if (error instanceof CodexWorkbenchGatewayError && error.code === "link_changed") {
						return await refusal(state, command.commandId, "outcome_unknown", "outcome_unknown");
					}
					throw error;
				}
			}
			const outcome =
				leaseManager.current()?.lease.commandId === command.commandId
					? actionOutcome(actionResult)
					: "outcome_unknown";
			const code =
				outcome === "delivered"
					? null
					: outcome === "outcome_unknown"
						? "outcome_unknown"
						: "command_failed";
			const message = staticMessage(outcome, code);
			state.operation = Object.freeze({
				kind: "operation_outcome",
				operationId: command.commandId,
				outcome,
				message,
			});
			const nextSnapshot = updateSnapshot(state).snapshot;
			return Object.freeze({
				kind: "command_result",
				commandId: command.commandId,
				outcome,
				code,
				message,
				snapshot: nextSnapshot,
			});
		} catch (error) {
			if (actionStarted && leaseManager.current()?.lease.commandId !== command.commandId)
				return refusal(state, command.commandId, "outcome_unknown", "outcome_unknown");
			const outcome = errorOutcome(error);
			const code = errorCode(error);
			return refusal(state, command.commandId, code, outcome);
		}
	};

	const command = async (
		browserId: BrowserConnectionId,
		value: unknown,
		paneIdOverride?: string,
	): Promise<BrowserGatewayCommandResult> => {
		const paneId =
			paneIdOverride ?? (isRecord(value) && typeof value.paneId === "string" ? value.paneId : null);
		if (paneId === null)
			throw new CodexWorkbenchGatewayError(
				"invalid_input",
				"A browser command must identify its pane.",
			);
		const state = stateFor(browserId, paneId);
		let parsed: BrowserCommand;
		try {
			parsed = model.BrowserCommandSchema.parse(value);
		} catch {
			return refusal(state, null, "invalid_command");
		}
		const fingerprint = fingerprintCommand(parsed);
		const existing = cachedCommands.get(parsed.commandId);
		if (existing !== undefined) {
			if (existing.fingerprint === fingerprint) {
				if (existing.browserId !== browserId || existing.paneId !== paneId)
					return refusal(state, parsed.commandId, "lease_transferred");
				return existing.result;
			}
			return refusal(state, parsed.commandId, "invalid_command");
		}
		const result = execute(state, parsed);
		cachedCommands.set(parsed.commandId, {
			fingerprint,
			browserId,
			paneId,
			result,
		});
		return result;
	};

	const accountRead = async (
		browserId: BrowserConnectionId,
		paneId: string,
	): Promise<BrowserGatewayAccountReadResult> => {
		const state = stateFor(browserId, paneId);
		try {
			ensureAccountReadiness(snapshotFor(state));
			const outcome = actionOutcome(await options.actions.account.read({ browserId, paneId }));
			const code =
				outcome === "delivered"
					? null
					: outcome === "outcome_unknown"
						? "outcome_unknown"
						: "command_failed";
			const message = staticMessage(outcome, code);
			const snapshot = updateSnapshot(state).snapshot;
			return Object.freeze({ kind: "account_read", outcome, code, message, snapshot });
		} catch (error) {
			const outcome = errorOutcome(error);
			const code = errorCode(error);
			const snapshot = updateSnapshot(state).snapshot;
			return Object.freeze({
				kind: "account_read",
				outcome,
				code,
				message: staticMessage(outcome, code),
				snapshot,
			});
		}
	};

	const claimLease = (browserId: string, paneId: string): BrowserCommandLease => {
		const state = stateFor(browserId, paneId);
		expireLeaseIfDue();
		ensureAccountReadiness(snapshotFor(state));
		const previous = leaseManager.current();
		if (previous !== null) {
			const released = leaseManager.release(
				previous.binding.browserId,
				previous.binding.paneId,
				previous.lease.commandId,
			);
			if (released !== null) notifyDisconnect(released, "lease_transferred");
		}
		const record = leaseManager.claim(browserId, paneId, readBinding(paneId));
		state.lease = record.lease;
		return record.lease;
	};

	const renewLease = (
		browserId: string,
		lease: Pick<BrowserCommandLease, "commandId" | "paneId" | "childId" | "epoch">,
	): BrowserCommandLease => {
		stateFor(browserId, lease.paneId);
		expireLeaseIfDue();
		const record = currentLeaseOrThrow(
			leaseManager,
			lease.commandId,
			disconnectReasons.get(lease.commandId),
		);
		if (record.binding.browserId !== browserId)
			throw new CodexWorkbenchGatewayError("lease_transferred", "The lease owner changed.", {
				commandId: lease.commandId,
			});
		if (
			lease.paneId !== record.lease.paneId ||
			lease.childId !== record.lease.childId ||
			lease.epoch !== record.lease.epoch
		)
			throw new CodexWorkbenchGatewayError("lease_transferred", "The lease target changed.", {
				commandId: lease.commandId,
			});
		ensureLeaseBinding(stateFor(browserId, lease.paneId), record);
		const renewed = leaseManager.renew(browserId, {
			...record.lease,
			...lease,
			state: "active",
			expiresAtMs: record.lease.expiresAtMs,
		});
		const state = stateFor(browserId, lease.paneId);
		state.lease = renewed.lease;
		return renewed.lease;
	};

	const releaseLease = (browserId: string, paneId: string, commandId?: BrowserCommandId) => {
		const state = stateFor(browserId, paneId);
		expireLeaseIfDue();
		if (commandId === undefined) commandId = state.lease?.commandId;
		const record = leaseManager.release(browserId, paneId, commandId);
		if (record?.lease.state === "released") notifyDisconnect(record, "browser_disconnected");
		return record?.lease ?? null;
	};

	const connect = (browserId: string, paneId: string): BrowserWorkbenchConnection => {
		if (disposed)
			throw new CodexWorkbenchGatewayError("disposed", "The browser gateway is disposed.");
		assertOpaqueName(browserId, "browserId");
		assertOpaqueName(paneId, "paneId");
		const key = connectionKey(browserId, paneId);
		const existing = connections.get(key);
		if (existing !== undefined && !existing.closed) return connectionFor(existing);
		const state: ConnectionState = {
			browserId,
			paneId,
			listeners: new Set(),
			sequence: 0,
			lastSnapshot: null,
			operation: null,
			lease: null,
			closed: false,
		};
		connections.set(key, state);
		return connectionFor(state);
	};

	const closeBrowser = async (browserId: string): Promise<void> => {
		for (const [key, state] of connections) {
			if (state.browserId !== browserId) continue;
			state.closed = true;
			state.listeners.clear();
			connections.delete(key);
		}
		const current = leaseManager.current();
		if (current?.binding.browserId === browserId) {
			const released = leaseManager.release(
				browserId,
				current.binding.paneId,
				current.lease.commandId,
			);
			if (released !== null) notifyDisconnect(released, "browser_disconnected");
		}
	};

	const childExit = async (childId: ChildId, epoch: ChildEpoch): Promise<void> => {
		const current = leaseManager.current();
		if (current === null || current.lease.childId !== childId || current.lease.epoch !== epoch)
			return;
		const released = leaseManager.invalidate(childId, epoch, "released");
		if (released !== null) notifyDisconnect(released, "child_disconnected");
		publishAll();
	};

	const dispose = async (): Promise<void> => {
		if (disposed) return;
		disposed = true;
		for (const unsubscribe of sourceUnsubscribers.splice(0)) unsubscribe();
		for (const state of connections.values()) {
			state.closed = true;
			state.listeners.clear();
		}
		connections.clear();
		const current = leaseManager.current();
		if (current !== null) notifyDisconnect(current, "gateway_shutdown");
		leaseManager.dispose();
		cachedCommands.clear();
	};

	const subscribe = (
		browserId: string,
		paneId: string,
		listener: (message: BrowserGatewayMessage) => void,
	): BrowserUnsubscribe => {
		const state = stateFor(browserId, paneId);
		state.listeners.add(listener);
		return () => state.listeners.delete(listener);
	};

	const connectionFor = (state: ConnectionState): BrowserWorkbenchConnection =>
		Object.freeze({
			browserId: state.browserId,
			paneId: state.paneId,
			snapshot: () => updateSnapshot(state),
			claimLease: () => claimLease(state.browserId, state.paneId),
			renewLease: () => {
				expireLeaseIfDue();
				if (state.lease === null)
					throw new CodexWorkbenchGatewayError("lease_required", "No command lease is active.");
				return renewLease(state.browserId, state.lease);
			},
			releaseLease: () => releaseLease(state.browserId, state.paneId),
			accountRead: () => accountRead(state.browserId, state.paneId),
			command: (value: unknown) => command(state.browserId, value, state.paneId),
			subscribe: (listener: (message: BrowserGatewayMessage) => void) =>
				subscribe(state.browserId, state.paneId, listener),
			close: () => closeBrowser(state.browserId),
		});

	if (options.projection.onChange !== undefined)
		sourceUnsubscribers.push(options.projection.onChange(publishAll));
	if (options.actions.dynamicApprovals.onChange !== undefined)
		sourceUnsubscribers.push(options.actions.dynamicApprovals.onChange(publishAll));
	if (options.actions.ordinaryApprovals.onChange !== undefined)
		sourceUnsubscribers.push(options.actions.ordinaryApprovals.onChange(publishAll));
	if (options.lifecycle?.onChange !== undefined)
		sourceUnsubscribers.push(options.lifecycle.onChange(publishAll));
	if (options.lifecycle?.onChildExit !== undefined)
		sourceUnsubscribers.push(
			options.lifecycle.onChildExit((childId, epoch) => void childExit(childId, epoch)) ??
				(() => undefined),
		);

	return Object.freeze({
		connect,
		snapshot: (browserId: string, paneId: string) => updateSnapshot(stateFor(browserId, paneId)),
		claimLease,
		renewLease,
		releaseLease,
		accountRead,
		command,
		subscribe,
		closeBrowser,
		childExit,
		dispose,
	});
}

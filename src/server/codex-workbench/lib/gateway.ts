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
	JsonRpcRequestId,
} from "../../../shared/codex-workbench-identity/index.js";
import { parseApprovalResponse } from "../../../runtime/codex-approvals/index.js";
import { SupportedLoginAccountParamsSchema } from "../../../runtime/codex-protocol/index.js";
import { createBrowserLeaseManager, type BrowserLeaseManager } from "./lease.js";
import {
	CodexWorkbenchGatewayError,
	type BrowserActionContext,
	type BrowserActionResult,
	type BrowserGatewayAccountReadResult,
	type BrowserGatewayCommandResult,
	type BrowserGatewayMessage,
	type BrowserGatewaySnapshotMessage,
	type BrowserWorkbenchConnection,
	type BrowserAccountLoginCommand,
	type BrowserApprovalCommand,
	type CodexWorkbenchGateway,
	type BrowserConnectionId,
	type BrowserConnectionInstance,
	type BrowserDisconnectReason,
	type BrowserLeaseRecord,
	type BrowserPresenterContext,
	type BrowserProjectionPort,
	type BrowserPublishedPayload,
	type BrowserUnsubscribe,
	type CodexWorkbenchGatewayOptions,
} from "./contract.js";
import type { BrowserOwnerProjection } from "./projection-contract.js";
import {
	BROWSER_SNAPSHOT_MAX_BYTES,
	assertBrowserSnapshotBudget,
	assertBrowserSnapshotBounded,
	diffBrowserSnapshots,
	fitBrowserSnapshotBounded,
	projectCodexBrowserState,
} from "./projection.js";

const ACCOUNT_READINESS = new Set([
	"login_capable",
	"signed_out",
	"login_pending",
	"account_ready",
	"thread_capable",
]);
const THREAD_READINESS = new Set(["thread_capable"]);
const LEASE_REASON_MEMORY_LIMIT = 128;
const BROWSER_SETTLED_COMMAND_LIMIT = 64;

interface ConnectionState {
	readonly browserId: BrowserConnectionId;
	readonly paneId: string;
	readonly instance: BrowserConnectionInstance;
	readonly listeners: Set<(message: BrowserGatewayMessage) => void>;
	readonly publishedTerminals: Set<JsonRpcRequestId>;
	sequence: number;
	lastSnapshot: BrowserSnapshot | null;
	operation: BrowserOperationOutcome | null;
	lease: BrowserCommandLease | null;
	binding: BrowserActionContext | null;
	mediaReady: boolean;
	disconnectNotified: boolean;
	closed: boolean;
}

interface CachedCommand {
	readonly fingerprint: string;
	readonly browserId: BrowserConnectionId;
	readonly paneId: string;
	readonly connection: BrowserConnectionInstance;
	readonly result: Promise<BrowserGatewayCommandResult>;
}

type OwnedBrowserCommand =
	| Exclude<BrowserCommand, { readonly command: "accountLogin" | "approvalRespond" }>
	| BrowserAccountLoginCommand
	| BrowserApprovalCommand;

type BrowserActionDispatch = {
	readonly [Name in OwnedBrowserCommand["command"]]: (
		command: Extract<OwnedBrowserCommand, { readonly command: Name }>,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameWireValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function fingerprintCommand(command: BrowserCommand): string {
	return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

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

function isDeliveryOutcome(value: unknown): value is DeliveryOutcome {
	return value === "delivered" || value === "not_delivered" || value === "outcome_unknown";
}

function actionOutcome(value: BrowserActionResult): DeliveryOutcome {
	if (value === undefined) return "delivered";
	return value.outcome;
}

function errorOutcome(error: unknown): DeliveryOutcome {
	if (isRecord(error) && isDeliveryOutcome(error["outcome"])) return error["outcome"];
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
		command.command === "threadLinkRefresh" ||
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
	terminalReason?: CodexWorkbenchGatewayError["code"],
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

export function createCodexWorkbenchGateway(
	options: CodexWorkbenchGatewayOptions,
): CodexWorkbenchGateway {
	const identity: IdentityAuthorities = options.identity;
	const model = createCodexBrowserModel(identity);
	const connections = new Map<string, ConnectionState>();
	const inFlightCommands = new Map<BrowserCommandId, CachedCommand>();
	const settledCommands = new Map<BrowserCommandId, CachedCommand>();
	const leaseReasons = new Map<BrowserCommandId, CodexWorkbenchGatewayError["code"]>();
	const pendingSettlements = new Set<Promise<void>>();
	const now = options.now ?? Date.now;
	const snapshotMaxBytes = options.snapshotMaxBytes ?? BROWSER_SNAPSHOT_MAX_BYTES;
	assertBrowserSnapshotBudget(snapshotMaxBytes);
	let disposed = false;
	let publishing = false;
	let publishQueued = false;
	let leaseManager: BrowserLeaseManager;
	const sourceUnsubscribers: BrowserUnsubscribe[] = [];

	const trackSettlement = (settlement: Promise<void>): void => {
		pendingSettlements.add(settlement);
		void settlement.then(
			() => {
				pendingSettlements.delete(settlement);
				return undefined;
			},
			() => {
				pendingSettlements.delete(settlement);
				return undefined;
			},
		);
	};

	const drainSettlements = async (): Promise<void> => {
		while (pendingSettlements.size > 0) await Promise.allSettled(Array.from(pendingSettlements));
	};

	const rememberLeaseReason = (
		record: BrowserLeaseRecord,
		reason: CodexWorkbenchGatewayError["code"],
	): void => {
		inFlightCommands.delete(record.lease.commandId);
		settledCommands.delete(record.lease.commandId);
		leaseReasons.delete(record.lease.commandId);
		leaseReasons.set(record.lease.commandId, reason);
		for (const state of connections.values())
			if (state.lease?.commandId === record.lease.commandId) state.lease = record.lease;
		while (leaseReasons.size > LEASE_REASON_MEMORY_LIMIT) {
			const oldest = leaseReasons.keys().next().value;
			if (oldest === undefined) break;
			leaseReasons.delete(oldest);
		}
	};

	const notifyDisconnect = (
		state: ConnectionState,
		reason: BrowserDisconnectReason,
	): Promise<void> => {
		if (state.disconnectNotified) return Promise.resolve();
		state.disconnectNotified = true;
		for (const [commandId, entry] of inFlightCommands)
			if (entry.connection === state.instance) inFlightCommands.delete(commandId);
		try {
			options.projection.onBrowserDisconnect?.(
				{
					browserId: state.browserId,
					paneId: state.paneId,
					connection: state.instance,
				},
				reason,
			);
		} catch {
			// Projection retirement is best effort; the gateway still settles every
			// existing disconnect owner and closes the exact connection.
		}
		const disconnectActionContext = state.binding;
		let presenterContext: BrowserPresenterContext | null = null;
		try {
			const binding = readBinding(state.paneId);
			const link = binding.link;
			if (link.state === "executable" && link.childId !== null && link.epoch !== null)
				presenterContext = {
					browserId: state.browserId,
					connection: state.instance,
					paneId: state.paneId,
					childId: link.childId,
					epoch: link.epoch,
					link,
					linkRevision: binding.revision,
				};
		} catch {
			// A pane binding that is already gone owns no approval cleanup.
		}
		const hasOtherPresenter = Array.from(connections.values()).some((candidate) => {
			if (candidate === state || candidate.closed || candidate.paneId !== state.paneId)
				return false;
			if (presenterContext === null) return false;
			try {
				const binding = readBinding(candidate.paneId);
				return (
					binding.revision === presenterContext.linkRevision &&
					sameWireValue(binding.link, presenterContext.link)
				);
			} catch {
				return false;
			}
		});
		// Approval teardown is best effort. Both owners get a chance to settle,
		// and lifecycle methods resolve after all settlement promises finish.
		const invoke = <Context extends BrowserPresenterContext>(
			callback:
				| ((context: Context, reason: BrowserDisconnectReason) => Promise<void> | void)
				| undefined,
			context: Context | null,
		): Promise<void> => {
			if (callback === undefined || context === null) return Promise.resolve();
			try {
				return Promise.resolve(callback(context, reason)).then(
					() => undefined,
					() => undefined,
				);
			} catch {
				return Promise.resolve();
			}
		};
		const settlement = Promise.allSettled([
			// Ordinary approvals capture the still-current exact pane binding before
			// thread-link teardown clears that controller token.
			hasOtherPresenter
				? Promise.resolve()
				: invoke(options.actions.ordinaryApprovals.onBrowserDisconnect, presenterContext),
			invoke(options.actions.threadLinks.onBrowserDisconnect, disconnectActionContext),
			invoke(options.actions.realtime.onBrowserDisconnect, disconnectActionContext),
			invoke(options.actions.dynamicApprovals.onBrowserDisconnect, disconnectActionContext),
		]).then(() => undefined);
		trackSettlement(settlement);
		return settlement;
	};

	// A lease is app-global, so retiring its owner removes its only possible
	// in-flight entry. Settled entries remain replayable until bounded eviction;
	// an evicted id is necessarily non-current and must pass lease authority.
	const rememberSettled = (commandId: BrowserCommandId, entry: CachedCommand): void => {
		if (disposed) return;
		settledCommands.delete(commandId);
		settledCommands.set(commandId, entry);
		const activeCommandId = leaseManager.current()?.lease.commandId;
		while (settledCommands.size > BROWSER_SETTLED_COMMAND_LIMIT) {
			let evicted: BrowserCommandId | undefined;
			for (const candidate of settledCommands.keys()) {
				if (candidate !== activeCommandId) {
					evicted = candidate;
					break;
				}
			}
			if (evicted === undefined) break;
			settledCommands.delete(evicted);
		}
	};

	const finishLease = (
		record: BrowserLeaseRecord,
		state: "expired" | "released",
		reason: CodexWorkbenchGatewayError["code"],
	): BrowserLeaseRecord | null => {
		if (leaseManager.current()?.lease.commandId !== record.lease.commandId) return null;
		const result = leaseManager.invalidate(record.lease.childId, record.lease.epoch, state);
		if (result !== null) rememberLeaseReason(result, reason);
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
			return binding;
		} catch (error) {
			if (error instanceof CodexWorkbenchGatewayError) throw error;
			throw new CodexWorkbenchGatewayError(
				"invalid_projection",
				"The thread-link owner returned an invalid pane binding.",
				{ cause: error },
			);
		}
	};

	const stateFor = (
		browserId: string,
		paneId: string,
		instance?: BrowserConnectionInstance,
	): ConnectionState => {
		if (disposed)
			throw new CodexWorkbenchGatewayError("disposed", "The browser gateway is disposed.");
		const state = connections.get(connectionKey(browserId, paneId));
		if (state === undefined || state.closed)
			throw new CodexWorkbenchGatewayError("invalid_input", "The browser connection is closed.");
		if (instance !== undefined && state.instance !== instance)
			throw new CodexWorkbenchGatewayError(
				"invalid_input",
				"The browser socket instance was replaced.",
			);
		return state;
	};

	const expireLeaseIfDue = (): void => {
		const current = leaseManager.current();
		if (current === null || now() < current.lease.expiresAtMs) return;
		const expired = leaseManager.invalidate(current.lease.childId, current.lease.epoch, "expired");
		if (expired !== null) rememberLeaseReason(expired, "lease_expired");
	};

	const leaseForSnapshot = (state: ConnectionState): BrowserCommandLease | null => {
		expireLeaseIfDue();
		const current = leaseManager.current();
		if (
			current?.binding.browserId === state.browserId &&
			current.binding.paneId === state.paneId &&
			current.binding.connection === state.instance
		)
			return current.lease;
		return state.lease;
	};

	const projectionContext = (
		state: ConnectionState,
	): Parameters<BrowserProjectionPort["read"]>[0] => ({
		browserId: state.browserId,
		paneId: state.paneId,
		connection: state.instance,
		binding: readBinding(state.paneId),
		lease: leaseForSnapshot(state),
		mediaReady: state.mediaReady,
	});

	/**
	 * A snapshot request asks for state the browser can trust, so any owner that
	 * serves a projection from its own cache re-reads first. A failed re-read is
	 * the owner's to present; it never fails the snapshot.
	 */
	const refreshProjection = async (state: ConnectionState): Promise<void> => {
		if (options.projection.refresh === undefined || state.closed) return;
		await options.projection.refresh(projectionContext(state));
	};

	const snapshotFor = (state: ConnectionState): BrowserSnapshot => {
		const binding = readBinding(state.paneId);
		const lease = leaseForSnapshot(state);
		let projection: BrowserOwnerProjection;
		try {
			projection = options.projection.read({
				browserId: state.browserId,
				paneId: state.paneId,
				connection: state.instance,
				binding,
				lease,
				mediaReady: state.mediaReady,
			});
		} catch (error) {
			throw new CodexWorkbenchGatewayError(
				"invalid_projection",
				"The workbench projection could not be read.",
				{ cause: error },
			);
		}
		try {
			const result = projectCodexBrowserState(model, identity.identity.decoder, {
				...projection,
				threadLink: binding.link,
				lease,
				operation: state.operation,
			});
			if (result.tag === "refused") throw new Error(result.message);
			const snapshot = fitBrowserSnapshotBounded(result.snapshot, snapshotMaxBytes);
			assertBrowserSnapshotBounded(snapshot, snapshotMaxBytes);
			return snapshot;
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
		const message = Object.freeze({
			kind: "snapshot" as const,
			sequence: state.sequence,
			snapshot,
		});
		return message;
	};

	const acknowledgeRequestIds = (requestIds: readonly JsonRpcRequestId[]): void => {
		if (requestIds.length > 0) options.actions.ordinaryApprovals.acknowledgePublished(requestIds);
	};

	const acknowledgeReadyTerminals = (): void => {
		const candidates = options.actions.ordinaryApprovals.unpresentedTerminals();
		const candidateSet = new Set(candidates);
		for (const state of connections.values())
			for (const requestId of state.publishedTerminals)
				if (!candidateSet.has(requestId)) state.publishedTerminals.delete(requestId);
		const requestIds =
			connections.size === 0
				? candidates
				: candidates.filter((requestId) =>
						Array.from(connections.values()).every(
							(state) => !state.closed && state.publishedTerminals.has(requestId),
						),
					);
		if (requestIds.length === 0) return;
		acknowledgeRequestIds(requestIds);
		for (const state of connections.values())
			for (const requestId of requestIds) state.publishedTerminals.delete(requestId);
	};

	const confirmPublished = (state: ConnectionState, payload: BrowserPublishedPayload): void => {
		if (state.closed || connections.get(connectionKey(state.browserId, state.paneId)) !== state)
			return;
		for (const requestId of publishedTerminalIds(payload)) state.publishedTerminals.add(requestId);
		acknowledgeReadyTerminals();
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
			if (connections.size === 0) {
				acknowledgeReadyTerminals();
				return;
			}
			do {
				publishQueued = false;
				for (const state of connections.values()) publishConnection(state);
			} while (publishQueued);
			acknowledgeReadyTerminals();
		} finally {
			publishing = false;
		}
	};

	leaseManager = createBrowserLeaseManager({
		identity,
		now,
		...(options.leaseLedger === undefined ? {} : { ledger: options.leaseLedger }),
		onFinish: (record) => rememberLeaseReason(record, "lease_expired"),
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
			finishLease(record, "released", "link_changed");
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

	const dispatch = {
		accountLogin: (command, context) => options.actions.account.login(command, context),
		accountLoginCancel: (command, context) => options.actions.account.loginCancel(command, context),
		accountLogout: (command, context) => options.actions.account.logout(command, context),
		threadLinkCreate: (command, context) => options.actions.threadLinks.create(command, context),
		threadLinkRefresh: (command, context) => options.actions.threadLinks.refresh(command, context),
		threadLinkAttach: (command, context) => options.actions.threadLinks.attach(command, context),
		threadLinkRelink: (command, context) => options.actions.threadLinks.relink(command, context),
		start: (command, context) => options.actions.text.start(command, context),
		steer: (command, context) => options.actions.text.steer(command, context),
		interrupt: (command, context) => options.actions.text.interrupt(command, context),
		queueAdd: (command, context) => options.actions.queue.add(command, context),
		queueUpdate: (command, context) => options.actions.queue.update(command, context),
		queueDelete: (command, context) => options.actions.queue.delete(command, context),
		queueReorder: (command, context) => options.actions.queue.reorder(command, context),
		queueStart: (command, context) => options.actions.queue.start(command, context),
		approvalRespond: (command, context) =>
			options.actions.ordinaryApprovals.resolve(command, context),
		dynamicApprovalRespond: (command, context) =>
			options.actions.dynamicApprovals.resolve(command, context),
		realtimeStart: (command, context) => options.actions.realtime.start(command, context),
		realtimeAppendText: (command, context) => options.actions.realtime.appendText(command, context),
		realtimeStop: (command, context) => options.actions.realtime.stop(command, context),
	} satisfies BrowserActionDispatch;

	const invoke = <Command extends OwnedBrowserCommand>(
		command: Command,
		context: BrowserActionContext,
	): Promise<BrowserActionResult> =>
		(
			dispatch[command.command] as (
				value: Command,
				owner: BrowserActionContext,
			) => Promise<BrowserActionResult>
		)(command, context);

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
		command: OwnedBrowserCommand,
	): Promise<BrowserGatewayCommandResult> => {
		let actionStarted = false;
		try {
			expireLeaseIfDue();
			const record = currentLeaseOrThrow(
				leaseManager,
				command.commandId,
				leaseReasons.get(command.commandId),
			);
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
					pending.request.requestId !== command.requestId ||
					pending.request.threadId !== snapshot.threadLink.threadId ||
					pending.request.approvalId !== command.approvalId ||
					pending.request.expiresAtMs <= now()
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
				const pending = snapshot.dynamicApprovals.find(
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
			if (command.command === "approvalRespond")
				options.actions.ordinaryApprovals.acknowledge(command.requestId);
			return Object.freeze({
				kind: "command_result",
				commandId: command.commandId,
				outcome,
				code,
				message,
				snapshot: nextSnapshot,
				...(command.command === "start" && outcome === "delivered" && actionResult?.turnId
					? { turnId: actionResult.turnId }
					: {}),
				...(command.command === "realtimeStart" && actionResult?.realtimeAnswer
					? { realtimeAnswer: actionResult.realtimeAnswer }
					: {}),
				...(command.command === "realtimeStart" && actionResult?.realtimeSessionHandle
					? { realtimeSessionHandle: actionResult.realtimeSessionHandle }
					: {}),
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
		instance?: BrowserConnectionInstance,
	): Promise<BrowserGatewayCommandResult> => {
		const paneId =
			paneIdOverride ?? (isRecord(value) && typeof value["paneId"] === "string" ? value["paneId"] : null);
		if (paneId === null)
			throw new CodexWorkbenchGatewayError(
				"invalid_input",
				"A browser command must identify its pane.",
			);
		const state = stateFor(browserId, paneId, instance);
		if (
			isRecord(value) &&
			typeof value["command"] === "string" &&
			!Object.hasOwn(dispatch, value["command"])
		)
			return refusal(state, null, "unsupported_command");
		let parsed: OwnedBrowserCommand;
		try {
			parsed = normalizeBrowserCommand(model.BrowserCommandSchema.parse(value));
		} catch {
			return refusal(state, null, "invalid_command");
		}
		const fingerprint = fingerprintCommand(parsed);
		const existing =
			inFlightCommands.get(parsed.commandId) ?? settledCommands.get(parsed.commandId);
		if (existing !== undefined) {
			if (existing.fingerprint === fingerprint) {
				if (
					existing.browserId !== browserId ||
					existing.paneId !== paneId ||
					existing.connection !== state.instance
				)
					return refusal(state, parsed.commandId, "lease_transferred");
				return existing.result;
			}
			return refusal(state, parsed.commandId, "invalid_command");
		}
		const result = execute(state, parsed);
		const entry: CachedCommand = {
			fingerprint,
			browserId,
			paneId,
			connection: state.instance,
			result,
		};
		if (leaseManager.current()?.lease.commandId === parsed.commandId) {
			inFlightCommands.set(parsed.commandId, entry);
			void result.then(
				() => {
					if (inFlightCommands.get(parsed.commandId) === entry) {
						inFlightCommands.delete(parsed.commandId);
						rememberSettled(parsed.commandId, entry);
					}
					return undefined;
				},
				() => {
					if (inFlightCommands.get(parsed.commandId) === entry)
						inFlightCommands.delete(parsed.commandId);
					return undefined;
				},
			);
		}
		return result;
	};

	const accountRead = async (
		browserId: BrowserConnectionId,
		paneId: string,
		instance?: BrowserConnectionInstance,
	): Promise<BrowserGatewayAccountReadResult> => {
		const state = stateFor(browserId, paneId, instance);
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

	const claimLease = (
		browserId: string,
		paneId: string,
		instance?: BrowserConnectionInstance,
	): BrowserCommandLease => {
		const state = stateFor(browserId, paneId, instance);
		expireLeaseIfDue();
		ensureAccountReadiness(snapshotFor(state));
		const previous = leaseManager.current();
		if (previous !== null) {
			const released = leaseManager.release(
				previous.binding.browserId,
				previous.binding.paneId,
				previous.binding.connection,
				previous.lease.commandId,
			);
			if (released !== null) rememberLeaseReason(released, "lease_transferred");
		}
		const record = leaseManager.claim(browserId, paneId, state.instance, readBinding(paneId));
		state.lease = record.lease;
		state.binding = record.binding;
		return record.lease;
	};

	const renewLease = (
		browserId: string,
		lease: Pick<BrowserCommandLease, "commandId" | "paneId" | "childId" | "epoch">,
		instance?: BrowserConnectionInstance,
	): BrowserCommandLease => {
		stateFor(browserId, lease.paneId, instance);
		expireLeaseIfDue();
		const record = currentLeaseOrThrow(
			leaseManager,
			lease.commandId,
			leaseReasons.get(lease.commandId),
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
		const state = stateFor(browserId, lease.paneId, instance);
		if (record.binding.connection !== state.instance)
			throw new CodexWorkbenchGatewayError("lease_transferred", "The socket owner changed.", {
				commandId: lease.commandId,
			});
		ensureLeaseBinding(state, record);
		const renewed = leaseManager.renew(browserId, state.instance, {
			...record.lease,
			...lease,
			state: "active",
			expiresAtMs: record.lease.expiresAtMs,
		});
		state.lease = renewed.lease;
		return renewed.lease;
	};

	const releaseLease = (
		browserId: string,
		paneId: string,
		commandId?: BrowserCommandId,
		instance?: BrowserConnectionInstance,
	) => {
		const state = stateFor(browserId, paneId, instance);
		expireLeaseIfDue();
		if (commandId === undefined) commandId = state.lease?.commandId;
		const record = leaseManager.release(browserId, paneId, state.instance, commandId);
		if (record?.lease.state === "released") {
			state.lease = record.lease;
			rememberLeaseReason(record, "lease_released");
		}
		return record?.lease ?? null;
	};

	const setMediaReady = (state: ConnectionState, ready: boolean): BrowserGatewaySnapshotMessage => {
		stateFor(state.browserId, state.paneId, state.instance);
		if (state.mediaReady !== ready) {
			state.mediaReady = ready;
			publishConnection(state);
		}
		return updateSnapshot(state);
	};

	const connect = (
		browserId: string,
		paneId: string,
		providedInstance?: BrowserConnectionInstance,
	): BrowserWorkbenchConnection => {
		if (disposed)
			throw new CodexWorkbenchGatewayError("disposed", "The browser gateway is disposed.");
		assertOpaqueName(browserId, "browserId");
		assertOpaqueName(paneId, "paneId");
		const key = connectionKey(browserId, paneId);
		const existing = connections.get(key);
		const instance = providedInstance ?? Object.freeze({});
		let replaced: ConnectionState | null = null;
		if (existing !== undefined && !existing.closed && existing.instance === instance)
			return connectionFor(existing);
		if (existing !== undefined && !existing.closed) {
			replaced = existing;
			existing.closed = true;
			existing.listeners.clear();
			const current = leaseManager.current();
			if (current?.binding.connection === existing.instance) {
				const released = leaseManager.release(
					existing.browserId,
					existing.paneId,
					existing.instance,
					current.lease.commandId,
				);
				if (released !== null) rememberLeaseReason(released, "lease_transferred");
			}
		}
		const state: ConnectionState = {
			browserId,
			paneId,
			instance,
			listeners: new Set(),
			publishedTerminals: new Set(),
			sequence: 0,
			lastSnapshot: null,
			operation: null,
			lease: null,
			binding: null,
			mediaReady: false,
			disconnectNotified: false,
			closed: false,
		};
		const retainedLease = leaseManager.current();
		if (
			retainedLease?.binding.browserId === browserId &&
			retainedLease.binding.paneId === paneId &&
			retainedLease.binding.connection === instance
		) {
			state.lease = retainedLease.lease;
			state.binding = retainedLease.binding;
		}
		connections.set(key, state);
		if (replaced !== null) void notifyDisconnect(replaced, "browser_disconnected");
		return connectionFor(state);
	};

	const terminate = (reason: BrowserDisconnectReason): void => {
		if (disposed) return;
		for (const state of connections.values()) {
			if (state.lastSnapshot === null) continue;
			state.sequence += 1;
			const voice = Object.freeze({
				...state.lastSnapshot.voice,
				state: "unavailable" as const,
				realtimeSessionId: null,
				reason:
					reason === "child_disconnected"
						? "The Codex child disconnected."
						: "The Codex workbench shut down.",
			});
			state.lastSnapshot = Object.freeze({ ...state.lastSnapshot, voice });
			emit(state.listeners, {
				kind: "delta",
				sequence: state.sequence,
				delta: { voice },
			});
		}
		disposed = true;
		const current = leaseManager.current();
		if (current !== null) {
			const released = leaseManager.invalidate(
				current.lease.childId,
				current.lease.epoch,
				"released",
			);
			if (released !== null) rememberLeaseReason(released, "lease_released");
		}
		leaseManager.dispose();
		for (const unsubscribe of sourceUnsubscribers.splice(0)) unsubscribe();
		for (const state of connections.values()) {
			void notifyDisconnect(state, reason);
			state.closed = true;
			state.listeners.clear();
		}
		connections.clear();
		acknowledgeReadyTerminals();
		inFlightCommands.clear();
		settledCommands.clear();
	};

	const closeConnection = async (state: ConnectionState): Promise<void> => {
		if (disposed || state.closed) {
			await drainSettlements();
			return;
		}
		state.closed = true;
		state.listeners.clear();
		const key = connectionKey(state.browserId, state.paneId);
		if (connections.get(key) === state) connections.delete(key);
		acknowledgeReadyTerminals();
		const current = leaseManager.current();
		if (current?.binding.connection === state.instance) {
			const released = leaseManager.release(
				state.browserId,
				state.paneId,
				state.instance,
				current.lease.commandId,
			);
			if (released !== null) rememberLeaseReason(released, "lease_released");
		}
		void notifyDisconnect(state, "browser_disconnected");
		await drainSettlements();
	};

	const closeConnectionInstance = async (
		browserId: string,
		paneId: string,
		instance: BrowserConnectionInstance,
	): Promise<void> => {
		if (disposed) {
			await drainSettlements();
			return;
		}
		const state = connections.get(connectionKey(browserId, paneId));
		if (state === undefined || state.instance !== instance) {
			await drainSettlements();
			return;
		}
		await closeConnection(state);
	};

	const childExit = async (childId: ChildId, epoch: ChildEpoch): Promise<void> => {
		if (disposed) {
			await drainSettlements();
			return;
		}
		if (
			childId !== identity.identity.validator.childId ||
			epoch !== identity.identity.validator.epoch
		)
			return;
		terminate("child_disconnected");
		await drainSettlements();
	};

	const dispose = async (): Promise<void> => {
		terminate("gateway_shutdown");
		await drainSettlements();
	};

	const subscribe = (
		browserId: string,
		paneId: string,
		listener: (message: BrowserGatewayMessage) => void,
		instance?: BrowserConnectionInstance,
	): BrowserUnsubscribe => {
		const state = stateFor(browserId, paneId, instance);
		state.listeners.add(listener);
		return () => state.listeners.delete(listener);
	};

	const connectionFor = (state: ConnectionState): BrowserWorkbenchConnection =>
		Object.freeze({
			browserId: state.browserId,
			paneId: state.paneId,
			instance: state.instance,
			snapshot: () => {
				const current = stateFor(state.browserId, state.paneId, state.instance);
				return updateSnapshot(current);
			},
			refreshProjection: () =>
				refreshProjection(stateFor(state.browserId, state.paneId, state.instance)),
			confirmPublished: (payload: BrowserPublishedPayload) => confirmPublished(state, payload),
			claimLease: () => claimLease(state.browserId, state.paneId, state.instance),
			renewLease: () => {
				stateFor(state.browserId, state.paneId, state.instance);
				expireLeaseIfDue();
				if (state.lease === null)
					throw new CodexWorkbenchGatewayError("lease_required", "No command lease is active.");
				return renewLease(state.browserId, state.lease, state.instance);
			},
			releaseLease: () => releaseLease(state.browserId, state.paneId, undefined, state.instance),
			setMediaReady: (ready: boolean) => setMediaReady(state, ready),
			accountRead: () => accountRead(state.browserId, state.paneId, state.instance),
			command: (value: unknown) => command(state.browserId, value, state.paneId, state.instance),
			subscribe: (listener: (message: BrowserGatewayMessage) => void) =>
				subscribe(state.browserId, state.paneId, listener, state.instance),
			close: () => closeConnection(state),
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
			options.lifecycle.onChildExit((childId, epoch) => childExit(childId, epoch)) ??
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
		closeConnection: closeConnectionInstance,
		childExit,
		dispose,
	});
}

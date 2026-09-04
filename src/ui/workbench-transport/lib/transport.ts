import { CODEX_REQUEST_SETTLEMENT_MS, SOCKET_RECONNECT_MS } from "../../../shared/timing/timing.js";
import type {
	BrowserCommand,
	BrowserCommandLease,
	BrowserDynamicApproval,
	BrowserSnapshot,
	BrowserThreadLink,
} from "../../../shared/codex-browser-model/index.js";
import { browserSnapshotRelationshipIssues } from "../../../shared/codex-browser-model/index.js";
import {
	BrowserWorkbenchTransportError,
	type BrowserCommandDraft,
	type BrowserCommandName,
	type BrowserGatewayAction,
	type BrowserWorkbenchAccountReadResult,
	type BrowserWorkbenchCapabilities,
	type BrowserWorkbenchCommandResult,
	type BrowserWorkbenchCommandTarget,
	type BrowserWorkbenchGatewayMessage,
	type BrowserWorkbenchSnapshotMessage,
	type BrowserWorkbenchSocket,
	type BrowserWorkbenchState,
	type BrowserWorkbenchTransport,
	type BrowserWorkbenchTransportErrorCode,
	type BrowserWorkbenchTransportOptions,
} from "./contract.js";
import {
	BrowserWorkbenchWireError,
	parseBrowserAccountReadResult,
	parseBrowserCommandLease,
	parseBrowserCommandResult,
	parseBrowserDynamicApprovalResponse,
	parseBrowserEvent,
	parseRequiredBrowserCommandLease,
	parseBrowserResponse,
	parseBrowserSnapshotMessage,
	type BrowserWorkbenchResponseEnvelope,
} from "./wire.js";

const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;

const ACCOUNT_COMMANDS = new Set<BrowserCommandName>([
	"accountLogin",
	"accountLoginCancel",
	"accountLogout",
]);
// Every command that chooses or discovers a pane's link. None of them needs an
// executable link, because choosing one is exactly what a pane without one does.
const THREAD_LINK_COMMANDS = new Set<BrowserCommandName>([
	"threadLinkCreate",
	"threadLinkRefresh",
	"threadLinkAttach",
	"threadLinkRelink",
]);
const QUEUE_COMMANDS = new Set<BrowserCommandName>([
	"queueAdd",
	"queueUpdate",
	"queueDelete",
	"queueReorder",
	"queueStart",
]);
const ACCOUNT_READINESS = new Set([
	"login_capable",
	"signed_out",
	"login_pending",
	"account_ready",
	"thread_capable",
]);

type PendingKind = "snapshot" | "lease" | "account" | "command" | "media" | "control";

interface PendingRequest {
	readonly action: BrowserGatewayAction;
	readonly kind: PendingKind;
	readonly commandId: BrowserCommandLease["commandId"] | null;
	readonly resolve: (value: unknown) => void;
	readonly reject: (error: BrowserWorkbenchTransportError) => void;
	timer: ReturnType<typeof setTimeout> | null;
}

interface SocketRun {
	readonly socket: BrowserWorkbenchSocket;
	readonly pending: Map<string, PendingRequest>;
	readonly remove: () => void;
	snapshot: BrowserSnapshot | null;
	sequence: number | null;
	refreshPromise: Promise<BrowserWorkbenchSnapshotMessage> | null;
	closed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameWireValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function messageOf(error: unknown, fallback: string): string {
	return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

function socketOpen(socket: BrowserWorkbenchSocket): boolean {
	return socket.readyState === SOCKET_OPEN;
}

function clearPendingTimer(pending: PendingRequest): void {
	if (pending.timer !== null) {
		clearTimeout(pending.timer);
		pending.timer = null;
	}
}

function sameLeaseTarget(
	left: Pick<BrowserCommandLease, "commandId" | "paneId" | "childId" | "epoch">,
	right: Pick<BrowserCommandLease, "commandId" | "paneId" | "childId" | "epoch">,
): boolean {
	return (
		left.commandId === right.commandId &&
		left.paneId === right.paneId &&
		left.childId === right.childId &&
		left.epoch === right.epoch
	);
}

const DYNAMIC_IDENTITY_FIELDS = [
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
	"operationId",
] as const;

function sameDynamicIdentity(left: unknown, right: unknown): boolean {
	if (!isRecord(left) || !isRecord(right)) return false;
	return DYNAMIC_IDENTITY_FIELDS.every((field) => left[field] === right[field]);
}

function sameDynamicLink(left: unknown, right: unknown): boolean {
	if (!isRecord(left) || !isRecord(right)) return false;
	return (
		left.threadId === right.threadId && left.childId === right.childId && left.epoch === right.epoch
	);
}

function sameDynamicBinding(
	approval: BrowserDynamicApproval,
	target: BrowserWorkbenchCommandTarget,
): boolean {
	return (
		approval.binding !== null &&
		approval.binding.commandId === target.commandId &&
		approval.binding.paneId === target.paneId &&
		sameDynamicLink(approval.binding.capturedLink, target.capturedThreadLink)
	);
}

function dynamicApprovalMatchesTarget(
	active: SocketRun,
	draft: BrowserCommandDraft,
	target: BrowserWorkbenchCommandTarget,
	fullCommand: BrowserCommand,
	now: () => number,
): boolean {
	if (active.snapshot === null) return false;
	const draftRecord = draft as unknown as Record<string, unknown>;
	const identity = draftRecord.identity;
	const capturedLink = draftRecord.capturedLink;
	const effectHash = draftRecord.effectHash;
	if (!isRecord(identity) || !isRecord(capturedLink) || typeof effectHash !== "string")
		return false;
	if (
		identity.child !== target.childId ||
		identity.epoch !== target.epoch ||
		identity.threadId !== target.capturedThreadLink.threadId ||
		!sameDynamicLink(capturedLink, target.capturedThreadLink)
	)
		return false;
	const pending = active.snapshot.dynamicApprovals.find(
		(candidate) =>
			candidate.state === "pending" &&
			candidate.decision === null &&
			candidate.delivery === null &&
			candidate.toolResult === null &&
			candidate.expiresAtMs > now() &&
			candidate.effectHash === effectHash &&
			sameDynamicIdentity(candidate.identity, identity) &&
			sameDynamicBinding(candidate, target),
	);
	if (pending === undefined) return false;
	try {
		parseBrowserDynamicApprovalResponse(pending, fullCommand);
		return true;
	} catch {
		return false;
	}
}

function hasUsableDynamicApproval(
	active: SocketRun,
	targetLease: BrowserCommandLease | null,
	now: () => number,
): boolean {
	const link = active.snapshot?.threadLink;
	if (targetLease === null || link?.state !== "executable") return false;
	return (
		active.snapshot?.dynamicApprovals.some(
			(candidate) =>
				candidate.state === "pending" &&
				candidate.decision === null &&
				candidate.delivery === null &&
				candidate.toolResult === null &&
				candidate.expiresAtMs > now() &&
				candidate.binding !== null &&
				candidate.binding.commandId === targetLease.commandId &&
				candidate.binding.paneId === targetLease.paneId &&
				candidate.identity.child === targetLease.childId &&
				candidate.identity.epoch === targetLease.epoch &&
				candidate.identity.threadId === link.threadId &&
				sameDynamicLink(candidate.binding.capturedLink, link),
		) ?? false
	);
}

function sameCapturedLink(left: BrowserThreadLink, right: BrowserThreadLink): boolean {
	return (
		left.state === right.state &&
		left.threadId === right.threadId &&
		left.childId === right.childId &&
		left.epoch === right.epoch
	);
}

function sameCommandTarget(
	left: BrowserWorkbenchCommandTarget,
	right: BrowserWorkbenchCommandTarget,
): boolean {
	return (
		left.commandId === right.commandId &&
		left.paneId === right.paneId &&
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		sameCapturedLink(left.capturedThreadLink, right.capturedThreadLink)
	);
}

/**
 * The identity an ordinary approval must still be bound to. Both the capability
 * answer and the dispatch check read it from the lease, so supportsCommand and
 * command() cannot disagree about which approvals are answerable.
 */
interface ApprovalTargetIdentity {
	readonly childId: BrowserCommandLease["childId"];
	readonly epoch: BrowserCommandLease["epoch"];
	readonly threadId: BrowserThreadLink["threadId"];
}

/**
 * The binding's `link` is deliberately not compared. The approvals contract
 * types it as nullable free-form text, the request builder defaults it to null,
 * and nothing validates it beyond a bounded human string — so it carries no
 * guaranteed value and is not an identity.
 */
function approvalBoundTo(
	candidate: BrowserSnapshot["approvals"][number],
	identity: ApprovalTargetIdentity,
	now: () => number,
): boolean {
	return (
		candidate.threadId === identity.threadId &&
		candidate.lifecycle.state === "pending" &&
		candidate.expiresAtMs > now() &&
		candidate.binding.child === identity.childId &&
		candidate.binding.epoch === identity.epoch
	);
}

/**
 * An ordinary approval carries no threadId of its own in the command, so
 * nothing about the draft would notice a navigation between the moment the
 * person read the request and the moment they answered it. The snapshot's own
 * approval is the check: it must still be pending, unexpired, and bound to the
 * exact child, epoch and thread the command target captured.
 */
function approvalMatchesTarget(
	active: SocketRun,
	draft: BrowserCommandDraft,
	target: BrowserWorkbenchCommandTarget,
	now: () => number,
): boolean {
	const snapshot = active.snapshot;
	const link = target.capturedThreadLink;
	if (snapshot === null || link.state !== "executable") return false;
	const draftRecord = draft as unknown as Record<string, unknown>;
	const requestId = draftRecord.requestId;
	const approvalId = draftRecord.approvalId ?? null;
	if (typeof requestId !== "string" || requestId.length === 0) return false;
	const identity = { childId: target.childId, epoch: target.epoch, threadId: link.threadId };
	return snapshot.approvals.some(
		(candidate) =>
			candidate.requestId === requestId &&
			(candidate.approvalId ?? null) === approvalId &&
			approvalBoundTo(candidate, identity, now),
	);
}

function hasUsableApproval(
	active: SocketRun,
	targetLease: BrowserCommandLease | null,
	now: () => number,
): boolean {
	const snapshot = active.snapshot;
	const link = snapshot?.threadLink;
	if (snapshot === null || targetLease === null || link?.state !== "executable") return false;
	const identity = {
		childId: targetLease.childId,
		epoch: targetLease.epoch,
		threadId: link.threadId,
	};
	return snapshot.approvals.some((candidate) => approvalBoundTo(candidate, identity, now));
}

function queueSubmissionIds(draft: BrowserCommandDraft): readonly unknown[] {
	const draftRecord = draft as unknown as Record<string, unknown>;
	if (Array.isArray(draftRecord.orderedSubmissionIds)) return draftRecord.orderedSubmissionIds;
	return draftRecord.submissionId === undefined ? [] : [draftRecord.submissionId];
}

/**
 * The queue commands carry no thread identity. A queue reads as unavailable
 * only when the workhorse has no submissions to show at all, so a pane that has
 * navigated sees the *new* link's queue rather than nothing: presence alone
 * proves nothing about which link a command was composed against.
 *
 * The four commands that name submissions are anchored by those ids, which
 * belong to one link's queue and are gone from another's. queueAdd names none,
 * so it must carry the target it was composed against — see command().
 */
function queueCommandRefusal(
	active: SocketRun,
	draft: BrowserCommandDraft,
): { readonly code: "link_changed" | "invalid_command"; readonly message: string } | null {
	const queue = active.snapshot?.queue;
	if (queue === undefined || queue.status === "unavailable")
		return {
			code: "link_changed",
			message: "The workbench queue no longer belongs to the captured thread link.",
		};
	const present = new Set<unknown>(queue.entries.map((entry) => entry.submissionId));
	for (const submissionId of queueSubmissionIds(draft))
		if (!present.has(submissionId))
			return {
				code: "invalid_command",
				message: "The queued submission is no longer in the captured workbench queue.",
			};
	return null;
}

function transportFailure(
	code: BrowserWorkbenchTransportErrorCode,
	message: string,
	pending?: Pick<PendingRequest, "commandId">,
	failureOptions: {
		readonly outcome?: "delivered" | "not_delivered" | "outcome_unknown";
		readonly requestId?: string | null;
		readonly cause?: unknown;
	} = {},
): BrowserWorkbenchTransportError {
	return new BrowserWorkbenchTransportError(code, message, {
		...failureOptions,
		commandId: pending?.commandId ?? null,
	});
}

function initialState(): BrowserWorkbenchState {
	return Object.freeze({
		kind: "connection",
		state: "stopped",
		connection: "stopped",
		snapshot: null,
		sequence: null,
		reason: "No Codex workbench socket is attached.",
	}) satisfies BrowserWorkbenchState;
}

function isWireError(error: unknown): boolean {
	return error instanceof BrowserWorkbenchWireError;
}

/** Adapt one existing canvas WebSocket to the browser workbench gateway. */
export function createBrowserWorkbenchTransport(
	transportOptions: BrowserWorkbenchTransportOptions = {},
): BrowserWorkbenchTransport {
	const now = transportOptions.now ?? Date.now;
	let requestCounter = 0;
	let activeRun: SocketRun | null = null;
	let currentLease: BrowserCommandLease | null = null;
	let ownerState: BrowserWorkbenchState = initialState();
	let disposed = false;
	const listeners = new Set<() => void>();

	const notify = (): void => {
		for (const listener of listeners) {
			try {
				listener();
			} catch {
				// A UI subscriber cannot be allowed to break socket ownership.
			}
		}
	};

	const setState = (next: BrowserWorkbenchState): void => {
		ownerState = Object.freeze(next);
		notify();
	};

	const nextRequestId = (): string => {
		const supplied = transportOptions.requestId?.();
		if (supplied !== undefined && supplied.length > 0) return supplied;
		if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
		requestCounter += 1;
		return `browser-workbench-${requestCounter}`;
	};

	const isCurrent = (active: SocketRun): boolean =>
		!disposed && activeRun === active && !active.closed;

	const rejectPending = (
		active: SocketRun,
		code: ConstructorParameters<typeof BrowserWorkbenchTransportError>[0],
		message: string,
	): void => {
		for (const [requestId, pending] of active.pending) {
			clearPendingTimer(pending);
			pending.reject(
				transportFailure(code, message, pending, {
					requestId,
					outcome: "outcome_unknown",
				}),
			);
		}
		active.pending.clear();
	};

	const retire = (
		active: SocketRun,
		code: "response_lost" | "replaced" | "socket_unavailable",
		reason: string,
	): void => {
		if (active.closed) return;
		active.closed = true;
		active.remove();
		rejectPending(active, code, reason);
		if (activeRun === active) activeRun = null;
	};

	const incompatible = (active: SocketRun, error: unknown): void => {
		if (!isCurrent(active)) return;
		const reason = messageOf(error, "The Codex workbench contract is incompatible.");
		active.closed = true;
		active.remove();
		rejectPending(active, "incompatible_contract", reason);
		activeRun = null;
		currentLease = null;
		setState({
			kind: "connection",
			state: "incompatible_contract",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason,
		});
	};

	const setBackoff = (
		snapshot: BrowserSnapshot | null,
		sequence: number | null,
		reason: string,
	): void => {
		setState({
			kind: "connection",
			state: "backoff",
			connection: "reconnecting",
			snapshot,
			sequence,
			retryAtMs: now() + SOCKET_RECONNECT_MS,
			reason,
		});
	};

	const setReadinessState = (active: SocketRun): void => {
		if (!isCurrent(active) || active.snapshot === null || active.sequence === null) return;
		setState({
			kind: "readiness",
			state: active.snapshot.readiness.state,
			connection: "connected",
			snapshot: active.snapshot,
			sequence: active.sequence,
		});
	};

	const syncLease = (active: SocketRun): void => {
		currentLease = active.snapshot?.lease ?? null;
	};

	const markStale = (active: SocketRun, receivedSequence: number, reason: string): void => {
		if (!isCurrent(active)) return;
		setState({
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: active.snapshot,
			sequence: active.sequence,
			expectedSequence: active.sequence === null ? 0 : active.sequence + 1,
			receivedSequence,
			reason,
		});
	};

	const requireCurrent = (active: SocketRun): void => {
		if (!isCurrent(active) || !socketOpen(active.socket))
			throw transportFailure("socket_unavailable", "The Codex workbench socket is unavailable.");
	};

	const sendRequest = (
		active: SocketRun,
		action: BrowserGatewayAction,
		extra: Record<string, unknown> = {},
		kind: PendingKind,
		commandId: BrowserCommandLease["commandId"] | null = null,
	): Promise<unknown> => {
		requireCurrent(active);
		const requestId = nextRequestId();
		const request = {
			type: "codex_workbench_request",
			requestId,
			action,
			...extra,
		};
		let pending!: PendingRequest;
		const result = new Promise<unknown>((resolve, reject) => {
			pending = { action, kind, commandId, resolve, reject, timer: null };
			active.pending.set(requestId, pending);
			pending.timer = setTimeout(() => {
				if (active.pending.get(requestId) !== pending) return;
				active.pending.delete(requestId);
				pending.timer = null;
				pending.reject(
					transportFailure(
						"response_lost",
						"The Codex workbench response did not arrive before the settlement deadline.",
						pending,
						{ requestId, outcome: "outcome_unknown" },
					),
				);
			}, CODEX_REQUEST_SETTLEMENT_MS);
		});
		try {
			active.socket.send(JSON.stringify(request));
		} catch (error) {
			if (active.pending.get(requestId) === pending) active.pending.delete(requestId);
			clearPendingTimer(pending);
			return Promise.reject(
				transportFailure(
					"socket_unavailable",
					"The Codex workbench request could not be sent.",
					{
						commandId,
					},
					{ outcome: "not_delivered", requestId, cause: error },
				),
			);
		}
		return result;
	};

	const applyMessage = (
		active: SocketRun,
		message: BrowserWorkbenchGatewayMessage,
		clearDuplicate: boolean,
	): "applied" | "duplicate" | "stale" | "gap" => {
		if (!isCurrent(active)) return "stale";
		if (message.kind === "snapshot") {
			if (
				active.snapshot === null ||
				active.sequence === null ||
				message.sequence > active.sequence
			) {
				active.snapshot = message.snapshot;
				active.sequence = message.sequence;
				syncLease(active);
				setReadinessState(active);
				return "applied";
			}
			if (message.sequence < active.sequence) {
				markStale(active, message.sequence, "A stale workbench snapshot arrived.");
				return "stale";
			}
			if (sameWireValue(message.snapshot, active.snapshot)) {
				if (clearDuplicate) setReadinessState(active);
				return "duplicate";
			}
			markStale(
				active,
				message.sequence,
				"The workbench snapshot changed without advancing its sequence.",
			);
			return "stale";
		}

		if (active.snapshot === null || active.sequence === null) {
			markStale(active, message.sequence, "A workbench delta arrived before a full snapshot.");
			return "gap";
		}
		if (message.sequence > active.sequence + 1) {
			markStale(active, message.sequence, "A workbench delta skipped a sequence.");
			return "gap";
		}
		// Sequence first, contradiction second. A redelivered older delta names an
		// earlier state of a field the current snapshot has moved past, so merging
		// it produces a contradiction that says nothing about the contract; reading
		// it as one would strand the transport in incompatible_contract with no
		// recovery snapshot requested.
		if (message.sequence < active.sequence) {
			markStale(active, message.sequence, "A stale workbench delta arrived.");
			return "stale";
		}
		const candidate = Object.freeze({
			...active.snapshot,
			...message.delta,
		}) as BrowserSnapshot;
		if (message.sequence === active.sequence) {
			if (sameWireValue(candidate, active.snapshot)) {
				if (clearDuplicate) setReadinessState(active);
				return "duplicate";
			}
			markStale(active, message.sequence, "The workbench delta changed the current sequence.");
			return "stale";
		}
		const relationshipIssue = browserSnapshotRelationshipIssues(candidate)[0];
		if (relationshipIssue !== undefined) {
			incompatible(
				active,
				new BrowserWorkbenchWireError(
					`The Codex workbench delta contradicts its snapshot at ${relationshipIssue.path.join(".")}: ${relationshipIssue.message}`,
				),
			);
			return "stale";
		}
		active.snapshot = candidate;
		active.sequence = message.sequence;
		syncLease(active);
		setReadinessState(active);
		return "applied";
	};

	const refreshFor = (active: SocketRun): Promise<BrowserWorkbenchSnapshotMessage> => {
		if (active.refreshPromise !== null) return active.refreshPromise;
		const request = (async (): Promise<BrowserWorkbenchSnapshotMessage> => {
			const value = await sendRequest(active, "snapshot", {}, "snapshot");
			let message: BrowserWorkbenchSnapshotMessage;
			try {
				message = parseBrowserSnapshotMessage(value);
			} catch (error) {
				incompatible(active, error);
				throw error;
			}
			if (isCurrent(active)) applyMessage(active, message, true);
			return message;
		})();
		let tracked!: Promise<BrowserWorkbenchSnapshotMessage>;
		tracked = request.finally(() => {
			if (active.refreshPromise === tracked) active.refreshPromise = null;
		});
		active.refreshPromise = tracked;
		return tracked;
	};

	const recover = (active: SocketRun): void => {
		if (!isCurrent(active) || active.refreshPromise !== null) return;
		void refreshFor(active).catch(() => undefined);
	};

	const reconcileAfterUnsequencedResult = async (active: SocketRun): Promise<void> => {
		if (!isCurrent(active)) return;
		try {
			await refreshFor(active);
		} catch (error) {
			if (isCurrent(active) && !isWireError(error) && ownerState.kind === "readiness")
				markStale(active, active.sequence ?? 0, "The result snapshot could not be reconciled.");
		}
	};

	const handleGatewayMessage = (
		active: SocketRun,
		message: BrowserWorkbenchGatewayMessage,
	): void => {
		const status = applyMessage(active, message, false);
		if (status === "gap" || status === "stale") recover(active);
	};

	const handleResponse = (active: SocketRun, raw: unknown): void => {
		if (!isRecord(raw)) return;
		const requestId = typeof raw.requestId === "string" ? raw.requestId : null;
		if (requestId === null || !active.pending.has(requestId)) return;
		const pending = active.pending.get(requestId);
		if (pending === undefined) return;
		let response: BrowserWorkbenchResponseEnvelope;
		try {
			response = parseBrowserResponse(raw);
			if (response.requestId !== requestId || response.action !== pending.action)
				throw new BrowserWorkbenchWireError(
					"The Codex workbench response does not match its request.",
				);
		} catch (error) {
			active.pending.delete(requestId);
			clearPendingTimer(pending);
			const failure = transportFailure(
				"incompatible_contract",
				messageOf(error, "The Codex workbench response is incompatible."),
				pending,
				{ outcome: "outcome_unknown", requestId, cause: error },
			);
			pending.reject(failure);
			incompatible(active, error);
			return;
		}
		active.pending.delete(requestId);
		clearPendingTimer(pending);
		if (!response.ok) {
			pending.reject(
				transportFailure(
					"gateway_error",
					response.error ?? "The Codex workbench request failed.",
					pending,
					{
						outcome: "not_delivered",
						requestId,
					},
				),
			);
			return;
		}
		pending.resolve(response.value);
	};

	const onMessage = (active: SocketRun, event: Event): void => {
		if (!isCurrent(active)) return;
		const data = (event as MessageEvent).data;
		if (typeof data !== "string") return;
		let raw: unknown;
		try {
			raw = JSON.parse(data);
		} catch {
			return;
		}
		if (!isRecord(raw)) return;
		if (raw.type === "codex_workbench_event") {
			try {
				handleGatewayMessage(active, parseBrowserEvent(raw));
			} catch (error) {
				incompatible(active, error);
			}
			return;
		}
		if (raw.type === "codex_workbench_result") handleResponse(active, raw);
	};

	const onClose = (active: SocketRun): void => {
		if (!isCurrent(active)) return;
		const snapshot = active.snapshot;
		retire(
			active,
			"response_lost",
			"The Codex workbench socket closed before all responses arrived.",
		);
		currentLease = null;
		setBackoff(snapshot, active.sequence, "The Codex workbench socket closed.");
	};

	const createRun = (socket: BrowserWorkbenchSocket): SocketRun => {
		let active!: SocketRun;
		const messageListener = (event: Event): void => onMessage(active, event);
		const closeListener = (): void => onClose(active);
		socket.addEventListener("message", messageListener);
		socket.addEventListener("close", closeListener);
		active = {
			socket,
			pending: new Map(),
			remove: () => {
				socket.removeEventListener("message", messageListener);
				socket.removeEventListener("close", closeListener);
			},
			snapshot: null,
			sequence: null,
			refreshPromise: null,
			closed: false,
		};
		return active;
	};

	const waitForOpen = async (active: SocketRun): Promise<void> => {
		if (socketOpen(active.socket)) return;
		if (active.socket.readyState === SOCKET_CLOSING || active.socket.readyState === SOCKET_CLOSED)
			throw transportFailure("socket_unavailable", "The Codex workbench socket is closed.");
		await new Promise<void>((resolve, reject) => {
			const onOpen = (): void => {
				cleanup();
				resolve();
			};
			const onClosed = (): void => {
				cleanup();
				reject(
					transportFailure(
						"socket_unavailable",
						"The Codex workbench socket closed before connecting.",
					),
				);
			};
			const cleanup = (): void => {
				active.socket.removeEventListener("open", onOpen);
				active.socket.removeEventListener("close", onClosed);
			};
			active.socket.addEventListener("open", onOpen);
			active.socket.addEventListener("close", onClosed);
		});
	};

	const handshake = async (active: SocketRun): Promise<void> => {
		const subscribed = parseBrowserSnapshotMessage(
			await sendRequest(active, "subscribe", {}, "snapshot"),
		);
		if (!isCurrent(active)) return;
		applyMessage(active, subscribed, true);
	};

	const accountReady = (active: SocketRun): boolean =>
		isCurrent(active) &&
		active.snapshot !== null &&
		active.sequence !== null &&
		ownerState.kind === "readiness" &&
		ACCOUNT_READINESS.has(active.snapshot.readiness.state);

	const leaseUsable = (): boolean =>
		currentLease?.state === "active" && currentLease.expiresAtMs > now();

	const commandSupported = (active: SocketRun, command: BrowserCommandName): boolean => {
		if (!accountReady(active) || !leaseUsable()) return false;
		if (ACCOUNT_COMMANDS.has(command)) return true;
		if (active.snapshot?.readiness.state !== "thread_capable") return false;
		if (THREAD_LINK_COMMANDS.has(command)) return true;
		if (command === "dynamicApprovalRespond")
			return hasUsableDynamicApproval(active, currentLease, now);
		if (active.snapshot.threadLink.state !== "executable") return false;
		if (command === "approvalRespond") return hasUsableApproval(active, currentLease, now);
		if (QUEUE_COMMANDS.has(command)) return active.snapshot.queue.status !== "unavailable";
		return true;
	};

	/**
	 * Why a disabled command is disabled, when the workbench itself is otherwise
	 * usable: an approval or queue row that is no longer the one on screen reads
	 * very differently from a workbench that is not ready at all.
	 */
	const disabledCommandCode = (
		active: SocketRun,
		commandName: BrowserCommandName,
	): BrowserWorkbenchTransportErrorCode => {
		if (
			!accountReady(active) ||
			!leaseUsable() ||
			active.snapshot?.readiness.state !== "thread_capable" ||
			active.snapshot.threadLink.state !== "executable"
		)
			return "not_ready";
		if (commandName === "approvalRespond") return "approval_not_pending";
		if (commandName === "dynamicApprovalRespond") return "dynamic_approval_not_pending";
		if (QUEUE_COMMANDS.has(commandName) && active.snapshot.queue.status === "unavailable")
			return "link_changed";
		return "not_ready";
	};

	const captureLease = (active: SocketRun): BrowserCommandLease => {
		if (!isCurrent(active) || active.snapshot === null || active.sequence === null)
			throw transportFailure("socket_unavailable", "The Codex workbench has no active socket.");
		const lease = currentLease;
		if (lease === null)
			throw transportFailure("lease_required", "A browser command lease is required.");
		if (lease.state !== "active")
			throw transportFailure(
				lease.state === "expired" ? "lease_expired" : "lease_released",
				"The browser command lease is no longer active.",
				{ commandId: lease.commandId },
			);
		if (lease.expiresAtMs <= now()) {
			currentLease = Object.freeze({ ...lease, state: "expired" }) as BrowserCommandLease;
			notify();
			throw transportFailure("lease_expired", "The browser command lease has expired.", {
				commandId: lease.commandId,
			});
		}
		return lease;
	};

	const captureTarget = (active: SocketRun): BrowserWorkbenchCommandTarget => {
		const lease = captureLease(active);
		if (active.snapshot === null)
			throw transportFailure("socket_unavailable", "The workbench snapshot is unavailable.");
		return Object.freeze({
			commandId: lease.commandId,
			paneId: lease.paneId,
			childId: lease.childId,
			epoch: lease.epoch,
			capturedThreadLink: Object.freeze({ ...active.snapshot.threadLink }),
		});
	};

	const command = async (
		draft: BrowserCommandDraft,
		requestedTarget?: BrowserWorkbenchCommandTarget,
	): Promise<BrowserWorkbenchCommandResult> => {
		const active = activeRun;
		if (active === null)
			throw transportFailure("socket_unavailable", "The Codex workbench has no active socket.");
		const commandName = (draft as { readonly command?: unknown }).command;
		if (typeof commandName !== "string")
			throw transportFailure(
				"not_ready",
				"The requested browser command is not enabled in the current workbench state.",
			);
		if (!commandSupported(active, commandName as BrowserCommandName)) {
			if (
				currentLease?.state === "expired" ||
				(currentLease?.state === "active" && currentLease.expiresAtMs <= now())
			)
				captureLease(active);
			throw transportFailure(
				disabledCommandCode(active, commandName as BrowserCommandName),
				"The requested browser command is not enabled in the current workbench state.",
			);
		}
		const target = captureTarget(active);
		// A caller that captured its target when it rendered the action — the
		// approval it is answering, the queue row it is moving — gets that exact
		// target enforced rather than silently swapped for whatever is current.
		if (requestedTarget !== undefined && !sameCommandTarget(requestedTarget, target))
			throw transportFailure(
				"link_changed",
				"The workbench target changed since this command was captured.",
				{ commandId: requestedTarget.commandId },
			);
		// queueAdd is the one command with nothing of its own to anchor it: no
		// thread, no submission id. Forgetting to name a target would make it land
		// on whatever link the pane has navigated to, so forgetting is refused.
		if (commandName === "queueAdd" && requestedTarget === undefined)
			throw transportFailure(
				"link_required",
				"A queued submission must name the workbench target it was composed against.",
				{ commandId: target.commandId },
			);
		if (
			!ACCOUNT_COMMANDS.has(commandName as BrowserCommandName) &&
			!THREAD_LINK_COMMANDS.has(commandName as BrowserCommandName) &&
			(target.capturedThreadLink.state !== "executable" ||
				("threadId" in (draft as object) &&
					(draft as { readonly threadId?: unknown }).threadId !==
						target.capturedThreadLink.threadId))
		) {
			throw transportFailure(
				"link_changed",
				"The command target no longer matches the captured workbench link.",
				{
					commandId: target.commandId,
				},
			);
		}
		const fullCommand = {
			...(draft as unknown as Record<string, unknown>),
			kind: "browser_command",
			commandId: target.commandId,
			paneId: target.paneId,
			childId: target.childId,
			epoch: target.epoch,
		} as unknown as BrowserCommand;
		if (
			commandName === "dynamicApprovalRespond" &&
			!dynamicApprovalMatchesTarget(active, draft, target, fullCommand, now)
		)
			throw transportFailure(
				"dynamic_approval_not_pending",
				"The dynamic approval is no longer pending for the captured browser target.",
				{ commandId: target.commandId },
			);
		if (commandName === "approvalRespond" && !approvalMatchesTarget(active, draft, target, now))
			throw transportFailure(
				"approval_not_pending",
				"The approval is no longer pending for the captured browser target.",
				{ commandId: target.commandId },
			);
		if (QUEUE_COMMANDS.has(commandName as BrowserCommandName)) {
			const refusal = queueCommandRefusal(active, draft);
			if (refusal !== null)
				throw transportFailure(refusal.code, refusal.message, { commandId: target.commandId });
		}
		const value = await sendRequest(
			active,
			"command",
			{ command: fullCommand },
			"command",
			target.commandId,
		);
		let result: BrowserWorkbenchCommandResult;
		try {
			result = parseBrowserCommandResult(value);
		} catch (error) {
			incompatible(active, error);
			throw transportFailure(
				"incompatible_contract",
				messageOf(error, "The command result is incompatible."),
				{
					commandId: target.commandId,
				},
				{ outcome: "outcome_unknown", cause: error },
			);
		}
		if (result.commandId !== target.commandId) {
			const error = new BrowserWorkbenchWireError(
				"The Codex workbench command result identity does not match its request.",
			);
			incompatible(active, error);
			throw transportFailure(
				"incompatible_contract",
				error.message,
				{ commandId: target.commandId },
				{ outcome: "outcome_unknown", cause: error },
			);
		}
		if (isCurrent(active)) await reconcileAfterUnsequencedResult(active);
		return result;
	};

	const capabilities = (): BrowserWorkbenchCapabilities => {
		const active = activeRun;
		const connected = active !== null && isCurrent(active) && socketOpen(active.socket);
		const readiness = active?.snapshot?.readiness.state ?? null;
		const canReadAccount = connected && accountReady(active);
		const canClaimLease = connected && accountReady(active);
		// Deliberately not gated on ownerState.kind the way canReadAccount and
		// canCommand are. Renewing and releasing are lease-lifecycle calls to the
		// gateway, not commands against workbench state, and a stale_snapshot
		// recovery is exactly when a person must be able to keep or hand back the
		// lease. The capability matrix owner asserts that value explicitly.
		const canRenewLease = connected && leaseUsable();
		const canReleaseLease = connected && leaseUsable();
		const canCommand =
			connected &&
			ownerState.kind === "readiness" &&
			leaseUsable() &&
			readiness === "thread_capable" &&
			active?.snapshot?.threadLink.state === "executable";
		return Object.freeze({
			connected,
			readiness,
			canReadAccount,
			canClaimLease,
			canRenewLease,
			canReleaseLease,
			canCommand,
			canThreadCommands: canCommand,
			canRealtime: canCommand,
			supportsCommand: (commandName: BrowserCommandName): boolean =>
				active !== null && commandSupported(active, commandName),
		});
	};

	const attach = async (socket: BrowserWorkbenchSocket): Promise<BrowserWorkbenchState> => {
		if (disposed) return ownerState;
		if (activeRun?.socket === socket && !activeRun.closed) return ownerState;
		const previous = activeRun;
		if (previous !== null) retire(previous, "replaced", "The workbench socket was replaced.");
		const active = createRun(socket);
		activeRun = active;
		currentLease = null;
		setState({
			kind: "connection",
			state: "reconnecting",
			connection: "reconnecting",
			snapshot: null,
			sequence: null,
			reason: "Connecting to the Codex workbench.",
		});
		try {
			await waitForOpen(active);
			if (!isCurrent(active)) return ownerState;
			await handshake(active);
			return ownerState;
		} catch (error) {
			if (!isCurrent(active)) return ownerState;
			if (isWireError(error)) {
				incompatible(active, error);
				return ownerState;
			}
			const snapshot = active.snapshot;
			const sequence = active.sequence;
			retire(
				active,
				"socket_unavailable",
				messageOf(error, "The Codex workbench connection failed."),
			);
			currentLease = null;
			setBackoff(snapshot, sequence, messageOf(error, "The Codex workbench connection failed."));
			return ownerState;
		}
	};

	const detach = async (socket?: BrowserWorkbenchSocket): Promise<void> => {
		const active = activeRun;
		if (active === null || (socket !== undefined && active.socket !== socket)) return;
		const snapshot = active.snapshot;
		retire(active, "replaced", "The Codex workbench transport was detached.");
		currentLease = null;
		setState({
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason:
				snapshot === null
					? "No Codex workbench socket is attached."
					: "The Codex workbench transport was detached.",
		});
	};

	const refresh = async (): Promise<BrowserWorkbenchSnapshotMessage> => {
		const active = activeRun;
		if (active === null)
			throw transportFailure("socket_unavailable", "The Codex workbench has no active socket.");
		return refreshFor(active);
	};

	const setMediaReady = async (ready: boolean): Promise<BrowserWorkbenchSnapshotMessage> => {
		const active = activeRun;
		if (active === null)
			throw transportFailure("socket_unavailable", "The Codex workbench has no active socket.");
		const value = await sendRequest(active, "mediaReady", { ready }, "media");
		try {
			const message = parseBrowserSnapshotMessage(value);
			if (isCurrent(active)) applyMessage(active, message, true);
			return message;
		} catch (error) {
			incompatible(active, error);
			throw transportFailure(
				"incompatible_contract",
				messageOf(error, "The media readiness result is incompatible."),
				undefined,
				{
					outcome: "outcome_unknown",
					cause: error,
				},
			);
		}
	};

	const claimLease = async (): Promise<BrowserCommandLease> => {
		const active = activeRun;
		if (active === null || !accountReady(active))
			throw transportFailure(
				"not_ready",
				"The workbench is not ready to claim a browser command lease.",
			);
		const value = await sendRequest(active, "claimLease", {}, "lease");
		let lease: BrowserCommandLease;
		try {
			lease = parseRequiredBrowserCommandLease(value);
		} catch (error) {
			incompatible(active, error);
			throw transportFailure(
				"incompatible_contract",
				messageOf(error, "The lease result is incompatible."),
				undefined,
				{
					outcome: "outcome_unknown",
					cause: error,
				},
			);
		}
		if (isCurrent(active)) {
			currentLease = lease;
			notify();
			await reconcileAfterUnsequencedResult(active);
		}
		return lease;
	};

	const renewLease = async (): Promise<BrowserCommandLease> => {
		const active = activeRun;
		if (active === null)
			throw transportFailure("socket_unavailable", "The Codex workbench has no active socket.");
		const lease = captureLease(active);
		const value = await sendRequest(active, "renewLease", {}, "lease", lease.commandId);
		let renewed: BrowserCommandLease;
		try {
			renewed = parseRequiredBrowserCommandLease(value);
		} catch (error) {
			incompatible(active, error);
			throw transportFailure(
				"incompatible_contract",
				messageOf(error, "The renewed lease is incompatible."),
				{
					commandId: lease.commandId,
				},
				{ outcome: "outcome_unknown", cause: error },
			);
		}
		if (!sameLeaseTarget(renewed, lease)) {
			const error = new BrowserWorkbenchWireError(
				"The renewed workbench lease identity does not match the active lease.",
			);
			incompatible(active, error);
			throw transportFailure(
				"incompatible_contract",
				error.message,
				{ commandId: lease.commandId },
				{ outcome: "outcome_unknown", cause: error },
			);
		}
		if (isCurrent(active)) {
			currentLease = renewed;
			notify();
			await reconcileAfterUnsequencedResult(active);
		}
		return renewed;
	};

	const releaseLease = async (): Promise<BrowserCommandLease | null> => {
		const active = activeRun;
		if (active === null)
			throw transportFailure("socket_unavailable", "The Codex workbench has no active socket.");
		const existing = currentLease;
		if (existing === null) return null;
		captureLease(active);
		const value = await sendRequest(active, "releaseLease", {}, "lease", existing.commandId);
		let released: BrowserCommandLease | null;
		try {
			released = parseBrowserCommandLease(value);
		} catch (error) {
			incompatible(active, error);
			throw transportFailure(
				"incompatible_contract",
				messageOf(error, "The released lease is incompatible."),
				{
					commandId: existing.commandId,
				},
				{ outcome: "outcome_unknown", cause: error },
			);
		}
		if (released !== null && !sameLeaseTarget(released, existing)) {
			const error = new BrowserWorkbenchWireError(
				"The released workbench lease identity does not match the active lease.",
			);
			incompatible(active, error);
			throw transportFailure(
				"incompatible_contract",
				error.message,
				{ commandId: existing.commandId },
				{ outcome: "outcome_unknown", cause: error },
			);
		}
		if (isCurrent(active)) {
			currentLease = released;
			notify();
			await reconcileAfterUnsequencedResult(active);
		}
		return released;
	};

	const accountRead = async (): Promise<BrowserWorkbenchAccountReadResult> => {
		const active = activeRun;
		if (active === null || !accountReady(active))
			throw transportFailure("not_ready", "The workbench is not ready to read account state.");
		const value = await sendRequest(active, "accountRead", {}, "account");
		let result: BrowserWorkbenchAccountReadResult;
		try {
			result = parseBrowserAccountReadResult(value);
		} catch (error) {
			incompatible(active, error);
			throw transportFailure(
				"incompatible_contract",
				messageOf(error, "The account result is incompatible."),
				undefined,
				{
					outcome: "outcome_unknown",
					cause: error,
				},
			);
		}
		if (isCurrent(active)) await reconcileAfterUnsequencedResult(active);
		return result;
	};

	const captureCommandTarget = (): BrowserWorkbenchCommandTarget => {
		const active = activeRun;
		if (active === null)
			throw transportFailure("socket_unavailable", "The Codex workbench has no active socket.");
		return captureTarget(active);
	};

	const close = async (): Promise<void> => {
		const active = activeRun;
		if (active === null) {
			if (ownerState.kind === "connection" && ownerState.state !== "stopped")
				setState({
					kind: "connection",
					state: "stopped",
					connection: "stopped",
					snapshot: null,
					sequence: null,
					reason: "The Codex workbench connection was closed.",
				});
			return;
		}
		if (isCurrent(active) && socketOpen(active.socket))
			await sendRequest(active, "close", {}, "control").catch(() => undefined);
		if (activeRun !== active) {
			if (activeRun === null && ownerState.kind === "connection" && ownerState.state === "backoff")
				setState({
					kind: "connection",
					state: "stopped",
					connection: "stopped",
					snapshot: null,
					sequence: null,
					reason: "The Codex workbench connection was closed.",
				});
			return;
		}
		retire(active, "replaced", "The Codex workbench connection was closed.");
		currentLease = null;
		setState({
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "The Codex workbench connection was closed.",
		});
	};

	const dispose = async (): Promise<void> => {
		if (disposed) return;
		disposed = true;
		const active = activeRun;
		if (active !== null) retire(active, "replaced", "The Codex workbench transport was disposed.");
		activeRun = null;
		currentLease = null;
		setState({
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "The Codex workbench transport was disposed.",
		});
	};

	return Object.freeze({
		attach,
		detach,
		close,
		refresh,
		setMediaReady,
		claimLease,
		renewLease,
		releaseLease,
		accountRead,
		command,
		captureCommandTarget,
		snapshot: () => activeRun?.snapshot ?? null,
		sequence: () => activeRun?.sequence ?? null,
		lease: () => currentLease,
		state: () => ownerState,
		capabilities,
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		dispose,
	});
}

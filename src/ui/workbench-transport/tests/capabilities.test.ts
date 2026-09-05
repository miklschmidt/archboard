import { afterEach, expect, test } from "bun:test";

import {
	createBrowserWorkbenchTransport,
	type BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";
import {
	FakeSocket,
	attachWithSnapshot,
	createTransportTracker,
	deltaMessage,
	lease,
	queue,
	sequentially,
	snapshot,
	wire,
	snapshotMessage,
	type FakeSocketRequest,
	type WireRecord,
} from "@/ui/workbench-transport/tests/fake-socket";

const tracker = createTransportTracker();

afterEach(tracker.disposeAll);

const ALL_READINESS_STATES = [
	"stopped",
	"backoff",
	"initialized",
	"storage_mismatch",
	"login_capable",
	"signed_out",
	"login_pending",
	"account_ready",
	"thread_capable",
	"reconnecting",
	"incompatible_contract",
] as const;
const ACCOUNT_READY_STATES: ReadonlySet<string> = new Set([
	"login_capable",
	"signed_out",
	"login_pending",
	"account_ready",
	"thread_capable",
]);

/**
 * Every closed delta field with one value the shared contract refuses.
 * @returns The field and value pairs.
 */
function invalidDeltas(): readonly (readonly [string, unknown])[] {
	return [
		["readiness", { kind: "readiness", state: "unknown" }],
		["account", { kind: "account", state: "ready", accountType: "invalid" }],
		["login", { kind: "login", state: "idle", unexpected: true }],
		["threadLink", { ...snapshot().threadLink, unexpected: true }],
		[
			"timeline",
			{ kind: "timeline", threadId: wire.threadA, turns: [], nextCursor: null, unexpected: true },
		],
		["queue", { ...queue(), unexpected: true }],
		["settings", [{ kind: "settings" }]],
		["approvals", [{}]],
		["dynamicApprovals", [{}]],
		[
			"semantic",
			{
				kind: "semantic_delivery",
				threadId: wire.threadA,
				delivery: "delivered",
				capturedAtMs: 0,
				freshUntilMs: 0,
				reason: null,
				unexpected: true,
			},
		],
		[
			"coordinator",
			{
				kind: "coordinator",
				state: "unbound",
				threadId: wire.threadA,
				activeTurnId: null,
				configuredModel: null,
				configuredEffort: null,
				model: null,
				effort: null,
				serviceTier: null,
				reason: null,
			},
		],
		["voice", { ...snapshot().voice, unexpected: true }],
		["lease", { ...lease(), unexpected: true }],
		[
			"operation",
			{
				kind: "operation_outcome",
				operationId: "operation-a",
				outcome: "delivered",
				message: null,
				unexpected: true,
			},
		],
	];
}

/**
 * Attach a fresh transport, push one delta, and expect incompatibility.
 * @param entry The delta field and value.
 */
async function expectDeltaIncompatible(entry: readonly [string, unknown]): Promise<void> {
	const [field, value] = entry;
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot());
	socket.event(deltaMessage(2, { [field]: value }));
	expect(transport.state()).toMatchObject({
		kind: "connection",
		state: "incompatible_contract",
	});
}

test("rejects hostile nested snapshots and every closed delta projection", async () => {
	const hostileSnapshot = snapshot();
	if (hostileSnapshot.timeline !== null) {
		hostileSnapshot.timeline["unexpected"] = true;
	}
	const snapshotTransport = tracker.track(createBrowserWorkbenchTransport());
	const snapshotSocket = new FakeSocket();
	await attachWithSnapshot(snapshotTransport, snapshotSocket, snapshot());
	snapshotSocket.event({ kind: "snapshot", sequence: 2, snapshot: hostileSnapshot });
	expect(snapshotTransport.state()).toMatchObject({
		kind: "connection",
		state: "incompatible_contract",
	});
	await Promise.all(invalidDeltas().map(expectDeltaIncompatible));
});

/** A socket answerer whose snapshot is replaced by the test between refreshes. */
interface MutableSnapshotAnswerer {
	readonly socket: FakeSocket;
	readonly publish: (next: WireRecord) => void;
}

/**
 * A socket that answers subscribe with the current snapshot at sequence 1 and
 * every snapshot request with the current snapshot at the next sequence.
 * @param initial The first snapshot.
 * @returns The socket and the way to replace its snapshot.
 */
function mutableSnapshotSocket(initial: WireRecord): MutableSnapshotAnswerer {
	const socket = new FakeSocket();
	let sequence = 1;
	let current = initial;
	/**
	 * Answer one request.
	 * @param request The request.
	 * @param activeSocket The socket.
	 */
	function answer(request: FakeSocketRequest, activeSocket: FakeSocket): void {
		if (request["action"] === "subscribe") {
			activeSocket.reply(request, snapshotMessage(sequence, current));
		} else if (request["action"] === "snapshot") {
			sequence += 1;
			activeSocket.reply(request, snapshotMessage(sequence, current));
		}
	}
	/**
	 * Replace the snapshot the socket answers with.
	 * @param next The snapshot.
	 */
	function publish(next: WireRecord): void {
		current = next;
	}
	socket.onRequest = answer;
	return { socket, publish };
}

/**
 * Check the matrix for one readiness state.
 * @param transport The transport.
 * @param state The readiness state just published.
 */
function expectReadinessMatrix(
	transport: BrowserWorkbenchTransport,
	state: (typeof ALL_READINESS_STATES)[number],
): void {
	const capabilities = transport.capabilities();
	const accountReady = ACCOUNT_READY_STATES.has(state);
	const threadCapable = state === "thread_capable";
	expect(capabilities.connected).toBe(true);
	expect(capabilities.readiness).toBe(state);
	expect(capabilities.canReadAccount).toBe(accountReady);
	expect(capabilities.canClaimLease).toBe(accountReady);
	// A live lease is a gateway-side lifecycle, not a workbench command, so it
	// stays renewable and releasable in every readiness arm.
	expect(capabilities.canRenewLease).toBe(true);
	expect(capabilities.canReleaseLease).toBe(true);
	expect(capabilities.supportsCommand("accountLogout")).toBe(accountReady);
	expect(capabilities.supportsCommand("threadLinkCreate")).toBe(threadCapable);
	// Discovering the list is how a pane with no link finds one, so it needs
	// thread capability and nothing more.
	expect(capabilities.supportsCommand("threadLinkRefresh")).toBe(threadCapable);
	expect(capabilities.supportsCommand("start")).toBe(threadCapable);
	expect(capabilities.supportsCommand("queueAdd")).toBe(threadCapable);
	expect(capabilities.supportsCommand("approvalRespond")).toBe(false);
	expect(capabilities.supportsCommand("dynamicApprovalRespond")).toBe(false);
	expect(capabilities.canCommand).toBe(threadCapable);
	expect(capabilities.canThreadCommands).toBe(threadCapable);
	expect(capabilities.canRealtime).toBe(threadCapable);
}

/**
 * Check the matrix for a non-executable link.
 * @param transport The transport.
 */
function expectNonExecutableMatrix(transport: BrowserWorkbenchTransport): void {
	const capabilities = transport.capabilities();
	expect(capabilities.canCommand).toBe(false);
	expect(capabilities.supportsCommand("start")).toBe(false);
	expect(capabilities.supportsCommand("queueAdd")).toBe(false);
	expect(capabilities.supportsCommand("approvalRespond")).toBe(false);
	expect(capabilities.supportsCommand("dynamicApprovalRespond")).toBe(false);
	expect(capabilities.supportsCommand("threadLinkCreate")).toBe(true);
	expect(capabilities.supportsCommand("threadLinkRefresh")).toBe(true);
	expect(capabilities.supportsCommand("threadLinkAttach")).toBe(true);
	expect(capabilities.supportsCommand("threadLinkRelink")).toBe(true);
	expect(capabilities.canRenewLease).toBe(true);
	expect(capabilities.canReleaseLease).toBe(true);
}

test("keeps the readiness, link, lease, and command capability matrix explicit", async () => {
	const activeLease = lease();
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const { socket, publish } = mutableSnapshotSocket(snapshot({ lease: activeLease }));
	await transport.attach(socket);

	await sequentially(ALL_READINESS_STATES, async (state) => {
		publish(snapshot({ state, lease: activeLease }));
		await transport.refresh();
		expectReadinessMatrix(transport, state);
	});

	await sequentially(["inspect_only", "unbound"] as const, async (linkState) => {
		publish(snapshot({ state: "thread_capable", linkState, lease: activeLease }));
		await transport.refresh();
		expectNonExecutableMatrix(transport);
	});

	// A lease with no live socket is not a capability at all.
	await transport.detach(socket);
	expect(transport.capabilities()).toMatchObject({
		connected: false,
		canRenewLease: false,
		canReleaseLease: false,
		canClaimLease: false,
		canReadAccount: false,
		canCommand: false,
	});
});

test("marks a sequence gap stale, disables commands, and keeps the lease renewable", async () => {
	const transport = tracker.track(createBrowserWorkbenchTransport());
	const socket = new FakeSocket();
	await attachWithSnapshot(transport, socket, snapshot({ lease: lease() }));
	socket.onRequest = null;
	socket.event(deltaMessage(3, { queue: queue("queued") }));
	expect(transport.state()).toMatchObject({
		kind: "stream",
		state: "stale_snapshot",
		receivedSequence: 3,
	});
	const capabilities = transport.capabilities();
	expect(capabilities.supportsCommand("start")).toBe(false);
	expect(capabilities.canCommand).toBe(false);
	expect(capabilities.canReadAccount).toBe(false);
	// Deliberate: recovering from a stale stream is exactly when a person must be
	// able to keep or hand back the lease they already hold.
	expect(capabilities.canRenewLease).toBe(true);
	expect(capabilities.canReleaseLease).toBe(true);
});

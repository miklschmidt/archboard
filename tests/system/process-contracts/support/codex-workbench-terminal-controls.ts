import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extendFixture } from "./codex-workbench-lifecycle.ts";

/**
 * Adds deterministic cancellation, held-RPC, queue, and ownership controls.
 * @param root - Disposable fixture directory.
 * @returns Path to the extended fixture.
 */
export function extendTerminalFixture(root: string): string {
	const base = extendFixture(root);
	const source = readFileSync(base, "utf8");
	const support = String.raw`
type TerminalCause = "call_cancelled" | "caller_turn_interrupted";
type TerminalMismatch = "wrong_call" | "wrong_turn";
const heldAccountReads: WireFrame[] = [];
const terminalBatches = new Set<TerminalCause>();
const terminalizedBatches = new Set<TerminalCause>();
const terminalMismatches = new Set<string>();
const ownershipBatches = new Set<string>();
const queuedSubmissions: Record<string, unknown>[] = [];

const controlledDynamicItem = (id: string, tool: string, argumentsValue: Record<string, unknown>, status: "inProgress" | "completed" | "failed" = "inProgress") => ({
	type: "dynamicToolCall", id, namespace: "archboard_app", tool, arguments: argumentsValue,
	status, contentItems: status === "inProgress" ? null : [], success: status === "completed", durationMs: status === "inProgress" ? null : 1,
});

const makeTargetActive = (): void => {
	const target = threads.get("thread-3");
	if (target === undefined) return;
	target.status = { type: "active", activeFlags: [] };
	target.turns = [{ id: "controlled-target-turn", items: [], itemsView: "full", status: "inProgress", error: null, startedAt: Date.now(), completedAt: null, durationMs: null }];
};

const completeTarget = (): void => {
	const target = threads.get("thread-3");
	if (target === undefined) return;
	target.status = { type: "idle" };
	target.turns = [{ id: "controlled-target-turn", items: [], itemsView: "full", status: "completed", error: null, startedAt: Date.now(), completedAt: Date.now(), durationMs: 1 }];
};

const emitTerminalBatch = (cause: TerminalCause): void => {
	if (terminalBatches.has(cause) || workhorseThreadId === null) return;
	terminalBatches.add(cause);
	makeTargetActive();
	const mutationId = cause + "-dynamic";
	const waitId = cause + "-wait";
	const mutationArguments = { prompt: "Do not execute the " + cause + " effect." };
	const waitArguments = { threadIds: ["thread-3"], timeoutMs: 120000 };
	registerDynamicCall(mutationId, "create_thread", mutationArguments);
	registerDynamicCall(waitId, "wait_threads", waitArguments);
	request(mutationId, "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: mutationId, namespace: "archboard_app", tool: "create_thread", arguments: mutationArguments });
	request(waitId, "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: waitId, namespace: "archboard_app", tool: "wait_threads", arguments: waitArguments });
};

const terminalizeBatch = (cause: TerminalCause): void => {
	if (terminalizedBatches.has(cause) || workhorseThreadId === null) return;
	terminalizedBatches.add(cause);
	const mutationId = cause + "-dynamic";
	const waitId = cause + "-wait";
	if (cause === "call_cancelled") {
		for (const [id, tool, argumentsValue] of [
			[mutationId, "create_thread", { prompt: "Do not execute the call_cancelled effect." }],
			[waitId, "wait_threads", { threadIds: ["thread-3"], timeoutMs: 120000 }],
		] as const) notify("item/completed", { threadId: workhorseThreadId, turnId: "turn-1", item: controlledDynamicItem(id, tool, argumentsValue, "completed"), completedAtMs: Date.now() });
	} else {
		notify("turn/completed", { threadId: workhorseThreadId, turn: { id: "turn-1", items: [controlledDynamicItem(mutationId, "create_thread", { prompt: "Do not execute the caller_turn_interrupted effect." }, "failed"), controlledDynamicItem(waitId, "wait_threads", { threadIds: ["thread-3"], timeoutMs: 120000 }, "failed")], itemsView: "full", status: "interrupted", error: null, startedAt: Date.now(), completedAt: Date.now(), durationMs: 1 } });
	}
	record({ kind: "terminal_notification", cause });
};

const emitTerminalMismatch = (cause: TerminalCause, mismatch: TerminalMismatch): void => {
	const key = cause + ":" + mismatch;
	if (terminalMismatches.has(key) || workhorseThreadId === null) return;
	terminalMismatches.add(key);
	if (mismatch === "wrong_call") {
		notify("item/completed", { threadId: workhorseThreadId, turnId: "turn-1", item: controlledDynamicItem(cause + "-wrong-call", "create_thread", { prompt: "Wrong call must do nothing." }, "completed"), completedAtMs: Date.now() });
	} else {
		notify("turn/completed", { threadId: workhorseThreadId, turn: { id: "wrong-turn", items: [], itemsView: "full", status: "interrupted", error: null, startedAt: Date.now(), completedAt: Date.now(), durationMs: 1 } });
	}
	record({ kind: "terminal_mismatch", cause, mismatch });
};

const emitChildExitBatch = (): void => {
	if (ownershipBatches.has("child-exit") || workhorseThreadId === null) return;
	ownershipBatches.add("child-exit");
	makeTargetActive();
	const mutationArguments = { prompt: "This child must exit before the effect." };
	const waitArguments = { threadIds: ["thread-3"], timeoutMs: 120000 };
	registerDynamicCall("child-exit-dynamic", "create_thread", mutationArguments);
	registerDynamicCall("child-exit-wait", "wait_threads", waitArguments);
	request("child-exit-ordinary", "item/fileChange/requestApproval", { threadId: workhorseThreadId, turnId: "turn-1", itemId: "child-exit-file", startedAtMs: Date.now(), reason: "child exit ordinary", grantRoot: process.cwd() });
	request("child-exit-dynamic", "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: "child-exit-dynamic", namespace: "archboard_app", tool: "create_thread", arguments: mutationArguments });
	request("child-exit-wait", "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: "child-exit-wait", namespace: "archboard_app", tool: "wait_threads", arguments: waitArguments });
};

const emitOwnershipBatch = (phase: string): void => {
	if (ownershipBatches.has(phase) || workhorseThreadId === null) return;
	ownershipBatches.add(phase);
	makeTargetActive();
	const mutationId = phase + "-dynamic";
	const waitId = phase + "-wait";
	const coordinatorId = phase + "-coordinator";
	const mutationArguments = { prompt: "Execute the " + phase + " ownership probe once." };
	const waitArguments = { threadIds: ["thread-3"], timeoutMs: 120000 };
	registerDynamicCall(mutationId, "create_thread", mutationArguments);
	registerDynamicCall(waitId, "wait_threads", waitArguments);
	request(phase + "-ordinary", "item/fileChange/requestApproval", { threadId: workhorseThreadId, turnId: "turn-1", itemId: phase + "-file", startedAtMs: Date.now(), reason: phase + " ordinary", grantRoot: process.cwd() });
	request(mutationId, "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: mutationId, namespace: "archboard_app", tool: "create_thread", arguments: mutationArguments });
	request(waitId, "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: waitId, namespace: "archboard_app", tool: "wait_threads", arguments: waitArguments });
	const coordinator = threads.get("thread-1");
	if (coordinator !== undefined) {
		coordinator.status = { type: "active", activeFlags: [] };
		coordinator.turns = [{ id: phase + "-coordinator-turn", items: [{ ...controlledDynamicItem(coordinatorId, "inspect_workhorse", {}), namespace: "archboard_workhorse" }], itemsView: "full", status: "inProgress", error: null, startedAt: Date.now(), completedAt: null, durationMs: null }];
		request(coordinatorId, "item/tool/call", { threadId: "thread-1", turnId: phase + "-coordinator-turn", callId: coordinatorId, namespace: "archboard_workhorse", tool: "inspect_workhorse", arguments: {} });
	}
};

const releaseHeldAccountRead = (): void => {
	for (const frame of heldAccountReads.splice(0)) {
		record({ kind: "held_client_rpc", state: "released", method: "account/read", id: String(frame.id) });
		respond(frame as never, { account: { type: "chatgpt", email: null, planType: "pro" }, requiresOpenaiAuth: true });
	}
};

const emitBoundedTime = (): void => {
	if (workhorseThreadId !== null) request("bounded-session-time", "currentTime/read", { threadId: workhorseThreadId });
};
`;
	const withSupport = source.replace(
		"const handle = (frame: WireFrame): void => {",
		`${support}\nconst handle = (frame: WireFrame): void => {`,
	);
	const withHeldAccountRead = withSupport.replace(
		'\t\tcase "account/read":\n\t\t\trespond(frame as never, {',
		String.raw`		case "account/read":
			if ((JSON.parse(readFileSync(controlPath, "utf8")) as { holdClientRpc?: unknown }).holdClientRpc === true) {
				heldAccountReads.push(frame);
				record({ kind: "held_client_rpc", state: "pending", method: "account/read", id: String(frame.id) });
				return;
			}
			respond(frame as never, {`,
	);
	const withQueue = withHeldAccountRead.replace(
		'\t\tcase "thread/start": {',
		String.raw`		case "thread/queue/list":
			respond(frame as never, { data: queuedSubmissions, nextCursor: null });
			return;
		case "thread/queue/add": {
			const queuedSubmission = { id: "queued-" + String(queuedSubmissions.length + 1), input: params.input, clientUserMessageId: params.clientUserMessageId };
			queuedSubmissions.push(queuedSubmission);
			record({ kind: "queue_effect", operation: "add", submissionId: queuedSubmission.id });
			respond(frame as never, { queuedSubmission });
			return;
		}
		case "thread/start": {`,
	);
	const withControls = withQueue.replace(
		"\t\tif (control.exit === true) {",
		'if ((control as { emit?: unknown }).emit === "call_cancelled") emitTerminalBatch("call_cancelled");\n\t\tif ((control as { emit?: unknown }).emit === "caller_turn_interrupted") emitTerminalBatch("caller_turn_interrupted");\n\t\tif ((control as { terminalCause?: unknown }).terminalCause === "call_cancelled" && (control as { terminalMismatch?: unknown }).terminalMismatch === "wrong_call") emitTerminalMismatch("call_cancelled", "wrong_call");\n\t\tif ((control as { terminalCause?: unknown }).terminalCause === "call_cancelled" && (control as { terminalMismatch?: unknown }).terminalMismatch === "wrong_turn") emitTerminalMismatch("call_cancelled", "wrong_turn");\n\t\tif ((control as { terminalCause?: unknown }).terminalCause === "caller_turn_interrupted" && (control as { terminalMismatch?: unknown }).terminalMismatch === "wrong_call") emitTerminalMismatch("caller_turn_interrupted", "wrong_call");\n\t\tif ((control as { terminalCause?: unknown }).terminalCause === "caller_turn_interrupted" && (control as { terminalMismatch?: unknown }).terminalMismatch === "wrong_turn") emitTerminalMismatch("caller_turn_interrupted", "wrong_turn");\n\t\tif ((control as { terminal?: unknown }).terminal === "call_cancelled") terminalizeBatch("call_cancelled");\n\t\tif ((control as { terminal?: unknown }).terminal === "caller_turn_interrupted") terminalizeBatch("caller_turn_interrupted");\n\t\tif ((control as { emit?: unknown }).emit === "child_exit") emitChildExitBatch();\n\t\tif ((control as { emit?: unknown }).emit === "ownership_before") emitOwnershipBatch("ownership-before");\n\t\tif ((control as { emit?: unknown }).emit === "ownership_after") emitOwnershipBatch("ownership-after");\n\t\tif ((control as { emit?: unknown }).emit === "complete_target") completeTarget();\n\t\tif ((control as { emit?: unknown }).emit === "release_client_rpc") releaseHeldAccountRead();\n\t\tif ((control as { emit?: unknown }).emit === "bounded_time") emitBoundedTime();\n\t\tif (control.exit === true) {',
	);
	const withCoordinatorRetirement = withControls.replace(
		'if (frame.id === "coordinator-inspect") {',
		'if (frame.id === "coordinator-inspect" || String(frame.id).endsWith("-coordinator")) {',
	);
	if (
		withSupport === source ||
		withHeldAccountRead === withSupport ||
		withQueue === withHeldAccountRead ||
		withControls === withQueue ||
		withCoordinatorRetirement === withControls
	) {
		throw new Error("The controlled terminal fixture injection point drifted.");
	}
	const fixturePath = path.join(root, "fake-codex-terminal-controls.ts");
	writeFileSync(fixturePath, withCoordinatorRetirement);
	chmodSync(fixturePath, 0o700);
	return fixturePath;
}

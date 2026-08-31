import { describe, expect, test } from "bun:test";

import { parseDynamicToolCallResponse } from "../../codex-thread-tools/index.js";
import { CodexSessionMutationError } from "../../codex-session/index.js";
import { createCodexDynamicTools } from "../index.js";
import {
	CHECKOUT_ROOT,
	FakeApproval,
	dynamicDecision,
	optionsFor,
	requestFor,
	setupAuthorities,
	thread,
	threadForkResult,
	threadStartResult,
	turn,
	turnResult,
} from "./support.js";

function record(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("fixture expected an object");
	return Object.fromEntries(Object.entries(value));
}

describe("codex dynamic dispatcher terminal boundaries", () => {
	test("honors the approval port's terminal timestamp without a second clock race", async () => {
		const { authorities, caller } = setupAuthorities();
		const approval = new FakeApproval((request) =>
			dynamicDecision(request, { outcome: "approved", cause: "person_approved" }, 50_000),
		);
		const createdThread = thread(authorities, "clocked-thread");
		const fixture = optionsFor(authorities, caller, { approval });
		fixture.session.threadStartResult = threadStartResult(createdThread);
		fixture.session.turnStartResult = turnResult(turn(authorities, "clocked-turn"));
		const clock = [100, 50_001];
		const options = { ...fixture.options, now: () => clock.shift() ?? 50_001 };
		const response = await createCodexDynamicTools(options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "clocked" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);

		expect(parsed.envelope.tag).toBe("ok");
		expect(fixture.session.calls.map(({ method }) => method)).toEqual([
			"thread/start",
			"turn/start",
		]);
		expect(approval.settled[0]?.decision).toMatchObject({
			outcome: "approved",
			decidedAtMs: 50_000,
		});
	});

	test("turns an approval at the exact deadline into an expired no-effect result", async () => {
		const { authorities, caller } = setupAuthorities();
		const approval = new FakeApproval((request) =>
			dynamicDecision(
				request,
				{ outcome: "approved", cause: "person_approved" },
				request.expiresAtMs,
			),
		);
		const fixture = optionsFor(authorities, caller, { approval });
		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "too late" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);

		expect(parsed.envelope).toMatchObject({ tag: "refused", reason: "expired" });
		expect(approval.settled[0]?.decision).toMatchObject({
			outcome: "expired",
			cause: "deadline_reached",
		});
		expect(fixture.session.calls).toHaveLength(0);
		expect(fixture.epoch.stages).toHaveLength(0);
	});

	test("browser disconnect returns terminal approval_required and leaves no effect", async () => {
		const { authorities, caller } = setupAuthorities();
		const approval = new FakeApproval(() => {
			throw new Error("browser disconnected");
		});
		const fixture = optionsFor(authorities, caller, { approval });
		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "disconnect" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);

		expect(parsed.envelope.tag).toBe("approval_required");
		expect(approval.settled[0]?.decision).toMatchObject({
			outcome: "disconnected",
			cause: "browser_disconnected",
		});
		expect(fixture.session.calls).toHaveLength(0);
		expect(fixture.epoch.stages).toHaveLength(0);
	});

	test("host shutdown is terminal approval_required while approval is pending", async () => {
		const { authorities, caller } = setupAuthorities();
		const approval = new FakeApproval((request) =>
			dynamicDecision(request, { outcome: "cancelled", cause: "host_shutdown" }),
		);
		const fixture = optionsFor(authorities, caller, { approval });
		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "shutdown" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);

		expect(parsed.envelope.tag).toBe("approval_required");
		expect(approval.settled[0]?.decision).toMatchObject({
			outcome: "cancelled",
			cause: "host_shutdown",
		});
		expect(fixture.session.calls).toHaveLength(0);
		expect(fixture.epoch.stages).toHaveLength(0);
	});

	test("promptless fork confirms its thread and omits the initial-turn boundary", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		const forkedThread = thread(authorities, "promptless-fork");
		fixture.session.threadForkResult = threadForkResult(forkedThread);
		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "fork_thread", { threadId: otherTarget.wireThreadId }),
		);
		const parsed = parseDynamicToolCallResponse("fork_thread", response);
		if (parsed.envelope.tag !== "ok") throw new Error("promptless fork did not succeed");
		const value = record(parsed.envelope.value);

		expect(value).toMatchObject({
			threadId: String(forkedThread.id),
			state: "executable",
			initialTurn: { delivery: "not_requested", turnId: null, operationId: null, reason: null },
		});
		expect(fixture.session.calls.map(({ method }) => method)).toEqual(["thread/fork"]);
		expect(fixture.session.calls[0]?.params).toEqual({
			threadId: otherTarget.threadId,
			cwd: CHECKOUT_ROOT,
			runtimeWorkspaceRoots: [CHECKOUT_ROOT],
			developerInstructions: expect.any(String),
			ephemeral: false,
			threadSource: "archboard",
			excludeTurns: true,
		});
		expect(fixture.contextReads).toHaveLength(0);
		expect(fixture.epoch.settlements.map(({ outcome }) => outcome)).toEqual(["delivered"]);
	});

	test("rejects a boundary authority that does not honor self-fork semantics", async () => {
		const { authorities, caller, selfTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(selfTarget.wireThreadId, selfTarget);
		fixture.threadAuthority.boundary = authorities.identity.decoder.adoptTurnId("wrong-boundary");

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "fork_thread", {
				threadId: selfTarget.wireThreadId,
				beforeTurnId: "caller-supplied-boundary",
			}),
		);
		const parsed = parseDynamicToolCallResponse("fork_thread", response);

		expect(parsed.envelope).toMatchObject({ tag: "refused", reason: "invalid_call" });
		expect(fixture.approval.presented).toHaveLength(0);
		expect(fixture.session.calls).toHaveLength(0);
		expect(fixture.epoch.stages).toHaveLength(0);
	});

	test("rejects a pane authority that changes identity during post-approval revalidation", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const initialAuthority = await fixture.options.context.issueAndRevalidatePaneLinkAuthority({
			caller,
		});
		let calls = 0;
		const options = {
			...fixture.options,
			context: {
				...fixture.options.context,
				issueAndRevalidatePaneLinkAuthority: () => {
					calls += 1;
					return calls === 1 ? initialAuthority : { ...initialAuthority, paneId: "another-pane" };
				},
			},
		};

		const response = await createCodexDynamicTools(options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "pane changed" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);

		expect(parsed.envelope).toMatchObject({ tag: "refused", reason: "invalid_call" });
		expect(fixture.approval.presented).toHaveLength(1);
		expect(fixture.session.calls).toHaveLength(0);
		expect(fixture.epoch.stages).toHaveLength(0);
	});

	test("stale target revalidation refuses before staging or remote mutation", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		fixture.threadAuthority.revalidateTargetError = Object.assign(
			new Error("target child exited"),
			{ code: "stale_child" },
		);
		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "send_message_to_thread", {
				threadId: otherTarget.wireThreadId,
				prompt: "stale target",
			}),
		);
		const parsed = parseDynamicToolCallResponse("send_message_to_thread", response);

		expect(parsed.envelope).toMatchObject({ tag: "refused", reason: "stale_child" });
		expect(fixture.session.calls).toHaveLength(0);
		expect(fixture.epoch.stages).toHaveLength(0);
	});

	test("malformed non-object input still gets one failed transport boundary", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const tools = createCodexDynamicTools(fixture.options);
		const response = await tools.dispatch(null as never);
		const text = response.contentItems[0]?.text;

		expect(response.success).toBe(false);
		expect(typeof text).toBe("string");
		expect(text === undefined ? null : JSON.parse(text)).toMatchObject({
			tag: "refused",
			reason: "invalid_call",
		});
		expect(fixture.transportResponses).toHaveLength(1);
		expect(fixture.transportResponses[0]?.request).toBe(null);
	});

	test("does not turn a rejected initial turn into a second attempt", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const createdThread = thread(authorities, "one-attempt-thread");
		fixture.session.threadStartResult = threadForkResult(createdThread);
		fixture.session.turnStartResult = new CodexSessionMutationError(
			"turn/start",
			"not_delivered",
			"rejected once",
		);
		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "one attempt" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);

		expect(parsed.envelope).toMatchObject({
			tag: "ok",
			value: { threadId: String(createdThread.id), initialTurn: { delivery: "not_delivered" } },
		});
		expect(fixture.session.calls.map(({ method }) => method)).toEqual([
			"thread/start",
			"turn/start",
		]);
	});
});

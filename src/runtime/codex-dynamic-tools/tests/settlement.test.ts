import { describe, expect, test } from "bun:test";

import { CodexSessionMutationError } from "../../codex-session/index.js";
import { parseDynamicToolCallResponse } from "../../codex-thread-tools/index.js";
import { createCodexDynamicTools } from "../index.js";
import {
	optionsFor,
	requestFor,
	setupAuthorities,
	thread,
	threadForkResult,
	threadStartResult,
	turn,
	turnResult,
} from "./support.js";

describe("codex dynamic confirmed-effect settlement", () => {
	test("preserves a confirmed fork and skips its initial turn after local commit failure", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		const forked = thread(authorities, "settlement-fork");
		fixture.session.threadForkResult = threadForkResult(forked);
		fixture.epoch.commitError = new Error("fork commit failed");

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "fork_thread", {
				threadId: otherTarget.wireThreadId,
				prompt: "initial turn must not run",
			}),
		);
		const parsed = parseDynamicToolCallResponse("fork_thread", response);

		expect(parsed.envelope).toMatchObject({
			tag: "ok",
			value: {
				threadId: String(forked.id),
				initialTurn: { delivery: "not_delivered" },
			},
		});
		expect(fixture.session.calls.map(({ method }) => method)).toEqual(["thread/fork"]);
		expect(fixture.operationIds.consumed).toHaveLength(1);
		expect(fixture.operationIds.retired).toHaveLength(1);
	});

	test("returns delivered for a confirmed send when local commit fails", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		const sentTurn = turn(authorities, "settlement-send-turn");
		fixture.session.turnStartResult = turnResult(sentTurn);
		fixture.epoch.commitError = new Error("send commit failed");

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "send_message_to_thread", {
				threadId: otherTarget.wireThreadId,
				prompt: "send once",
			}),
		);
		const parsed = parseDynamicToolCallResponse("send_message_to_thread", response);

		expect(parsed.envelope).toMatchObject({
			tag: "ok",
			value: { threadId: otherTarget.wireThreadId, delivery: "delivered" },
		});
		expect(fixture.session.calls.map(({ method }) => method)).toEqual(["turn/start"]);
		expect(fixture.epoch.commitConfirmations).toHaveLength(1);
		const [confirmation] = fixture.epoch.commitConfirmations;
		expect(confirmation?.threadId).toBe(otherTarget.threadId);
		expect(confirmation?.turnId).toBe(sentTurn.id);
		expect(fixture.operationIds.consumed).toHaveLength(1);
		expect(fixture.operationIds.retired).toHaveLength(0);
	});

	test("preserves a confirmed initial TurnId when its local commit fails", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const created = thread(authorities, "settlement-created-thread");
		const initialTurn = turn(authorities, "settlement-initial-turn");
		fixture.session.threadStartResult = threadStartResult(created);
		fixture.session.turnStartResult = turnResult(initialTurn);
		fixture.epoch.commitError = new Error("initial commit failed");
		fixture.epoch.commitErrorAt = 2;

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "confirmed initial" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);

		expect(parsed.envelope).toMatchObject({
			tag: "ok",
			value: {
				threadId: String(created.id),
				initialTurn: { delivery: "delivered", turnId: String(initialTurn.id) },
			},
		});
		expect(fixture.epoch.settlements).toHaveLength(1);
		expect(fixture.operationIds.consumed).toHaveLength(2);
		expect(fixture.operationIds.retired).toHaveLength(0);
	});

	test("keeps a lost outer response outcome_unknown when local marking fails", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.session.threadStartResult = new CodexSessionMutationError(
			"thread/start",
			"outcome_unknown",
			"thread response was lost",
		);
		fixture.epoch.unknownError = new Error("unknown marker failed");

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "lost outer" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);

		expect(parsed.envelope).toMatchObject({ tag: "outcome_unknown" });
		expect(fixture.operationIds.consumed).toHaveLength(1);
		expect(fixture.operationIds.retired).toHaveLength(1);
	});

	test("keeps a lost initial response inside its confirmed outer result", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const created = thread(authorities, "unknown-initial-thread");
		fixture.session.threadStartResult = threadStartResult(created);
		fixture.session.turnStartResult = new CodexSessionMutationError(
			"turn/start",
			"outcome_unknown",
			"initial response was lost",
		);
		fixture.epoch.unknownError = new Error("initial unknown marker failed");

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "lost initial" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);

		expect(parsed.envelope).toMatchObject({
			tag: "ok",
			value: {
				threadId: String(created.id),
				state: "inspect_only",
				initialTurn: { delivery: "outcome_unknown" },
			},
		});
		expect(fixture.operationIds.consumed).toHaveLength(2);
		expect(fixture.operationIds.retired).toHaveLength(0);
	});

	test("retires a known not-delivered send when local rollback fails", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		fixture.session.turnStartResult = new CodexSessionMutationError(
			"turn/start",
			"not_delivered",
			"send was rejected",
		);
		fixture.epoch.rollbackError = new Error("rollback failed");

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "send_message_to_thread", {
				threadId: otherTarget.wireThreadId,
				prompt: "rejected send",
			}),
		);
		const parsed = parseDynamicToolCallResponse("send_message_to_thread", response);

		expect(parsed.envelope).toMatchObject({ tag: "refused", reason: "not_ready" });
		expect(fixture.operationIds.consumed).toHaveLength(0);
		expect(fixture.operationIds.retired).toHaveLength(1);
	});
});

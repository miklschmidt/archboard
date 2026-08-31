import { describe, expect, test } from "bun:test";

import { parseDynamicToolCallResponse } from "../../codex-thread-tools/index.js";
import { createCodexDynamicTools } from "../index.js";
import {
	commandExecutionItem,
	fileChangeItem,
	functionCallOutputItem,
	itemPage,
	mcpToolCallItem,
	optionsFor,
	requestFor,
	setupAuthorities,
	turn,
} from "./support.js";

function record(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("fixture expected an object");
	return Object.fromEntries(Object.entries(value));
}

function configureReadFixture(
	fixture: ReturnType<typeof optionsFor>,
	otherTarget: ReturnType<typeof setupAuthorities>["otherTarget"],
	returnedTurn: ReturnType<typeof turn>,
): void {
	fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
	fixture.session.threadListPages.set(null, {
		data: [otherTarget.linkClassification!.thread!],
		nextCursor: null,
		backwardsCursor: null,
	});
	fixture.session.loadedListPages.set(null, { data: [otherTarget.threadId], nextCursor: null });
	fixture.session.turnsPages.set(null, {
		data: [returnedTurn],
		nextCursor: null,
		backwardsCursor: null,
	});
}

describe("codex dynamic read projection", () => {
	test("projects ordered textual command, file, and tool outputs into the summary", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const returnedTurn = turn(authorities, "output-turn");
		configureReadFixture(fixture, otherTarget, returnedTurn);
		fixture.session.itemPages.set(
			String(returnedTurn.id),
			itemPage(returnedTurn.id, [
				commandExecutionItem(authorities, "command-output", "command output"),
				fileChangeItem(authorities, "file-output", "@@ file output"),
				functionCallOutputItem(authorities, "function-output", "function output"),
				mcpToolCallItem(authorities, "mcp-output", "mcp output"),
			]),
		);

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "read_thread", {
				threadId: otherTarget.wireThreadId,
				includeOutputs: true,
			}),
		);
		const parsed = parseDynamicToolCallResponse("read_thread", response);
		if (parsed.envelope.tag !== "ok") throw new Error("output fixture did not succeed");
		const value = record(parsed.envelope.value);
		if (!Array.isArray(value.turns) || value.turns.length !== 1)
			throw new Error("output fixture returned an unexpected turn list");
		const turnValue = record(value.turns[0]);
		const summary = turnValue.summary;
		if (typeof summary !== "string") throw new Error("output fixture returned no summary");

		expect(summary).toContain("commandExecution: command output");
		expect(summary).toContain("fileChange: @@ file output");
		expect(summary).toContain("functionCallOutput: function output");
		expect(summary).toContain("mcpToolCall: mcp output");
		expect(summary.indexOf("commandExecution:")).toBeLessThan(summary.indexOf("fileChange:"));
		expect(summary.indexOf("fileChange:")).toBeLessThan(summary.indexOf("functionCallOutput:"));
		expect(summary.indexOf("functionCallOutput:")).toBeLessThan(summary.indexOf("mcpToolCall:"));
		expect(turnValue.outputsIncluded).toBe(true);
		expect(turnValue.outputsTruncated).toBe(false);
	});

	test("rejects an item page that carries a different turn identity", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const returnedTurn = turn(authorities, "wrong-turn-requested");
		const wrongTurn = turn(authorities, "wrong-turn-supplied");
		configureReadFixture(fixture, otherTarget, returnedTurn);
		fixture.session.itemPages.set(
			String(returnedTurn.id),
			itemPage(wrongTurn.id, [commandExecutionItem(authorities, "wrong-turn-output", "secret")]),
		);

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "read_thread", {
				threadId: otherTarget.wireThreadId,
				includeOutputs: true,
			}),
		);
		const parsed = parseDynamicToolCallResponse("read_thread", response);

		expect(response.success).toBe(true);
		expect(parsed.envelope).toMatchObject({ tag: "refused", reason: "system_error" });
	});

	test("marks per-text, aggregate, and page truncation while bounding the summary", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const returnedTurn = turn(authorities, "truncated-output-turn");
		configureReadFixture(fixture, otherTarget, returnedTurn);
		fixture.session.itemPages.set(
			String(returnedTurn.id),
			itemPage(
				returnedTurn.id,
				Array.from({ length: 8 }, (_, index) =>
					commandExecutionItem(authorities, `long-output-${index}`, "λ".repeat(300)),
				),
				"more-items",
			),
		);

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "read_thread", {
				threadId: otherTarget.wireThreadId,
				includeOutputs: true,
			}),
		);
		const parsed = parseDynamicToolCallResponse("read_thread", response);
		if (parsed.envelope.tag !== "ok") throw new Error("truncation fixture did not succeed");
		const value = record(parsed.envelope.value);
		if (!Array.isArray(value.turns) || value.turns.length !== 1)
			throw new Error("truncation fixture returned an unexpected turn list");
		const turnValue = record(value.turns[0]);
		const summary = turnValue.summary;
		if (typeof summary !== "string") throw new Error("truncation fixture returned no summary");

		expect(Buffer.byteLength(summary, "utf8")).toBeLessThanOrEqual(512);
		expect(summary).toContain("…");
		expect(turnValue.outputsTruncated).toBe(true);
	});
});

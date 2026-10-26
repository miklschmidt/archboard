import { expect, test } from "bun:test";

import type { SessionThreadItem } from "@archboard/codex-app-server/session";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "@archboard/codex-app-server/identity";
import { createServerTimelineOwner } from "#server/projections/timeline/timeline.ts";
import {
	dynamicToolCallItem,
	executableLink,
	flush,
	reasoningItem,
	turnFixture,
} from "#tests/server/support/timeline/timeline-fixture.ts";

/**
 * The items one turn of the given source items is shown to the browser as.
 * @param authorities The identity authorities the items were made with.
 * @param items The turn's source items.
 * @returns The projected items.
 */
async function projectedItems(
	authorities: IdentityAuthorities,
	items: readonly SessionThreadItem[],
) {
	const decoder = authorities.identity.decoder;
	const turn = turnFixture(authorities, "items-turn", items);
	const owner = createServerTimelineOwner({
		session: {
			threadTurnsListPage: async () => ({ data: [turn], nextCursor: null, backwardsCursor: null }),
			timelineListPage: async () => ({
				data: [],
				nextCursor: null,
				activeRealtimeSessionAtPageStart: null,
			}),
		},
		identity: decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => undefined,
	});
	const link = executableLink(authorities, decoder.adoptThreadId("items-thread"));
	const connection = {};
	owner.read("chat-items", 1, link, true, connection);
	await flush();
	const projected = owner.read("chat-items", 1, link, true, connection)?.turns[0]?.items ?? [];
	owner.dispose();
	return projected;
}

test("a tool call's arguments reach the browser with every secret-named value redacted", async () => {
	const authorities = createIdentityAuthorities();
	const [tool] = await projectedItems(authorities, [
		dynamicToolCallItem(authorities, "secret-tool", {
			type: "dynamicToolCall",
			namespace: null,
			tool: "deploy",
			arguments: {
				target: "staging",
				apiKey: "sk-live-1",
				auth: { user: "ops", password: "hunter2", tokens: [{ refreshToken: "r-1", scope: "all" }] },
			},
			status: "completed",
			contentItems: null,
			success: true,
			durationMs: 5,
		}),
	]);
	if (tool?.kind !== "tool_call" || tool.arguments === null) {
		throw new Error("the tool call was not projected with its arguments");
	}
	const shown: unknown = JSON.parse(tool.arguments);
	expect(shown).toEqual({
		target: "staging",
		apiKey: "[redacted]",
		auth: {
			user: "ops",
			password: "[redacted]",
			tokens: [{ refreshToken: "[redacted]", scope: "all" }],
		},
	});
});

test("a reasoning summary keeps its line breaks, each part on its own line", async () => {
	const authorities = createIdentityAuthorities();
	const [reasoning] = await projectedItems(authorities, [
		reasoningItem(authorities, "layout-reasoning", {
			type: "reasoning",
			summary: [
				"**Reading the renderer**\n\nIt lays out:\n- nodes\n- edges",
				"**Next**\n\n\n\nEdges.",
			],
			content: [],
		}),
	]);
	if (reasoning?.kind !== "reasoning_summary") {
		throw new Error("the reasoning item was not projected");
	}
	expect(reasoning.text).toBe(
		"**Reading the renderer**\n\nIt lays out:\n- nodes\n- edges\n**Next**\n\nEdges.",
	);
});

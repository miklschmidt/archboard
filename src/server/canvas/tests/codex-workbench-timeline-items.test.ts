import { expect, test } from "bun:test";

import type { SessionThreadItem } from "../../../runtime/codex-session/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import { createCanvasTimelineOwner } from "../codex-workbench-adapters.js";
import {
	dynamicToolCallItem,
	executableLink,
	flush,
	turnFixture,
} from "./support/codex-workbench-timeline-fixture.js";

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
	const owner = createCanvasTimelineOwner({
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
	owner.read("pane-items", 1, link, true, connection);
	await flush();
	const projected = owner.read("pane-items", 1, link, true, connection)?.turns[0]?.items ?? [];
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

import { ARCHBOARD_CONTEXT_CODEC } from "#runtime/services/host/archboard.ts";
import { expect, test } from "bun:test";

import { ArchboardContextSchema } from "#runtime/rules/instructions/context.ts";

test("the Archboard context codec names the archboard trigger and encodes the context it was given", () => {
	const context = ArchboardContextSchema.parse({
		schema: 1,
		paneId: "pane-exact",
		board: { name: "Board", key: "board", version: 7, cursor: "feed:3" },
		threadLink: { state: "executable", reason: null },
		child: { id: "child-1", epoch: "epoch-1" },
		workhorse: { threadId: "thread-1", turnId: null },
		coordinator: { threadId: null, realtimeSessionId: null },
		semantic: {
			brief: "selected service",
			capturedAtMs: 10,
			freshUntilMs: 20,
			truncated: false,
		},
		focus: { paneId: "pane-exact", capturedAtMs: 10 },
		variant: null,
		view: null,
		selection: {
			count: 1,
			subjects: [{ kind: "node", id: "node-1", name: "Gateway" }],
			capturedAtMs: 10,
		},
		reconciliation: { required: false, count: 0, blockedBy: null, issues: [] },
		claim: { holder: "human", doing: "steering current work" },
		ambiguity: [],
		operation: { id: null, kind: null, rpc: null, outcome: null },
	});

	expect(ARCHBOARD_CONTEXT_CODEC.key).toBe("archboard");
	expect(ARCHBOARD_CONTEXT_CODEC.turnTrigger).toBe("archboard");
	expect(JSON.parse(ARCHBOARD_CONTEXT_CODEC.encode(context))).toMatchObject({
		paneId: "pane-exact",
		board: { key: "board" },
		claim: { doing: "steering current work" },
	});
});

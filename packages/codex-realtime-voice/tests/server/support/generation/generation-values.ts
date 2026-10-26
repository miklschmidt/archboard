import { TEST_CONTEXT_SCHEMA, testContextFixture } from "#tests/runtime/support/host.ts";

const CODEX_WORKBENCH_COMPONENT_ORDER = [
	"identity",
	"epoch",
	"transport",
	"session",
	"threadLink",
	"approvals",
	"dynamicTools",
	"sessions",
	"gateway",
] as const;

const generationContextFixture = TEST_CONTEXT_SCHEMA.parse({
	...testContextFixture,
	threadLink: { state: "unbound", reason: null },
	child: { id: "fixture-child", epoch: "fixture-epoch" },
	workhorse: { threadId: null, turnId: null },
	coordinator: { threadId: null, realtimeSessionId: null },
	brief: {
		text: "Generation fixture.",
		capturedAtMs: 1,
		freshUntilMs: 2,
	},
});

export { CODEX_WORKBENCH_COMPONENT_ORDER, generationContextFixture };

import type {
	CoordinatorCallbackHostPolicy,
	CoordinatorCallback,
	CoordinatorHostContextCallback,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";
import { createWorkbenchThreadProfile } from "#runtime/rules/host/instructions.ts";
import { WorkbenchExecutionContextSchema } from "#runtime/rules/host/context.ts";
import type {
	WorkbenchContextCodec,
	WorkbenchExecutionContext,
} from "#runtime/protocol/host/context.ts";
import type { WorkbenchInstructions } from "#runtime/protocol/host/instructions.ts";
import type {
	WorkbenchVoicePolicy,
	WorkbenchVoiceInput,
} from "#runtime/protocol/host/context-source.ts";

const TEST_CONTEXT_CODEC: WorkbenchContextCodec = Object.freeze({
	key: "test_host",
	turnTrigger: "test_host",
	encode: (context: WorkbenchExecutionContext) => JSON.stringify(context),
});
const TEST_INSTRUCTIONS: WorkbenchInstructions = Object.freeze({
	coordinator: createWorkbenchThreadProfile({
		serviceName: "test-host",
		threadSource: "test-host",
		role: "coordinator",
		domainInstructions: "Coordinate the requested task.\n",
		dynamicTools: [],
	}),
	workhorse: createWorkbenchThreadProfile({
		serviceName: "test-host",
		threadSource: "test-host",
		role: "workhorse",
		domainInstructions: "Complete the requested task.\n",
		dynamicTools: [],
	}),
});
function createTestVoicePolicy(
	subscribe?: (listener: (input: WorkbenchVoiceInput) => void) => () => void,
): WorkbenchVoicePolicy {
	return Object.freeze({
		start: () => ({
			prompt: "Speak clearly about the requested task.",
			suppressCoordinatorSpeech: false,
			delegationAckFiller: true,
		}),
		...(subscribe === undefined
			? {}
			: {
					subscribe: (_presentation: unknown, listener: (input: WorkbenchVoiceInput) => void) =>
						subscribe(listener),
				}),
	});
}
const TEST_CONTEXT_SCHEMA = WorkbenchExecutionContextSchema;
const testContextFixture = {
	paneId: "surface-1",
	threadLink: { state: "executable", reason: null },
	child: { id: "child-1", epoch: "epoch-1" },
	workhorse: { threadId: "thread-workhorse", turnId: "turn-1" },
	coordinator: { threadId: "thread-coordinator", realtimeSessionId: null },
	semantic: {
		brief: "The selected task uses the local worker.",
		capturedAtMs: 100,
		freshUntilMs: 30100,
		truncated: false,
	},
	operation: { id: null, kind: null, rpc: null, outcome: null },
} as const;
export {
	TEST_CONTEXT_CODEC,
	TEST_INSTRUCTIONS,
	TEST_CONTEXT_SCHEMA,
	testContextFixture,
	createTestVoicePolicy,
};

const TEST_CALLBACK_POLICY: CoordinatorCallbackHostPolicy = Object.freeze({
	subscribe: () => () => {},
	encode: (callback: CoordinatorCallback) => JSON.stringify(callback),
	delivery: (callback: CoordinatorHostContextCallback) => ({
		channel: "context" as const,
		text: callback.context.brief,
		reason: null,
		coordinatorContext: false,
	}),
});
export { TEST_CALLBACK_POLICY };

import type { DynamicWaitOwner } from "#runtime/protocol/dynamic-tools/lifecycle-contract.ts";
import type { CodexWaitGraph } from "@archboard/codex-realtime-voice/runtime";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "#runtime/protocol/thread-tools/manifest.ts";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { createServerDynamicLifecycleOwner } from "#server/services/generation/operation-lifecycle.ts";

/** One current child plus one foreign child, with their wire spellings. */
function identities() {
	const identity = createIdentityAuthorities();
	const foreign = createIdentityAuthorities();
	const thread = identity.identity.decoder.adoptThreadId("thread-current");
	const turn = identity.identity.decoder.adoptTurnId("turn-current");
	const call = identity.identity.decoder.adoptDynamicToolCallId("call-current");
	return {
		identity,
		foreign,
		thread,
		turn,
		call,
		wire: {
			thread: identity.identity.decoder.serializeCodexIdentity(thread),
			turn: identity.identity.decoder.serializeCodexIdentity(turn),
			call: identity.identity.decoder.serializeCodexIdentity(call),
		},
	};
}

type TerminalIdentities = ReturnType<typeof identities>;

function waitOwnerFor(h: TerminalIdentities, target: string): DynamicWaitOwner {
	return {
		child: h.identity.identity.validator.childId,
		epoch: h.identity.identity.validator.epoch,
		caller: h.thread,
		turn: h.turn,
		call: h.call,
		namespace: "archboard_app",
		tool: "wait_threads",
		manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
		sortedTargetThreadIds: [h.identity.identity.decoder.adoptThreadId(target)],
		operationId: null,
	};
}

/** One lifecycle owner whose server wait never settles, with its observed counters. */
function waitProbe(h: TerminalIdentities, graph: CodexWaitGraph) {
	const counters = { serverCalls: 0, aborts: 0 };
	const owner = createServerDynamicLifecycleOwner({
		identity: h.identity,
		waitGraph: graph,
		waitForTargets: ({ signal }) => {
			counters.serverCalls += 1;
			signal.addEventListener("abort", () => (counters.aborts += 1), { once: true });
			return new Promise(() => undefined);
		},
		shutdownEpoch: async () => ({}) as never,
		onFatal: () => undefined,
	});
	return { owner, counters };
}

export { identities, type TerminalIdentities, waitOwnerFor, waitProbe };

import { expect, test } from "bun:test";
import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "@archboard/codex-app-server/identity";
import { createWorkbenchThreadProfile } from "#runtime/rules/host/instructions.ts";
import { createVoiceToolset } from "#runtime/rules/host/toolset.ts";
import { createSpokenApprovalClassifierPrompt } from "#runtime/rules/spoken-approval/classifier.ts";
import { createCoordinatorThreadStartParams } from "#runtime/services/coordinator/model.ts";
import { createWorkhorseThreadStartParams } from "#runtime/rules/workhorse-start/model.ts";
import { createRealtimeStartParams } from "#runtime/rules/realtime/start-policy.ts";

// The package is public: a host that names nothing must not hand Codex, or store, the name of the
// host it was first built for (TASK-530.04).
test("a host that supplies no identity gives Codex and its records no Archboard name", () => {
	const profile = (role: "coordinator" | "workhorse") =>
		createWorkbenchThreadProfile({
			identity: {},
			role,
			domainInstructions: "Do the requested task.\n",
			dynamicTools: [],
		});
	const coordinator = profile("coordinator");
	const workhorse = profile("workhorse");
	const toolset = createVoiceToolset(coordinator.identity);
	const { identity, operation } = createIdentityAuthorities(
		createIdentityLedger(coordinator.identity.recordPrefix),
	);
	const records = {
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		operation: operation.issuer.mintOperationId(),
		thread: identity.decoder.adoptThreadId("thread-1"),
		request: identity.issuer.mintJsonRpcRequestId(),
	};
	const sentToCodex = {
		toolset,
		coordinator,
		workhorse,
		coordinatorStart: createCoordinatorThreadStartParams("/coordinator", null, coordinator),
		workhorseStart: createWorkhorseThreadStartParams("/checkout", workhorse),
		realtimeStarts: [false, true].map((suppressCoordinatorSpeech) =>
			createRealtimeStartParams({
				threadId: records.thread,
				realtimeSessionId: identity.issuer.mintRealtimeSessionId(),
				sdp: "v=0",
				voice: { prompt: "Speak briefly.", suppressCoordinatorSpeech, delegationAckFiller: true },
			}),
		),
		classifier: createSpokenApprovalClassifierPrompt({
			productName: coordinator.identity.productName,
			voiceNamespace: coordinator.identity.toolNamespaces.voice,
			effectSummary: "Run the tests.",
			finalUserItemId: "item-1",
			finalUserSequence: 1,
			finalUserText: "Yes.",
		}),
	};

	expect(JSON.stringify({ records, sentToCodex })).not.toMatch(/archboard/iu);
});

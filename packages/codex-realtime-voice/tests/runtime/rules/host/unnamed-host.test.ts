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
import { createWorkbenchTurnStartParams } from "#runtime/rules/host/bodies.ts";
import { createDefaultWorkbenchHost } from "#server/services/host/default.ts";
import { createHarness } from "#tests/runtime/services/thread-context/delivery-support.ts";

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

// A host with no domain of its own announces a change and starts a turn under the default codec:
// what Codex reads names the change and the execution, never the words of the host
// the package was first built for (TASK-530.05).
test("a host with no identity and no extensions sends Codex no context in the words of the host the package was first built for", async () => {
	const profile = (role: "coordinator" | "workhorse") =>
		createWorkbenchThreadProfile({
			identity: {},
			role,
			domainInstructions: "Do the requested task.\n",
			dynamicTools: [],
		});
	const host = createDefaultWorkbenchHost(
		{
			instructions: { coordinator: profile("coordinator"), workhorse: profile("workhorse") },
			allowedCheckouts: [],
		},
		{
			shownCheckoutOf: () => "/checkout",
			shownConversationOf: () => null,
			onShownChange: () => () => {},
		},
	);
	const harness = createHarness({ contextCodec: host.contextCodec });
	const delivered = await harness.delivery.deliver(harness.events({ text: "The task changed." }));
	const inject = delivered.payload;
	if (delivered.outcome !== "delivered" || inject === null) {
		throw new Error("The announced change was not delivered.");
	}
	const announced = JSON.parse(inject.items[0]!.content[0]!.text) as Parameters<
		typeof createWorkbenchTurnStartParams
	>[0]["context"];
	const turnStart = createWorkbenchTurnStartParams(
		{
			threadId: "thread-1",
			clientUserMessageId: "message-1",
			prompt: "Do the requested task.",
			context: {
				...announced,
				operation: {
					id: "operation-1",
					kind: "send_message_to_thread",
					rpc: "turn/start",
					outcome: null,
				},
			},
		},
		host.contextCodec,
	);

	expect(JSON.stringify({ inject, turnStart })).not.toMatch(/pane|board|vault|semantic/iu);
});

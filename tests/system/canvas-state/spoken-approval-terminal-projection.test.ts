import { expect, test } from "bun:test";

import { createCodexApprovalBroker } from "../../../src/runtime/codex-approvals/index.js";
import type { SpokenApprovalSnapshot } from "../../../src/runtime/codex-spoken-approval/index.js";
import type { TransportServerRequest } from "../../../src/runtime/codex-transport/server-requests.js";
import { createCodexBrowserModel } from "../../../src/shared/codex-browser-model/index.js";
import {
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "../../../src/shared/codex-realtime-host/index.js";
import { createIdentityAuthorities } from "../../../src/shared/codex-workbench-identity/index.js";
import {
	projectCodexBrowserState,
	type BrowserProjectionInput,
} from "../../../src/server/codex-workbench/index.js";
import { projectVoiceSpokenApproval } from "../../../src/ui/voice-spoken-approval/index.js";
import { projectWorkbenchApprovals } from "../../../src/ui/workbench-approvals/index.js";

const NOW = 1_700_000_000_000;

test("a real unknown owner settlement remains unknown through the spoken UI", async () => {
	const authorities = createIdentityAuthorities();
	const identity = authorities.identity;
	const threadId = identity.decoder.adoptThreadId("spoken-terminal-workhorse");
	const coordinatorThreadId = identity.decoder.adoptThreadId("spoken-terminal-coordinator");
	const turnId = identity.decoder.adoptTurnId("spoken-terminal-turn");
	const itemId = identity.decoder.adoptItemId("spoken-terminal-item");
	const approvalId = identity.decoder.adoptApprovalId("spoken-terminal-approval");
	const requestId = identity.decoder.adoptJsonRpcRequestId("spoken-terminal-request");
	const request = {
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		requestId,
		correlation: identity.decoder.createWireRequestCorrelation({ requestId }),
		method: "item/commandExecution/requestApproval",
		owner: "codex-approvals",
		params: {
			threadId,
			turnId,
			itemId,
			kind: "command",
			startedAtMs: NOW,
			approvalId,
			environmentId: null,
			reason: "Run the focused spoken approval test",
			networkApprovalContext: null,
			command: "bun test src/ui/voice-spoken-approval/tests",
			cwd: "/repo",
			commandActions: null,
			additionalPermissions: null,
			proposedExecpolicyAmendment: null,
			proposedNetworkPolicyAmendments: null,
			availableDecisions: ["accept", "decline"],
		},
	} satisfies Extract<
		TransportServerRequest,
		{ readonly method: "item/commandExecution/requestApproval" }
	>;
	const broker = createCodexApprovalBroker({
		identity,
		listenerOwnership: "composition",
		now: () => NOW,
		transport: {
			respond: () => Promise.reject({ accepted: true, outcome: "outcome_unknown" }),
		},
	});
	try {
		broker.receive(request);
		const effect = broker.spokenEffectPresentation(requestId);
		const settlement = await broker.resolve({
			requestId,
			approvalId,
			response: { approvalKind: "command_execution", decision: "accept" },
		});
		const owner = broker.view(requestId);
		expect(owner.snapshot).toMatchObject({
			state: "outcome_unknown",
			outcome: "outcome_unknown",
		});
		expect(owner.spoken).toEqual({ eligible: false, reason: "not_pending" });

		const realtimeSessionId = parseRealtimeSessionId("spoken-terminal-session");
		const effectPromptItemId = parseRealtimeItemId("spoken-terminal-prompt");
		const finalUserItemId = parseRealtimeItemId("spoken-terminal-final-user");
		const spokenApproval: SpokenApprovalSnapshot = {
			state: "visual_fallback",
			requestId,
			approvalId,
			child: owner.snapshot.child,
			epoch: owner.snapshot.epoch,
			coordinatorThreadId,
			realtimeSessionId,
			realtimeCorrelationId: null,
			effectSummary: effect.effectSummary,
			effectFingerprint: effect.binding.effect,
			effectPromptItemId,
			effectPromptSequence: 10,
			finalUserItemId,
			finalUserSequence: 11,
			finalUserText: "Yes, run it",
			operationId: "spoken-terminal-operation",
			classifierTurnId: null,
			resolverCallId: null,
			expiresAtMs: NOW + 30_000,
			settlement,
			reason: "resolver_lost",
		};
		const projectionInput: BrowserProjectionInput = {
			readiness: { kind: "readiness", state: "thread_capable" },
			account: { kind: "account", state: "signed_out" },
			login: { kind: "login", state: "idle" },
			threadLink: {
				kind: "thread_link",
				state: "executable",
				childId: owner.snapshot.child,
				epoch: owner.snapshot.epoch,
				threadId,
				source: "appServer",
				status: "idle",
				loaded: true,
				canAcceptDirectInput: true,
				reason: null,
			},
			threadCandidates: { kind: "codex_thread_candidates", state: "unknown" },
			timeline: null,
			queue: { kind: "codex_queue", submissions: [] },
			settings: [],
			approvals: [owner],
			dynamicApprovals: [],
			semantic: { kind: "codex_semantic", outcome: null, freshness: null },
			coordinator: {
				kind: "codex_coordinator",
				state: "ready",
				threadId: coordinatorThreadId,
				configured: null,
				effective: null,
				reason: null,
			},
			voice: {
				kind: "codex_voice",
				mediaReady: false,
				generation: { browserSessionId: realtimeSessionId },
				coordinatorState: "ready",
				transcript: [],
			},
			spokenApproval,
			lease: null,
			operation: null,
		};
		const model = createCodexBrowserModel(authorities);
		const projected = projectCodexBrowserState(model, identity.decoder, projectionInput);
		expect(projected.tag).toBe("projected");
		if (projected.tag !== "projected") throw new Error(projected.message);
		expect(projected.snapshot.spokenApproval.state).toBe("outcome_unknown");

		const approvals = projectWorkbenchApprovals({
			state: {
				kind: "readiness",
				state: "thread_capable",
				connection: "connected",
				snapshot: projected.snapshot,
				sequence: 1,
			},
			nowMs: NOW,
			canCommand: true,
			canRespondOrdinary: true,
			canRespondDynamic: true,
		});
		const card = approvals.cards[0];
		expect(card?.status.phase).toBe("outcome_unknown");
		if (card?.kind !== "ordinary") throw new Error("Expected one ordinary approval card.");
		expect(card.request.lifecycle.state).toBe("outcome_unknown");
		expect(card.spoken).toMatchObject({ eligible: false, detail: expect.any(String) });
		const spokenView = projectVoiceSpokenApproval({
			card,
			spokenApproval: projected.snapshot.spokenApproval,
		});
		expect(spokenView.state).toBe("outcome_unknown");
		expect(spokenView.reason).toBe("resolver_lost");
		expect(spokenView.visualCardPreserved).toBe(true);
	} finally {
		broker.dispose();
	}
});

import { expect, test } from "bun:test";

import { createCodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import { EMPTY_SPOKEN_APPROVAL_SNAPSHOT } from "../../../runtime/codex-spoken-approval/index.js";
import type { ThreadLinkSnapshot } from "../../../runtime/codex-thread-link/index.js";
import {
	createCodexWorkbenchGateway,
	type BrowserActionResult,
	type BrowserGatewayMessage,
	type BrowserOwnerProjection,
	type BrowserWorkbenchActions,
} from "../../codex-workbench/index.js";
import { createCanvasOrdinaryApprovalActions } from "../codex-workbench-adapters.js";
import { composeCodexWorkbenchGeneration } from "../codex-workbench-generation.js";
import { createCodexWorkbenchGenerationFixture } from "./support/codex-workbench-generation-fixture.js";

async function delivered(): Promise<BrowserActionResult> {
	return { outcome: "delivered" };
}

test("composed child exit publishes one settled approval before closing presenters", async () => {
	const events: string[] = [];
	const fixture = createCodexWorkbenchGenerationFixture(events);
	const identity = fixture.components.identity;
	const paneId = "pane-child-exit";
	const threadId = identity.identity.decoder.adoptThreadId("thread-child-exit");
	const responses: unknown[] = [];
	const projectionListeners = new Set<() => void>();
	const approvals = createCodexApprovalBroker({
		identity: identity.identity,
		listenerOwnership: "composition",
		transport: {
			respond: async (_request, _owner, response) => void responses.push(response),
		},
		getCurrentBinding: () => ({ link: `pane:${paneId}` }),
		onChange: () => {
			for (const listener of projectionListeners) {
				listener();
			}
		},
	});
	const link: ThreadLinkSnapshot = {
		kind: "thread_link",
		state: "executable",
		childId: identity.identity.validator.childId,
		epoch: identity.identity.validator.epoch,
		threadId,
		source: "appServer",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
	const actions: BrowserWorkbenchActions = {
		account: { read: delivered, login: delivered, loginCancel: delivered, logout: delivered },
		threadLinks: { create: delivered, refresh: delivered, attach: delivered, relink: delivered },
		text: { start: delivered, steer: delivered, interrupt: delivered },
		queue: {
			add: delivered,
			update: delivered,
			delete: delivered,
			reorder: delivered,
			start: delivered,
		},
		realtime: { start: delivered, appendText: delivered, stop: delivered },
		ordinaryApprovals: createCanvasOrdinaryApprovalActions(approvals),
		dynamicApprovals: { resolve: delivered },
	};
	const projection = {
		read: ({ mediaReady }: { readonly mediaReady: boolean }): BrowserOwnerProjection => ({
			readiness: { kind: "readiness", state: "thread_capable" },
			threadCandidates: { kind: "codex_thread_candidates", state: "unknown" },
			account: {
				kind: "codex_account_response",
				response: {
					account: { type: "chatgpt", email: "fixture@example.test", planType: "plus" },
					requiresOpenaiAuth: true,
				},
			},
			login: { kind: "login", state: "idle" },
			timeline: null,
			queue: { kind: "codex_queue", submissions: [] },
			settings: [],
			approvals: approvals.inspectViews(),
			dynamicApprovals: [],
			semantic: { kind: "codex_semantic", outcome: null, freshness: null },
			coordinator: {
				kind: "codex_coordinator",
				state: "ready",
				threadId,
				configured: { model: "gpt-5.6-sol", effort: "xhigh" },
				effective: { model: "gpt-5.6-sol", effort: "xhigh", serviceTier: "priority" },
				reason: null,
			},
			voice: {
				kind: "codex_voice",
				mediaReady,
				generation: null,
				coordinatorState: "ready",
				transcript: [],
			},
			spokenApproval: EMPTY_SPOKEN_APPROVAL_SNAPSHOT,
		}),
		onChange: (listener: () => void) => {
			projectionListeners.add(listener);
			return () => projectionListeners.delete(listener);
		},
	};
	const gateway = createCodexWorkbenchGateway({
		identity,
		projection,
		threadLink: {
			read: () => ({
				paneId,
				revision: 1,
				link,
				cas: {
					revision: 1,
					paneId,
					childId: link.childId,
					epoch: link.epoch,
					threadId: link.threadId,
				},
			}),
		},
		actions,
	});
	fixture.replaceApprovals(approvals);
	fixture.replaceGateway(gateway);
	const generation = await composeCodexWorkbenchGeneration({
		identityLedger: fixture.identityLedger,
		factories: fixture.factories,
		hooks: fixture.hooks,
	});
	try {
		const connection = gateway.connect("browser-child-exit", paneId);
		const requestId = identity.identity.decoder.adoptJsonRpcRequestId("request-child-exit");
		const pending = approvals.receive({
			child: identity.identity.validator.childId,
			epoch: identity.identity.validator.epoch,
			requestId,
			correlation: identity.identity.decoder.createWireRequestCorrelation({ requestId }),
			method: "item/commandExecution/requestApproval",
			owner: "codex-approvals",
			params: {
				threadId,
				turnId: "turn-child-exit",
				itemId: "item-child-exit",
				kind: "command",
				startedAtMs: 10,
				approvalId: "approval-child-exit",
				environmentId: null,
				reason: "Child exit test",
				networkApprovalContext: null,
				command: "echo child-exit",
				cwd: "/workspace",
				commandActions: null,
				additionalPermissions: null,
				proposedExecpolicyAmendment: null,
				proposedNetworkPolicyAmendments: null,
				availableDecisions: ["accept", "decline"],
			},
		});
		connection.snapshot();
		connection.claimLease();
		const messages: BrowserGatewayMessage[] = [];
		connection.subscribe((message) => messages.push(message));

		await generation.retireChild({
			child: pending.child,
			epoch: pending.epoch,
			code: 1,
			signal: null,
		});

		expect(responses).toEqual([{ result: { decision: "cancel" } }]);
		expect(
			messages.filter((message) => {
				const text = JSON.stringify(message);
				return text.includes('"state":"stale"') && text.includes('"outcome":"delivered"');
			}),
		).toHaveLength(1);
		expect(approvals.inspect()).toEqual([]);
		expect(() => connection.snapshot()).toThrow("disposed");
	} finally {
		await generation.stop("child_exit");
		generation.finishStop();
	}
});

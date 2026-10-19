import { createCodexApprovalBroker } from "#runtime/services/approvals/broker.ts";
import { EMPTY_SPOKEN_APPROVAL_SNAPSHOT } from "#runtime/state/spoken-approval/state.ts";
import type { ThreadLinkSnapshot } from "#runtime/rules/thread-link/contract.ts";
import type { IdentityAuthorities, ThreadId } from "@archboard/codex-app-server/identity";
import { createCodexWorkbenchGateway } from "#server/services/gateway/gateway.ts";
import {
	type BrowserActionResult,
	type BrowserWorkbenchActions,
} from "#server/protocol/gateway/contract.ts";
import { type BrowserOwnerProjection } from "#server/protocol/projection/projection-contract.ts";
import { type TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { createServerOrdinaryApprovalActions } from "#server/services/actions/ordinary-approvals.ts";

async function delivered(): Promise<BrowserActionResult> {
	return { outcome: "delivered" };
}

/**
 * A real gateway over a real approval broker and the production ordinary approval actions, for
 * one tab session whose link names one thread. Every other owner answers delivered.
 * @param identity The identity authorities.
 * @param tabSessionId The tab session every approval is shown to.
 * @param threadId The thread the session's link names.
 * @returns The broker, the gateway and every response the broker sent.
 */
export function createApprovalGateway(
	identity: IdentityAuthorities,
	tabSessionId: TabSessionId,
	threadId: ThreadId,
) {
	const responses: unknown[] = [];
	const projectionListeners = new Set<() => void>();
	const approvals = createCodexApprovalBroker({
		identity: identity.identity,
		listenerOwnership: "composition",
		transport: {
			respond: async (_request, _owner, response) => void responses.push(response),
		},
		getCurrentBinding: () => ({ link: `tab:${tabSessionId}` }),
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
		threadLinks: { create: delivered },
		text: { start: delivered, steer: delivered, interrupt: delivered },
		queue: {
			add: delivered,
			update: delivered,
			delete: delivered,
			reorder: delivered,
			start: delivered,
		},
		realtime: { start: delivered, appendText: delivered, stop: delivered },
		ordinaryApprovals: createServerOrdinaryApprovalActions(approvals),
		dynamicApprovals: { resolve: delivered },
	};
	const projection = {
		read: ({ mediaReady }: { readonly mediaReady: boolean }): BrowserOwnerProjection => ({
			readiness: { kind: "readiness", state: "thread_capable" },
			account: {
				kind: "codex_account_response",
				response: {
					account: { type: "chatgpt", email: "fixture@example.test", planType: "plus" },
					requiresOpenaiAuth: true,
					workspaceRouting: null,
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
				configured: { model: "gpt-6-sol", effort: "xhigh" },
				effective: { model: "gpt-6-sol", effort: "xhigh", serviceTier: "priority" },
				reason: null,
			},
			voice: {
				kind: "codex_voice",
				recording: false,
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
			read: (key: string) => ({
				paneId: key,
				revision: 1,
				link,
				cas: {
					revision: 1,
					paneId: key,
					childId: link.childId,
					epoch: link.epoch,
					threadId: link.threadId,
				},
			}),
		},
		// Every pane of the fixture is in one checkout.
		checkoutOf: () => "/work/payments",
		actions,
	});
	return { approvals, gateway, responses };
}

/**
 * Ask one command approval on a thread, as Codex does.
 * @param approvals The broker.
 * @param identity The identity authorities.
 * @param threadId The asking thread.
 * @param name What distinguishes this approval's ids.
 * @returns The approval as the broker took it in.
 */
export function askApproval(
	approvals: ReturnType<typeof createApprovalGateway>["approvals"],
	identity: IdentityAuthorities,
	threadId: ThreadId,
	name: string,
) {
	const requestId = identity.identity.decoder.adoptJsonRpcRequestId(`request-${name}`);
	return approvals.receive({
		child: identity.identity.validator.childId,
		epoch: identity.identity.validator.epoch,
		requestId,
		correlation: identity.identity.decoder.createWireRequestCorrelation({ requestId }),
		method: "item/commandExecution/requestApproval",
		owner: "codex-approvals",
		params: {
			threadId: identity.identity.decoder.serializeCodexIdentity(threadId),
			turnId: `turn-${name}`,
			itemId: `item-${name}`,
			kind: "command",
			startedAtMs: 10,
			approvalId: `approval-${name}`,
			environmentId: null,
			reason: "Approval gateway test",
			networkApprovalContext: null,
			command: `echo ${name}`,
			cwd: "/workspace",
			commandActions: null,
			additionalPermissions: null,
			proposedExecpolicyAmendment: null,
			proposedNetworkPolicyAmendments: null,
			availableDecisions: ["accept", "decline"],
		},
	});
}

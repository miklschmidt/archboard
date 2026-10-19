// Which browser tab an approval belongs to (TASK-373).
//
// An approval is shown to, and answered by, the tab session whose thread asked: its workhorse or
// its coordinator. What is guarded: the production binding links an approval to that session, and
// an approval asked on a thread no tab session holds is cancelled at once, because nobody can be
// shown it and a running turn must never wait on nobody. A session that ends settles its own.

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withProductionState } from "#tests/server/support/generation/production-state.ts";

import { createCodexApprovalBroker } from "#runtime/services/approvals/broker.ts";
import { createDynamicAuthorityTokenIssuer } from "#runtime/rules/dynamic-tools/authority/authority-token.ts";
import { type DynamicToolApprovalRequest } from "#runtime/protocol/dynamic-tools/contract.ts";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "#runtime/protocol/thread-tools/manifest.ts";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { createServerDynamicApprovalOwner } from "#server/services/actions/dynamic-approvals.ts";
import { visibleApprovalViews } from "#server/services/actions/ordinary-approvals.ts";
import { createServerCodexWorkbenchInstallation } from "#server/services/owner/production.ts";
import type { CodexWorkbenchGenerationInput } from "#server/services/owner/owner-state.ts";

/**
 * The production bindings of one generation, over a throwaway state directory.
 * @returns The bindings and a cleanup.
 */
function productionBindings() {
	const root = mkdtempSync(join(tmpdir(), "archboard-approval-sessions-"));
	return withProductionState(root, () => {
		const installation = createServerCodexWorkbenchInstallation({
			sourceRoot: "/repo",
			onFatal: () => undefined,
		} as never);
		const bindings = installation.bindings({
			generation: 1,
			process: { stop: async () => undefined },
		} as unknown as CodexWorkbenchGenerationInput);
		return { bindings, cleanup: () => rmSync(root, { recursive: true, force: true }) };
	});
}

test("an approval is linked to the workhorse or coordinator whose thread asked, and one no tab session holds is cancelled on receipt", async () => {
	const authorities = createIdentityAuthorities();
	const { identity } = authorities;
	const holders: Record<string, string> = {
		"thread-held": "tab-one",
		"thread-workhorse": "tab-one",
	};
	// The checkout of the workhorse that started a thread; the coordinator's is none.
	const workhorses: Record<string, string> = { "thread-workhorse": "/work/payments" };
	const { bindings, cleanup } = productionBindings();
	const responses: unknown[] = [];
	const created: Record<string, unknown> = {
		identity: authorities,
		sessions: {
			forThread: (threadId: Parameters<typeof identity.decoder.serializeCodexIdentity>[0]) => {
				const holder = holders[identity.decoder.serializeCodexIdentity(threadId)];
				return holder === undefined ? null : { id: parseTabSessionId(holder)! };
			},
			workhorseForThread: (
				threadId: Parameters<typeof identity.decoder.serializeCodexIdentity>[0],
			) => {
				const checkout = workhorses[identity.decoder.serializeCodexIdentity(threadId)];
				return checkout === undefined ? null : { checkout };
			},
		},
	};
	const broker = createCodexApprovalBroker({
		...bindings.approvals(created as never),
		identity,
		transport: { respond: async (_request, _owner, response) => void responses.push(response) },
	});
	created["approvals"] = broker;
	const ask = (threadId: string) => {
		const requestId = identity.decoder.adoptJsonRpcRequestId(`request-${threadId}`);
		return broker.receive({
			child: identity.validator.childId,
			epoch: identity.validator.epoch,
			requestId,
			correlation: identity.decoder.createWireRequestCorrelation({ requestId }),
			method: "item/commandExecution/requestApproval",
			owner: "codex-approvals",
			params: {
				threadId,
				turnId: `turn-${threadId}`,
				itemId: `item-${threadId}`,
				kind: "command",
				startedAtMs: 10,
				approvalId: `approval-${threadId}`,
				environmentId: null,
				reason: "Tab session test",
				networkApprovalContext: null,
				command: "echo tab",
				cwd: "/workspace",
				commandActions: null,
				additionalPermissions: null,
				proposedExecpolicyAmendment: null,
				proposedNetworkPolicyAmendments: null,
				availableDecisions: ["accept", "decline"],
			},
		});
	};
	try {
		const held = ask("thread-held");
		const fromWorkhorse = ask("thread-workhorse");
		const unheld = ask("thread-nobody-holds");
		expect(unheld.binding.link).toBeNull();
		// Every pane of the tab is shown its coordinator's; only the panes of the workhorse's
		// checkout are shown the workhorse's.
		const shown = (checkout: string) =>
			visibleApprovalViews(broker, parseTabSessionId("tab-one")!, checkout).map(
				(view) => view.snapshot.requestId,
			);
		expect(shown("/work/payments")).toEqual([held.requestId, fromWorkhorse.requestId]);
		expect(shown("/work/shop")).toEqual([held.requestId]);
		expect(visibleApprovalViews(broker, parseTabSessionId("tab-two")!, "/work/payments")).toEqual(
			[],
		);

		// The cancellation runs once the broker has finished taking the approval in.
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(responses).toEqual([{ result: { decision: "cancel" } }]);
		expect(broker.get(held.requestId)?.state).toBe("pending");
		expect(broker.get(unheld.requestId)).toBeUndefined();
	} finally {
		broker.dispose();
		cleanup();
	}
});

test("a tab session's end settles its coordination approvals as unanswered and leaves another tab's", async () => {
	const authorities = createIdentityAuthorities();
	const { identity } = authorities;
	const tabs = { "thread-one": "tab-one", "thread-two": "tab-two" } as Record<string, string>;
	const owner = createServerDynamicApprovalOwner({
		identity: authorities,
		now: () => 10,
		bindingForCaller: (threadId) => {
			const tabSessionId = parseTabSessionId(
				tabs[identity.decoder.serializeCodexIdentity(threadId)]!,
			)!;
			return {
				tabSessionId,
				binding: {
					commandId: identity.issuer.mintBrowserCommandId(),
					paneId: "A",
					capturedLink: {
						threadId,
						childId: identity.validator.childId,
						epoch: identity.validator.epoch,
					},
				},
			};
		},
	});
	const ask = (thread: string) => {
		const token = createDynamicAuthorityTokenIssuer();
		const operationId = String(authorities.operation.issuer.mintOperationId());
		const request: DynamicToolApprovalRequest = {
			identity: {
				child: identity.validator.childId,
				epoch: identity.validator.epoch,
				threadId: identity.decoder.adoptThreadId(thread),
				turnId: identity.decoder.adoptTurnId(`turn-${thread}`),
				callId: identity.decoder.adoptDynamicToolCallId(`call-${thread}`),
				namespace: "archboard_app",
				tool: "create_thread",
				manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
				operationId,
			},
			effect: {
				tool: "create_thread",
				arguments: { prompt: thread },
				callerAuthority: token.issue(),
				targetAuthority: null,
				contextAuthority: token.issue(),
				effectiveBoundary: null,
				mutationOperationId: operationId,
				initialTurnOperationId: String(authorities.operation.issuer.mintOperationId()),
				visualSummary: `Create thread: ${thread}`,
			},
			effectHash: `sha256:${"1".repeat(64)}`,
			createdAtMs: 1,
			expiresAtMs: 90_001,
		};
		owner.port.presentImmutableRequest(request);
		return owner.port.awaitOneExactVisualDecision(request);
	};
	try {
		const ended = ask("thread-one");
		ask("thread-two");

		owner.endSession(parseTabSessionId("tab-one")!);

		// Nobody answered: the caller must ask again rather than take the silence for a refusal.
		expect(await ended).toMatchObject({ outcome: "disconnected", cause: "browser_disconnected" });
		expect(owner.pending(parseTabSessionId("tab-one")!)).toEqual([]);
		expect(owner.pending(parseTabSessionId("tab-two")!)).toHaveLength(1);
	} finally {
		owner.dispose();
	}
});

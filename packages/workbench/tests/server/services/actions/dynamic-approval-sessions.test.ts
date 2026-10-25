import { expect, test } from "bun:test";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { parseTabSessionId } from "@archboard/codex-realtime-voice/server";
import { createDynamicAuthorityTokenIssuer } from "#runtime/rules/dynamic-tools/authority/authority-token.ts";
import type { DynamicToolApprovalRequest } from "#runtime/protocol/dynamic-tools/contract.ts";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "#runtime/protocol/thread-tools/manifest.ts";
import { createServerDynamicApprovalOwner } from "#server/services/actions/dynamic-approvals.ts";

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
		const tab = parseTabSessionId("tab-two")!;
		const commandId = identity.issuer.mintBrowserCommandId();
		owner.bindLease(tab, "B", commandId);
		const browser = owner.projectPending(tab);
		expect(browser).toHaveLength(1);
		expect<unknown>(browser[0]?.identity).toEqual(owner.pending(tab)[0]?.request.identity);
		expect(browser[0]?.binding).toMatchObject({ paneId: "B", commandId });
		expect(browser[0]?.effect).not.toHaveProperty("callerAuthority");

		owner.endSession(parseTabSessionId("tab-one")!);

		// Nobody answered: the caller must ask again rather than take the silence for a refusal.
		expect(await ended).toMatchObject({ outcome: "disconnected", cause: "browser_disconnected" });
		expect(owner.pending(parseTabSessionId("tab-one")!)).toEqual([]);
		expect(owner.projectPending(parseTabSessionId("tab-one")!)).toEqual([]);
		expect(owner.pending(parseTabSessionId("tab-two")!)).toHaveLength(1);
	} finally {
		owner.dispose();
	}
});

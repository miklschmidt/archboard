// Which browser tab an ordinary approval belongs to (TASK-373).
//
// An approval is shown to, and answered by, the tab session whose thread asked: its workhorse or
// its coordinator. What is guarded: the production binding links an approval to that session, and
// an approval asked on a thread no tab session holds is cancelled at once, because nobody can be
// shown it and a running turn must never wait on nobody.

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { parseTabSessionId } from "../../codex-workbench/index.js";
import { createServerCodexWorkbenchInstallation } from "../codex-workbench-production.js";
import type { CodexWorkbenchGenerationInput } from "../codex-workbench-owner.js";

/**
 * The production bindings of one generation, over a throwaway state directory.
 * @returns The bindings and a cleanup.
 */
function productionBindings() {
	const root = mkdtempSync(join(tmpdir(), "archboard-approval-sessions-"));
	const prior = process.env["XDG_STATE_HOME"];
	process.env["XDG_STATE_HOME"] = root;
	try {
		const installation = createServerCodexWorkbenchInstallation({
			checkoutRoot: "/repo",
			onFatal: () => undefined,
		} as never);
		const bindings = installation.bindings({
			generation: 1,
			process: { stop: async () => undefined },
		} as unknown as CodexWorkbenchGenerationInput);
		return { bindings, cleanup: () => rmSync(root, { recursive: true, force: true }) };
	} finally {
		if (prior === undefined) {
			delete process.env["XDG_STATE_HOME"];
		} else {
			process.env["XDG_STATE_HOME"] = prior;
		}
	}
}

test("an approval is linked to the tab session whose thread asked, and one no tab session holds is cancelled on receipt", async () => {
	const authorities = createIdentityAuthorities();
	const { identity } = authorities;
	const holders: Record<string, string> = { "thread-held": "tab-one" };
	const { bindings, cleanup } = productionBindings();
	const responses: unknown[] = [];
	const created: Record<string, unknown> = {
		identity: authorities,
		sessions: {
			forThread: (threadId: Parameters<typeof identity.decoder.serializeCodexIdentity>[0]) => {
				const holder = holders[identity.decoder.serializeCodexIdentity(threadId)];
				return holder === undefined ? null : { id: parseTabSessionId(holder)! };
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
		const unheld = ask("thread-nobody-holds");
		expect(held.binding.link).toBe("tab:tab-one");
		expect(unheld.binding.link).toBeNull();

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

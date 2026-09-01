import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createCodexEpochStore } from "../../../runtime/codex-epoch/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createCanvasThreadLinkActions } from "../codex-workbench-adapters.js";

test("attach records genuine current-child provenance before making the link executable", async () => {
	const root = mkdtempSync(join("/tmp", "archboard-attach-owner-"));
	const epochRoot = join(root, "epoch");
	const codexHome = join(root, "codex-home");
	const sqliteHome = join(root, "codex-sqlite");
	mkdirSync(epochRoot, { recursive: true, mode: 0o700 });
	mkdirSync(codexHome, { recursive: true, mode: 0o700 });
	mkdirSync(sqliteHome, { recursive: true, mode: 0o700 });
	writeFileSync(join(codexHome, "sentinel.db"), "codex-state");
	writeFileSync(join(sqliteHome, "sentinel.sqlite"), "sqlite-state");
	const authorities = createIdentityAuthorities();
	const epoch = createCodexEpochStore({
		rootDirectory: epochRoot,
		codexHome,
		sqliteHome,
		now: () => 143_014,
	});
	try {
		const epochOperationId = authorities.operation.issuer.mintOperationId();
		epoch.startEpoch({
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			operationId: epochOperationId,
			kind: "epoch_start",
			rpc: "initialize",
			workspaceRoot: "/workspace/archboard",
			instructionHash: "1".repeat(64),
			manifestHash: "2".repeat(64),
		});
		const threadId = authorities.identity.decoder.adoptThreadId("persisted-foreign-thread");
		const binding = {
			paneId: "pane-attach",
			revision: 2,
			link: {
				kind: "thread_link",
				state: "executable",
				childId: authorities.identity.validator.childId,
				epoch: authorities.identity.validator.epoch,
				threadId,
				source: "appServer",
				status: "idle",
				loaded: true,
				canAcceptDirectInput: true,
				reason: null,
			},
			cas: {
				revision: 2,
				paneId: "pane-attach",
				childId: authorities.identity.validator.childId,
				epoch: authorities.identity.validator.epoch,
				threadId,
			},
		} as const;
		let controller = { token: { revision: 0 }, binding: null as unknown };
		const boundTargets: unknown[] = [];
		const actions = createCanvasThreadLinkActions({
			workhorse: {} as never,
			threadLink: {
				classify: async () =>
					({
						link: {
							...binding.link,
							state: "inspect_only",
							childId: null,
							epoch: null,
							canAcceptDirectInput: false,
							reason: "unknown_provenance",
						},
						observation: {
							source: "appServer",
							loaded: true,
							status: "idle",
							canAcceptDirectInput: true,
						},
						thread: { id: threadId },
					}) as never,
				classifyAndBind: async (_pane: string, _expected: unknown, target: unknown) => {
					boundTargets.push(target);
					return binding;
				},
			} as never,
			semanticDelivery: {
				snapshot: () => controller,
				compareAndSwap: (transition: { next: unknown }) => {
					controller = {
						token: { revision: controller.token.revision + 1 },
						binding: transition.next,
					};
					return controller;
				},
			} as never,
			epoch,
			identity: authorities,
			checkoutRoot: "/workspace/archboard",
		});
		const context = {
			browserId: "browser-attach",
			connection: Object.freeze({}),
			paneId: "pane-attach",
			commandId: authorities.identity.issuer.mintBrowserCommandId(),
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			linkRevision: 1,
			link: { ...binding.link, state: "unbound", threadId: null, reason: "not_linked" },
		} as const;

		await actions.attach({ command: "threadLinkAttach", threadId } as never, context as never);

		const attached = epoch
			.snapshot()
			.manifest.records.findLast((record) => record.operation.kind === "attached");
		expect(attached).toMatchObject({
			status: "committed",
			outcome: "delivered",
			operation: { kind: "attached", rpc: "thread/read" },
			provenance: {
				threadId,
				threadSource: "appServer",
				workspaceRoot: "/workspace/archboard",
				instructionHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
				manifestHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			},
		});
		expect(boundTargets).toEqual([
			expect.objectContaining({
				threadId,
				operationId: attached?.operation.id,
				provenance: attached,
			}),
		]);
	} finally {
		epoch.close();
		rmSync(root, { recursive: true, force: true });
	}
});

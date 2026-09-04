import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createCodexEpochStore } from "../../../runtime/codex-epoch/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import {
	createCanvasThreadCandidateInventory,
	createCanvasThreadLinkActions,
} from "../codex-workbench-adapters.js";

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
		const boundSelections: string[] = [];
		let discoveries = 0;
		const threadLink = {
			discoverCandidates: async () => {
				discoveries += 1;
				return {
					candidates: [
						{
							selectionId: `selection-${discoveries}`,
							threadId,
							state: "inspect_only",
							reason: "unknown_provenance",
							source: "appServer",
							status: "idle",
							loaded: true,
							canAcceptDirectInput: true,
						},
					],
				};
			},
			bindCandidate: async (_pane: string, _expected: unknown, selectionId: string) => {
				boundSelections.push(selectionId);
				return binding;
			},
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
		} as never;
		const candidates = createCanvasThreadCandidateInventory(threadLink);
		const actions = createCanvasThreadLinkActions({
			workhorse: {} as never,
			threadLink,
			candidates,
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

		// The pane must publish a list before a row exists to choose.
		await actions.refresh({ command: "threadLinkRefresh" } as never, context as never);
		await actions.attach(
			{ command: "threadLinkAttach", selectionId: "selection-1", threadId } as never,
			context as never,
		);

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
		// Staging the ownership record moved the epoch, so the bind consumed a
		// selection from a fresh discovery rather than the one the browser held.
		expect(discoveries).toBe(2);
		expect(boundSelections).toEqual(["selection-2"]);
		expect(attached?.operation.id).toBeString();
	} finally {
		epoch.close();
		rmSync(root, { recursive: true, force: true });
	}
});

test("a selection the pane never published, or one naming another thread, is refused", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("published-thread");
	const otherThreadId = authorities.identity.decoder.adoptThreadId("other-thread");
	let discoveries = 0;
	const threadLink = {
		discoverCandidates: async () => {
			discoveries += 1;
			return {
				candidates: [
					{
						selectionId: "selection-published",
						threadId,
						state: "inspect_only",
						reason: "unknown_provenance",
						source: "appServer",
						status: "idle",
						loaded: true,
						canAcceptDirectInput: true,
					},
				],
			};
		},
		bindCandidate: async () => {
			throw new Error("a refused selection must never reach the bind boundary");
		},
		classify: async () => {
			throw new Error("a refused selection must never reach the classifier");
		},
	} as never;
	const candidates = createCanvasThreadCandidateInventory(threadLink);
	const actions = createCanvasThreadLinkActions({
		candidates,
		threadLink,
		workhorse: {} as never,
		semanticDelivery: {} as never,
		epoch: {} as never,
		identity: authorities,
		checkoutRoot: "/workspace/archboard",
	});
	const context = {
		browserId: "browser-stale",
		connection: Object.freeze({}),
		paneId: "pane-stale",
		commandId: authorities.identity.issuer.mintBrowserCommandId(),
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		linkRevision: 1,
		link: { state: "unbound", childId: null, epoch: null, threadId: null },
	} as const;

	// Nothing is published yet, so no selection can name a row.
	expect(
		actions.attach(
			{ command: "threadLinkAttach", selectionId: "selection-published", threadId } as never,
			context as never,
		),
	).rejects.toThrow("no longer in the published list");

	await actions.refresh({ command: "threadLinkRefresh" } as never, context as never);
	expect(discoveries).toBe(1);
	// A selection that names a different thread than the published row is refused.
	expect(
		actions.relink(
			{
				command: "threadLinkRelink",
				selectionId: "selection-published",
				threadId: otherThreadId,
			} as never,
			context as never,
		),
	).rejects.toThrow("no longer in the published list");
	expect(discoveries).toBe(1);
	expect(candidates.read()).toMatchObject({ state: "listed" });
	expect(candidates.threadIdFor("selection-published")).toBe(threadId);
	expect(candidates.threadIdFor("selection-gone")).toBeNull();
});

test("a discovery that fails publishes the unavailable arm with its reason", async () => {
	const candidates = createCanvasThreadCandidateInventory({
		discoverCandidates: async () => {
			throw new Error("the persisted list could not be exhausted");
		},
	} as never);
	expect(candidates.read()).toEqual({ kind: "codex_thread_candidates", state: "unknown" });
	expect(candidates.refresh()).rejects.toThrow("could not be exhausted");
	await Bun.sleep(0);
	expect(candidates.read()).toEqual({
		kind: "codex_thread_candidates",
		state: "unavailable",
		reason: "the persisted list could not be exhausted",
	});
	expect(candidates.threadIdFor("selection-published")).toBeNull();
});

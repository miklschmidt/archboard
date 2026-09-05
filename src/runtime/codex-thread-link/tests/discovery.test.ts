import { unavailableThreadRead } from "./fixtures.js";
import { describe, expect, test } from "bun:test";

import { CodexThreadLinkError, createCodexThreadLink } from "../index.ts";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.ts";
import { loadedPage, session, thread, threadPage } from "./fixtures.ts";
import { realEpochFixture, type RealEpochFixture } from "./epoch-fixtures.ts";

function commitThreadOperation(
	fixture: RealEpochFixture,
	operationId: string,
	kind: string,
	rpc: string,
): void {
	const transaction = fixture.store.stageOperation({
		childId: fixture.authority.validator.childId,
		epoch: fixture.authority.validator.epoch,
		operationId,
		kind,
		rpc,
		workspaceRoot: "/workspace/archboard",
		instructionHash: "9".repeat(64),
		manifestHash: "a".repeat(64),
		expected: fixture.store.snapshot().cas,
	});
	fixture.store.commitOperation(transaction, {
		threadId: fixture.target.threadId,
		threadSource: "appServer",
	});
}

describe("codex thread-link candidate discovery", () => {
	test("publishes one frozen exact join after exhausting both typed inventories", async () => {
		const fixture = realEpochFixture(createIdentityAuthority(), { threadId: "owned" });
		try {
			const attachable = thread(fixture.authority, "attachable");
			const owned = thread(fixture.authority, "owned");
			const pages = session(
				new Map([
					[null, threadPage([attachable], "persisted-next")],
					["persisted-next", threadPage([owned])],
				]),
				new Map([
					[null, loadedPage([owned.id], "loaded-next")],
					["loaded-next", loadedPage([attachable.id])],
				]),
			);

			const discovery = await createCodexThreadLink({
				session: pages,
				epoch: fixture.store,
			}).discoverCandidates();

			expect(
				discovery.candidates.map(({ threadId, state, reason, source, status, loaded }) => ({
					threadId,
					state,
					reason,
					source,
					status,
					loaded,
				})),
			).toEqual([
				{
					threadId: attachable.id,
					state: "inspect_only",
					reason: "unknown_provenance",
					source: "appServer",
					status: "idle",
					loaded: true,
				},
				{
					threadId: owned.id,
					state: "executable",
					reason: null,
					source: "appServer",
					status: "idle",
					loaded: true,
				},
			]);
			expect(pages.threadListRequests.map((request) => request?.cursor)).toEqual([
				null,
				"persisted-next",
			]);
			expect(pages.loadedListRequests.map((request) => request?.cursor)).toEqual([
				null,
				"loaded-next",
			]);
			expect(Object.isFrozen(discovery)).toBe(true);
			expect(Object.isFrozen(discovery.candidates)).toBe(true);
			expect(Object.isFrozen(discovery.candidates[0])).toBe(true);
		} finally {
			fixture.cleanup();
		}
	});

	test("publishes only the closed browser-safe candidate projection", async () => {
		const fixture = realEpochFixture();
		try {
			const privateRow = {
				...thread(fixture.authority, "target", { source: { custom: "private-custom" } }),
				title: "private-title",
				cwd: "/private/cwd",
				gitInfo: { origin: "private-repository" },
				turns: [
					{
						id: fixture.authority.decoder.adoptTurnId("private-turn-id"),
						items: [{ type: "userMessage", content: [{ type: "text", text: "private-turn" }] }],
					},
				],
			} as never;
			const discovery = await createCodexThreadLink({
				epoch: fixture.store,
				session: session(
					new Map([[null, threadPage([privateRow])]]),
					new Map([[null, loadedPage([fixture.target.threadId])]]),
				),
			}).discoverCandidates();
			const candidate = discovery.candidates[0]!;

			expect(Object.keys(discovery)).toEqual(["candidates"]);
			expect(Object.keys(candidate).toSorted()).toEqual([
				"canAcceptDirectInput",
				"loaded",
				"reason",
				"selectionId",
				"source",
				"state",
				"status",
				"threadId",
			]);
			expect(candidate).toMatchObject({
				threadId: fixture.target.threadId,
				state: "inspect_only",
				reason: "thread_source_custom",
				source: "custom",
				status: "idle",
				loaded: true,
				canAcceptDirectInput: true,
			});
			expect(candidate.selectionId).toMatch(/^[0-9a-f-]{36}$/);
			const serialized = JSON.stringify(discovery);
			for (const forbidden of [
				"target",
				"classification",
				"proof",
				"provenance",
				"turns",
				"cwd",
				"workspaceRoot",
				"instructionHash",
				"manifestHash",
				"private-custom",
				"private-title",
				"/private/cwd",
				"private-repository",
				"private-turn",
				"/workspace/archboard",
			]) {
				expect(serialized).not.toContain(forbidden);
			}
		} finally {
			fixture.cleanup();
		}
	});

	test("rejects a repeated cursor from either inventory without a partial result", async () => {
		const fixture = realEpochFixture();
		try {
			const row = thread(fixture.authority, "target");
			const cases = [
				{
					threads: new Map([
						[null, threadPage([row], "again")],
						["again", threadPage([], "again")],
					]),
					loaded: new Map([[null, loadedPage([row.id])]]),
				},
				{
					threads: new Map([[null, threadPage([row])]]),
					loaded: new Map([
						[null, loadedPage([row.id], "again")],
						["again", loadedPage([], "again")],
					]),
				},
			] as const;

			for (const pages of cases) {
				const result = createCodexThreadLink({
					epoch: fixture.store,
					session: session(pages.threads, pages.loaded),
				}).discoverCandidates();
				await expect(result).rejects.toMatchObject({ code: "repeated_cursor" });
			}
		} finally {
			fixture.cleanup();
		}
	});

	test("reuses classifier refusal semantics for duplicate rows and current owned rows", async () => {
		const fixture = realEpochFixture();
		try {
			const cases = [
				{
					row: thread(fixture.authority, "target", { source: { custom: "foreign" } }),
					reason: "thread_source_custom",
				},
				{
					row: thread(fixture.authority, "target", { canAcceptDirectInput: false }),
					reason: "direct_input_false",
				},
				{
					row: thread(fixture.authority, "target", { canAcceptDirectInput: null }),
					reason: "direct_input_unknown",
				},
				{
					row: thread(fixture.authority, "target", { status: "systemError" }),
					reason: "thread_status_system_error",
				},
			] as const;

			for (const { row, reason } of cases) {
				const discovery = await createCodexThreadLink({
					epoch: fixture.store,
					session: session(
						new Map([[null, threadPage([row])]]),
						new Map([[null, loadedPage([row.id])]]),
					),
				}).discoverCandidates();
				expect(discovery.candidates[0]).toMatchObject({
					state: "inspect_only",
					reason,
				});
			}

			const duplicate = thread(fixture.authority, "target");
			const discovery = await createCodexThreadLink({
				epoch: fixture.store,
				session: session(
					new Map([[null, threadPage([duplicate, duplicate])]]),
					new Map([[null, loadedPage([duplicate.id, duplicate.id])]]),
				),
			}).discoverCandidates();
			expect(discovery.candidates).toHaveLength(1);
			expect(discovery.candidates[0]).toMatchObject({
				state: "inspect_only",
				reason: "thread_list_ambiguous",
			});
		} finally {
			fixture.cleanup();
		}
	});

	test("rejects an epoch-manifest change during discovery", async () => {
		const fixture = realEpochFixture();
		try {
			const row = thread(fixture.authority, "target");
			let changed = false;
			const result = createCodexThreadLink({
				epoch: fixture.store,
				session: {
					threadRead: unavailableThreadRead,
					threadListPage: async () => threadPage([row]),
					threadLoadedListPage: async () => {
						if (!changed) {
							changed = true;
							fixture.store.stageOperation({
								childId: fixture.authority.validator.childId,
								epoch: fixture.authority.validator.epoch,
								operationId: "concurrent-operation",
								kind: "read",
								rpc: "thread/read",
								workspaceRoot: "/workspace/archboard",
								instructionHash: "3".repeat(64),
								manifestHash: "4".repeat(64),
								expected: fixture.store.snapshot().cas,
							});
						}
						return loadedPage([row.id]);
					},
				},
			}).discoverCandidates();

			await expect(result).rejects.toBeInstanceOf(CodexThreadLinkError);
			await expect(result).rejects.toMatchObject({ code: "conflict" });
		} finally {
			fixture.cleanup();
		}
	});

	test("retains stale and outcome-unknown durable provenance as inspect-only", async () => {
		const uncertain = realEpochFixture(createIdentityAuthority(), {
			unknownReason: "private-diagnostic",
			rpc: "thread/start",
		});
		try {
			const row = thread(uncertain.authority, "target");
			const discovery = await createCodexThreadLink({
				epoch: uncertain.store,
				session: session(
					new Map([[null, threadPage([row])]]),
					new Map([[null, loadedPage([row.id])]]),
				),
			}).discoverCandidates();
			expect(discovery.candidates[0]).toMatchObject({
				state: "inspect_only",
				reason: "thread_start_outcome_unknown",
			});
			expect(JSON.stringify(discovery)).not.toContain("private-diagnostic");
		} finally {
			uncertain.cleanup();
		}

		const stale = realEpochFixture();
		try {
			const replacement = createIdentityAuthority();
			stale.store.startEpoch({
				childId: replacement.validator.childId,
				epoch: replacement.validator.epoch,
				operationId: "replacement-epoch",
				kind: "epoch_start",
				rpc: "epoch/start",
				workspaceRoot: "/workspace/archboard",
				instructionHash: "5".repeat(64),
				manifestHash: "6".repeat(64),
				expected: stale.store.snapshot().cas,
			});
			const row = thread(stale.authority, "target");
			const discovery = await createCodexThreadLink({
				epoch: stale.store,
				session: session(
					new Map([[null, threadPage([row])]]),
					new Map([[null, loadedPage([row.id])]]),
				),
			}).discoverCandidates();
			expect(discovery.candidates[0]).toMatchObject({
				state: "inspect_only",
				reason: "stale_child",
			});
		} finally {
			stale.cleanup();
		}
	});

	test("keeps valid ownership when a later committed read names the same thread", async () => {
		const fixture = realEpochFixture();
		try {
			commitThreadOperation(fixture, "later-read", "read", "thread/read");
			const row = thread(fixture.authority, "target");
			const port = createCodexThreadLink({
				epoch: fixture.store,
				session: session(
					new Map([[null, threadPage([row])]]),
					new Map([[null, loadedPage([row.id])]]),
				),
			});
			const candidate = (await port.discoverCandidates()).candidates[0]!;

			expect(candidate).toMatchObject({ state: "executable", reason: null });
			const bound = await port.bindCandidate("pane-a", null, candidate.selectionId);
			expect(bound.link).toMatchObject({ state: "executable", threadId: row.id });
		} finally {
			fixture.cleanup();
		}
	});

	test("keeps an unrelated-only committed record inspect-only and unable to bind executable", async () => {
		const fixture = realEpochFixture(createIdentityAuthority(), {
			kind: "read",
			rpc: "thread/read",
		});
		try {
			const row = thread(fixture.authority, "target");
			const port = createCodexThreadLink({
				epoch: fixture.store,
				session: session(
					new Map([[null, threadPage([row])]]),
					new Map([[null, loadedPage([row.id])]]),
				),
			});
			const candidate = (await port.discoverCandidates()).candidates[0]!;

			expect(candidate).toMatchObject({
				state: "inspect_only",
				reason: "unknown_provenance",
			});
			const bound = await port.bindCandidate("pane-a", null, candidate.selectionId);
			expect(bound.link).toMatchObject({
				state: "inspect_only",
				reason: "unknown_provenance",
			});
		} finally {
			fixture.cleanup();
		}
	});

	test("routes a discovered target through fresh classification and pane CAS", async () => {
		const fixture = realEpochFixture();
		try {
			const row = thread(fixture.authority, "target");
			let listPass = 0;
			const port = createCodexThreadLink({
				epoch: fixture.store,
				session: {
					threadRead: unavailableThreadRead,
					threadListPage: async () => {
						listPass += 1;
						return threadPage([row]);
					},
					threadLoadedListPage: async () => loadedPage(listPass === 1 ? [row.id] : []),
				},
			});
			const candidate = (await port.discoverCandidates()).candidates[0];
			expect(candidate?.state).toBe("executable");

			const bound = await port.bindCandidate(
				"pane-a",
				port.snapshot("pane-a").cas,
				candidate!.selectionId,
			);

			expect(bound.link).toMatchObject({
				state: "inspect_only",
				reason: "thread_loaded_list_missing",
				threadId: row.id,
			});
			expect(bound.cas).toMatchObject({ paneId: "pane-a", threadId: row.id });
		} finally {
			fixture.cleanup();
		}
	});

	test("scopes opaque selections to one port and generation and consumes them once", async () => {
		const fixture = realEpochFixture();
		try {
			const row = thread(fixture.authority, "target");
			const pages = session(
				new Map([[null, threadPage([row])]]),
				new Map([[null, loadedPage([row.id])]]),
			);
			const firstPort = createCodexThreadLink({ epoch: fixture.store, session: pages });
			const otherPort = createCodexThreadLink({ epoch: fixture.store, session: pages });
			const firstSelection = (await firstPort.discoverCandidates()).candidates[0]!.selectionId;

			for (const attempt of [
				() => otherPort.bindCandidate("pane-a", null, firstSelection),
				() => firstPort.bindCandidate("pane-a", null, "forged-selection"),
			]) {
				await expect(attempt()).rejects.toMatchObject({
					code: "conflict",
					message: expect.stringContaining("unknown, stale, or already used"),
				});
			}

			fixture.store.stageOperation({
				childId: fixture.authority.validator.childId,
				epoch: fixture.authority.validator.epoch,
				operationId: "after-discovery",
				kind: "read",
				rpc: "thread/read",
				workspaceRoot: "/workspace/archboard",
				instructionHash: "7".repeat(64),
				manifestHash: "8".repeat(64),
				expected: fixture.store.snapshot().cas,
			});
			await expect(firstPort.bindCandidate("pane-a", null, firstSelection)).rejects.toMatchObject({
				code: "conflict",
			});

			const generationSelection = (await firstPort.discoverCandidates()).candidates[0]!.selectionId;
			const currentSelection = (await firstPort.discoverCandidates()).candidates[0]!.selectionId;
			await expect(
				firstPort.bindCandidate("pane-a", null, generationSelection),
			).rejects.toMatchObject({ code: "conflict" });
			const bound = await firstPort.bindCandidate("pane-a", null, currentSelection);
			expect(bound.link).toMatchObject({ state: "executable", threadId: row.id });
			await expect(
				firstPort.bindCandidate("pane-a", bound.cas, currentSelection),
			).rejects.toMatchObject({ code: "conflict" });
		} finally {
			fixture.cleanup();
		}
	});
});

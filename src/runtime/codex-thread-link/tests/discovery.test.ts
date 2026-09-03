import { describe, expect, test } from "bun:test";

import {
	CodexThreadLinkError,
	createCodexThreadLink,
	discoverCodexThreadLinkCandidates,
} from "../index.ts";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.ts";
import { loadedPage, session, thread, threadPage } from "./fixtures.ts";
import { realEpochFixture } from "./epoch-fixtures.ts";

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

			expect(discovery.authority).toEqual({
				childId: fixture.authority.validator.childId,
				epoch: fixture.authority.validator.epoch,
				manifestRevision: fixture.store.snapshot().manifest.revision,
				manifestBytesHash: fixture.store.snapshot().cas.bytesHash,
			});
			expect(
				discovery.candidates.map(({ target, classification }) => ({
					threadId: target.threadId,
					operationId: target.operationId ?? null,
					state: classification.link.state,
					reason: classification.link.reason,
					persistedRows: classification.observation.persistedRows,
					loadedOccurrences: classification.observation.loadedOccurrences,
				})),
			).toEqual([
				{
					threadId: attachable.id,
					operationId: null,
					state: "inspect_only",
					reason: "unknown_provenance",
					persistedRows: 1,
					loadedOccurrences: 1,
				},
				{
					threadId: owned.id,
					operationId: fixture.record.correlation.operationId,
					state: "executable",
					reason: null,
					persistedRows: 1,
					loadedOccurrences: 1,
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
			expect(Object.isFrozen(discovery.candidates[0]?.classification)).toBe(true);
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
				const result = discoverCodexThreadLinkCandidates({
					epoch: fixture.store,
					session: session(pages.threads, pages.loaded),
				});
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
				expect(discovery.candidates[0]?.classification.link).toMatchObject({
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
			expect(discovery.candidates[0]?.classification).toMatchObject({
				link: { state: "inspect_only", reason: "thread_list_ambiguous" },
				observation: { persistedRows: 2, loadedOccurrences: 2 },
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
			const result = discoverCodexThreadLinkCandidates({
				epoch: fixture.store,
				session: {
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
			});

			await expect(result).rejects.toBeInstanceOf(CodexThreadLinkError);
			await expect(result).rejects.toMatchObject({ code: "conflict" });
		} finally {
			fixture.cleanup();
		}
	});

	test("retains stale and outcome-unknown durable provenance as inspect-only", async () => {
		const uncertain = realEpochFixture(createIdentityAuthority(), {
			unknownReason: "the thread/start response was lost",
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
			expect(discovery.candidates[0]?.classification.link).toMatchObject({
				state: "inspect_only",
				reason: "thread_start_outcome_unknown",
			});
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
			expect(discovery.candidates[0]?.classification.link).toMatchObject({
				state: "inspect_only",
				reason: "stale_child",
			});
		} finally {
			stale.cleanup();
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
					threadListPage: async () => {
						listPass += 1;
						return threadPage([row]);
					},
					threadLoadedListPage: async () => loadedPage(listPass === 1 ? [row.id] : []),
				},
			});
			const candidate = (await port.discoverCandidates()).candidates[0];
			expect(candidate?.classification.link.state).toBe("executable");

			const bound = await port.classifyAndBind(
				"pane-a",
				port.snapshot("pane-a").cas,
				candidate!.target,
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
});

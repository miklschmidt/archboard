import { describe, expect, test } from "bun:test";
import { classifyCodexThreadLink } from "../index.js";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import { currentEpoch, loadedPage, thread, threadPage } from "./fixtures.js";
import {
	realEpochFixture,
	type RealEpochFixture,
	type RealEpochOptions,
} from "./epoch-fixtures.js";

async function withFixture<T>(
	options: RealEpochOptions,
	action: (fixture: RealEpochFixture) => Promise<T>,
): Promise<T> {
	const fixture = realEpochFixture(createIdentityAuthority(), options);
	try {
		return await action(fixture);
	} finally {
		fixture.cleanup();
	}
}

function createdRoot(fixture: RealEpochFixture): ReturnType<typeof thread> {
	return {
		...thread(fixture.authority, "new-root", { source: "vscode" }),
		cwd: fixture.record.provenance.workspaceRoot!,
		modelProvider: "openai",
		threadSource: "archboard",
		historyMode: "paginated",
		ephemeral: false,
		forkedFromId: null,
		parentThreadId: null,
	};
}

describe("owned roots before their first user message", () => {
	test("classifies a proved created root omitted from history through its exact live read", async () => {
		await withFixture({ threadId: "new-root", source: "vscode" }, async (fixture) => {
			const row = createdRoot(fixture);
			const reads: unknown[] = [];
			const sessionFixture = {
				threadListPage: async () => threadPage([]),
				threadLoadedListPage: async () => loadedPage([row.id]),
				threadRead: async (params: { threadId: string; includeTurns?: boolean }) => {
					reads.push(params);
					return { thread: row };
				},
			};
			const result = await classifyCodexThreadLink(
				{ session: sessionFixture, epoch: fixture.store },
				fixture.target,
			);
			expect(result.link.state).toBe("executable");
			expect(result.observation).toMatchObject({
				persisted: false,
				persistedRows: 0,
				loaded: true,
			});
			expect(reads).toEqual([{ threadId: row.id, includeTurns: false }]);
		});
	});

	test("rejects mismatched live-root metadata without inventing a history row", async () => {
		await withFixture({ threadId: "new-root", source: "vscode" }, async (fixture) => {
			const row = createdRoot(fixture);
			for (const changed of [
				{ ...row, id: fixture.authority.decoder.adoptThreadId("other-root") },
				{ ...row, cwd: "/other-checkout" },
				{ ...row, source: "cli" as const },
				{ ...row, modelProvider: "" },
				{ ...row, threadSource: "foreign" },
				{ ...row, parentThreadId: row.id },
				{ ...row, ephemeral: true },
			]) {
				const result = await classifyCodexThreadLink(
					{
						epoch: fixture.store,
						session: {
							threadListPage: async () => threadPage([]),
							threadLoadedListPage: async () => loadedPage([row.id]),
							threadRead: async () => ({ thread: changed }),
						},
					},
					fixture.target,
				);
				expect(result.link).toMatchObject({ state: "inspect_only", reason: "thread_list_missing" });
				expect(result.observation.persistedRows).toBe(0);
			}
		});
	});

	test("revalidates epoch, durable proof, and loaded membership after the live-root read", async () => {
		for (const change of ["epoch", "proof", "missing", "duplicate"] as const) {
			await withFixture({ threadId: "new-root", source: "vscode" }, async (fixture) => {
				const row = createdRoot(fixture);
				let current: ReturnType<typeof currentEpoch> | null = currentEpoch(fixture.authority);
				let proofCurrent = true;
				let loadedReads = 0;
				const result = await classifyCodexThreadLink(
					{
						epoch: {
							snapshot: () => fixture.store.snapshot(),
							assertCurrent: (request) => {
								if (!proofCurrent) throw new Error("The live proof is no longer available.");
								return fixture.store.assertCurrent(request);
							},
						},
						currentEpoch: () => current,
						session: {
							threadListPage: async () => threadPage([]),
							threadLoadedListPage: async () => {
								loadedReads += 1;
								return loadedPage(
									loadedReads === 1
										? [row.id]
										: change === "missing"
											? []
											: change === "duplicate"
												? [row.id, row.id]
												: [row.id],
								);
							},
							threadRead: async () => {
								if (change === "epoch") current = null;
								if (change === "proof") proofCurrent = false;
								return { thread: row };
							},
						},
					},
					fixture.target,
				);
				expect(result.link.state).toBe("inspect_only");
				expect(result.observation.persisted).toBe(false);
			});
		}
	});

	test("does not read missing targets without a committed current created-root proof", async () => {
		for (const mode of ["resume", "unknown", "unproved", "duplicate", "stale"] as const) {
			await withFixture(
				{
					threadId: "new-root",
					source: "vscode",
					...(mode === "resume" ? { rpc: "thread/resume" } : {}),
					...(mode === "unknown" ? { unknownReason: "start settlement lost" } : {}),
				},
				async (fixture) => {
					const row = createdRoot(fixture);
					let reads = 0;
					const result = await classifyCodexThreadLink(
						{
							epoch: fixture.store,
							session: {
								threadListPage: async () => threadPage([]),
								threadLoadedListPage: async () =>
									loadedPage(mode === "duplicate" ? [row.id, row.id] : [row.id]),
								threadRead: async () => {
									reads += 1;
									return { thread: row };
								},
							},
						},
						{
							...fixture.target,
							...(mode === "unproved" ? { operationId: undefined, provenance: null } : {}),
							...(mode === "stale" ? { epoch: createIdentityAuthority().validator.epoch } : {}),
						},
					);
					expect(result.link.state).toBe("inspect_only");
					expect(reads).toBe(0);
				},
			);
		}
	});
});

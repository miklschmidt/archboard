import { describe, expect, test } from "bun:test";

import { createCodexThreadLink, type ThreadLinkTarget } from "../index.ts";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.ts";
import { loadedPage, thread, threadPage, type ThreadOptions } from "./fixtures.ts";
import { realEpochFixture, type RealEpochFixture } from "./epoch-fixtures.ts";

async function withFixture<T>(action: (fixture: RealEpochFixture) => Promise<T>): Promise<T> {
	const fixture = realEpochFixture(createIdentityAuthority());
	try {
		return await action(fixture);
	} finally {
		fixture.cleanup();
	}
}

function changingSession(
	fixture: RealEpochFixture,
	optionsForPass: (pass: number) => ThreadOptions,
) {
	let persistedPasses = 0;
	let loadedPasses = 0;
	return {
		session: {
			threadListPage: async () => {
				persistedPasses += 1;
				return threadPage([thread(fixture.authority, "target", optionsForPass(persistedPasses))]);
			},
			threadLoadedListPage: async () => {
				loadedPasses += 1;
				return loadedPage([fixture.target.threadId]);
			},
		},
		passes: () => ({ persisted: persistedPasses, loaded: loadedPasses }),
	};
}

describe("codex thread-link adoption races", () => {
	test("the second full classification refuses source, status, and capability changes", async () => {
		const cases: readonly [string, (pass: number) => ThreadOptions][] = [
			["thread_source_custom", (pass) => (pass === 1 ? {} : { source: { custom: "changed" } })],
			["thread_status_system_error", (pass) => (pass === 1 ? {} : { status: "systemError" })],
			["direct_input_false", (pass) => (pass === 1 ? {} : { canAcceptDirectInput: false })],
		];

		for (const [reason, optionsForPass] of cases) {
			await withFixture(async (fixture) => {
				const changing = changingSession(fixture, optionsForPass);
				const port = createCodexThreadLink({ session: changing.session, epoch: fixture.store });

				const bound = await port.classifyAndBind("pane-a", null, fixture.target);

				expect(bound.link).toMatchObject({ state: "inspect_only", reason });
				expect(changing.passes()).toEqual({ persisted: 2, loaded: 2 });
			});
		}
	});

	test("the second classification refuses a changed target provenance and current record", async () => {
		await withFixture(async (fixture) => {
			const transaction = fixture.store.stageOperation({
				childId: fixture.authority.validator.childId,
				epoch: fixture.authority.validator.epoch,
				operationId: "replacement-operation",
				kind: "link",
				rpc: "turn/start",
				workspaceRoot: "/workspace/archboard",
				instructionHash: "3".repeat(64),
				manifestHash: "4".repeat(64),
				expected: fixture.store.snapshot().cas,
			});
			const replacement = fixture.store.markOutcomeUnknown(transaction, "response was lost", {
				threadId: fixture.target.threadId,
			});
			const target: ThreadLinkTarget = { ...fixture.target };
			let persistedPasses = 0;
			let loadedPasses = 0;
			const row = thread(fixture.authority, "target");
			const port = createCodexThreadLink({
				epoch: fixture.store,
				session: {
					threadListPage: async () => {
						persistedPasses += 1;
						if (persistedPasses === 2) {
							Object.assign(target, {
								operationId: "replacement-operation",
								provenance: replacement,
							});
						}
						return threadPage([row]);
					},
					threadLoadedListPage: async () => {
						loadedPasses += 1;
						return loadedPage([row.id]);
					},
				},
			});

			const bound = await port.classifyAndBind("pane-a", null, target);

			expect(bound.link).toMatchObject({ state: "inspect_only", reason: "unknown_provenance" });
			expect({ persisted: persistedPasses, loaded: loadedPasses }).toEqual({
				persisted: 2,
				loaded: 2,
			});
		});
	});
});

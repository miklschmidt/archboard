import { describe, expect, test } from "bun:test";

import { classifyCodexThreadLink } from "../index.ts";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.ts";
import { currentEpoch, loadedPage, session, thread, threadPage } from "./fixtures.ts";
import {
	realEpochFixture,
	type RealEpochFixture,
	type RealEpochOptions,
} from "./epoch-fixtures.ts";

function onePage(row: ReturnType<typeof thread> | null, loaded: readonly string[]) {
	return session(
		new Map([[null, threadPage(row === null ? [] : [row])]]),
		new Map([[null, loadedPage(loaded)]]),
	);
}

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

describe("codex thread-link authored refusal precedence", () => {
	test("keeps stale child ahead of every lower condition", async () => {
		await withFixture({}, async (fixture) => {
			const replacement = createIdentityAuthority();
			const row = thread(fixture.authority, "target", {
				source: { custom: "integration" },
				status: "systemError",
				canAcceptDirectInput: false,
			});
			const result = await classifyCodexThreadLink(
				{
					session: onePage(row, [row.id, row.id]),
					currentEpoch: currentEpoch(replacement),
					epoch: fixture.store,
				},
				fixture.target,
			);
			expect(result.link.reason).toBe("stale_child");
		});
	});

	test("keeps prior epoch ahead of every lower condition", async () => {
		await withFixture({}, async (fixture) => {
			const nextEpoch = fixture.authority.issuer.mintChildEpoch();
			const row = thread(fixture.authority, "target", {
				source: { custom: "integration" },
				status: "systemError",
				canAcceptDirectInput: false,
			});
			const result = await classifyCodexThreadLink(
				{
					session: onePage(row, [row.id, row.id]),
					currentEpoch: {
						childId: fixture.authority.validator.childId,
						epoch: nextEpoch,
					},
					epoch: fixture.store,
				},
				fixture.target,
			);
			expect(result.link.reason).toBe("prior_epoch");
		});
	});

	test("requires the authored thread/start loss condition and wire boundary", async () => {
		await withFixture(
			{
				operationId: "thread-loss",
				rpc: "thread/start",
				unknownReason: "response was lost",
			},
			async (fixture) => {
				const row = thread(fixture.authority, "target", {
					source: { custom: "integration" },
					status: "systemError",
					canAcceptDirectInput: false,
				});
				const result = await classifyCodexThreadLink(
					{ session: onePage(row, [row.id, row.id]), epoch: fixture.store },
					fixture.target,
				);
				expect(result.link.reason).toBe("thread_start_outcome_unknown");
			},
		);
	});

	test("keeps ordinary outcome-unknown and missing ownership below settlement loss", async () => {
		await withFixture({}, async (fixture) => {
			const row = thread(fixture.authority, "target", {
				source: { custom: "integration" },
				status: "systemError",
				canAcceptDirectInput: false,
			});
			const result = await classifyCodexThreadLink(
				{ session: onePage(row, [row.id, row.id]), epoch: fixture.store },
				{ threadId: row.id, childId: fixture.target.childId, epoch: fixture.target.epoch },
			);
			expect(result.link.reason).toBe("unknown_provenance");
		});
	});

	test("covers the remaining eleven authored conditions with lower conflicts present", async () => {
		const cases = [
			["thread_list_missing", null, "duplicate"],
			["thread_list_ambiguous", "duplicate", "duplicate"],
			["thread_loaded_list_ambiguous", "loaded-ambiguous", "duplicate"],
			["thread_source_custom", "custom", "single"],
			["thread_source_subagent", "subagent", "single"],
			["thread_source_unknown", "unknown", "single"],
			["thread_status_not_loaded", "not-loaded", "single"],
			["thread_status_system_error", "system-error", "single"],
			["thread_loaded_list_missing", "loaded-missing", "missing"],
			["direct_input_false", "direct-false", "single"],
			["direct_input_unknown", "direct-unknown", "single"],
		] as const;
		for (const [reason, rawId, loadedMode] of cases) {
			await withFixture({}, async (fixture) => {
				const row =
					rawId === null
						? null
						: thread(fixture.authority, "target", {
								source:
									reason === "thread_source_custom"
										? { custom: "integration" }
										: reason === "thread_source_subagent"
											? { subAgent: "review" }
											: reason === "thread_source_unknown"
												? "unknown"
												: "appServer",
								status:
									reason === "thread_status_not_loaded"
										? "notLoaded"
										: reason === "thread_status_system_error"
											? "systemError"
											: "idle",
								canAcceptDirectInput: reason === "direct_input_unknown" ? null : false,
							});
				const targetId = fixture.target.threadId;
				const persisted =
					rawId === null ? [] : reason === "thread_list_ambiguous" ? [row!, row!] : [row!];
				const loaded =
					loadedMode === "missing"
						? []
						: loadedMode === "duplicate"
							? [targetId, targetId]
							: [targetId];
				const result = await classifyCodexThreadLink(
					{
						session: session(
							new Map([[null, threadPage(persisted)]]),
							new Map([[null, loadedPage(loaded)]]),
						),
						epoch: fixture.store,
					},
					fixture.target,
				);
				expect(result.link.reason).toBe(reason);
			});
		}
	});
});

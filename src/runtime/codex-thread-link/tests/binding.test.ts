import { unavailableThreadRead } from "./fixtures.js";
import { CodexEpochError } from "../../codex-epoch/index.ts";
import { describe, expect, test } from "bun:test";

import {
	CodexThreadLinkConflictError,
	createCodexThreadLink,
	createCodexThreadLinkBinding,
	type ThreadLink,
	type ThreadLinkCasToken,
	type ThreadLinkNonExecutableSnapshot,
	type ThreadLinkSnapshot,
} from "../index.ts";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.ts";
import { loadedPage, session, thread, threadPage } from "./fixtures.ts";
import { realEpochFixture, type RealEpochFixture } from "./epoch-fixtures.ts";

function executable(
	authority: ReturnType<typeof createIdentityAuthority>,
	rawThreadId = "thread-a",
): ThreadLink {
	return {
		kind: "thread_link",
		state: "executable",
		childId: authority.validator.childId,
		epoch: authority.validator.epoch,
		threadId: authority.decoder.adoptThreadId(rawThreadId),
		source: "appServer",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

function inspectOnly(
	authority: ReturnType<typeof createIdentityAuthority>,
	rawThreadId = "thread-a",
	reason: Exclude<ThreadLink["reason"], null> = "unknown_provenance",
): ThreadLink {
	return {
		kind: "thread_link",
		state: "inspect_only",
		childId: null,
		epoch: null,
		threadId: authority.decoder.adoptThreadId(rawThreadId),
		source: { custom: "integration" },
		status: "idle",
		loaded: true,
		canAcceptDirectInput: false,
		reason,
	};
}

function forgedCas(
	token: ThreadLinkCasToken,
	changes: Partial<ThreadLinkCasToken>,
): ThreadLinkCasToken {
	return { ...token, ...changes };
}

function onePageSession(fixture: RealEpochFixture) {
	const row = thread(fixture.authority, "target");
	return session(new Map([[null, threadPage([row])]]), new Map([[null, loadedPage([row.id])]]));
}

async function withFixture<T>(action: (fixture: RealEpochFixture) => Promise<T>): Promise<T> {
	const fixture = realEpochFixture();
	try {
		return await action(fixture);
	} finally {
		fixture.cleanup();
	}
}

async function expectConflict(promise: Promise<unknown>): Promise<void> {
	try {
		await promise;
	} catch (error) {
		expect(error).toMatchObject({ code: "conflict" });
		return;
	}
	throw new Error("expected a binding conflict");
}

describe("codex thread-link pane bindings", () => {
	test("starts with a canonical frozen unbound snapshot", () => {
		const bindings = createCodexThreadLinkBinding();
		const snapshot = bindings.snapshot("pane-a");

		expect(snapshot).toMatchObject({
			paneId: "pane-a",
			revision: 0,
			link: {
				kind: "thread_link",
				state: "unbound",
				threadId: null,
				canAcceptDirectInput: false,
			},
		});
		expect(snapshot.cas).toEqual({
			revision: 0,
			paneId: "pane-a",
			childId: null,
			epoch: null,
			threadId: null,
		});
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.link)).toBe(true);
	});

	test("rejects a fabricated executable link at the standalone factory", () => {
		const authority = createIdentityAuthority();
		const bindings = createCodexThreadLinkBinding();
		const fabricated = executable(authority);

		expect(() =>
			bindings.compareAndSwap({
				paneId: "pane-a",
				expected: null,
				next: fabricated as ThreadLinkNonExecutableSnapshot,
			}),
		).toThrowError(
			expect.objectContaining({
				code: "invalid_input",
				message: expect.stringContaining("classifyAndBind"),
			}),
		);
	});

	test("stores inspect-only links explicitly but cannot upgrade them by CAS", () => {
		const authority = createIdentityAuthority();
		const bindings = createCodexThreadLinkBinding();
		const inspected = bindings.compareAndSwap({
			paneId: "pane-a",
			expected: null,
			next: inspectOnly(authority) as ThreadLinkNonExecutableSnapshot,
		});

		expect(inspected.link.state).toBe("inspect_only");
		expect(() =>
			bindings.compareAndSwap({
				paneId: "pane-a",
				expected: inspected.cas,
				next: executable(authority) as ThreadLinkNonExecutableSnapshot,
			}),
		).toThrowError(expect.objectContaining({ code: "invalid_input" }));
		expect(bindings.read("pane-a")).toBe(inspected);
	});

	test("classifies, revalidates, and binds a real current-epoch link", async () => {
		await withFixture(async (fixture) => {
			let assertions = 0;
			const epoch = {
				snapshot: fixture.store.snapshot,
				assertCurrent: (request: Parameters<typeof fixture.store.assertCurrent>[0]) => {
					assertions += 1;
					return fixture.store.assertCurrent(request);
				},
			};
			const port = createCodexThreadLink({
				session: onePageSession(fixture),
				epoch,
			});
			const bound = await port.classifyAndBind("pane-a", null, fixture.target);

			expect(bound.link).toMatchObject({
				state: "executable",
				childId: fixture.authority.validator.childId,
				epoch: fixture.authority.validator.epoch,
				threadId: fixture.target.threadId,
			});
			expect(assertions).toBe(3);
			expect(port.read("pane-a")).toBe(bound);
		});
	});

	test("turns a disappearing loaded row into inspect-only during classify-and-bind", async () => {
		await withFixture(async (fixture) => {
			const row = thread(fixture.authority, "target");
			let listPass = 0;
			const port = createCodexThreadLink({
				epoch: fixture.store,
				session: {
					threadRead: unavailableThreadRead,
					threadListPage: async () => {
						listPass += 1;
						return { data: [row], nextCursor: null, backwardsCursor: null };
					},
					threadLoadedListPage: async () => ({
						data: listPass === 1 ? [row.id] : [],
						nextCursor: null,
					}),
				},
			});
			const bound = await port.classifyAndBind("pane-a", null, fixture.target);

			expect(bound.link).toMatchObject({
				state: "inspect_only",
				reason: "thread_loaded_list_missing",
			});
		});
	});

	test("refuses an epoch that changes between classification passes", async () => {
		await withFixture(async (fixture) => {
			const replacement = createIdentityAuthority();
			const row = thread(fixture.authority, "target");
			let listPass = 0;
			const port = createCodexThreadLink({
				epoch: fixture.store,
				session: {
					threadRead: unavailableThreadRead,
					threadListPage: async () => {
						listPass += 1;
						if (listPass === 2) {
							fixture.store.startEpoch({
								childId: replacement.validator.childId,
								epoch: replacement.validator.epoch,
								operationId: "epoch-start-replacement",
								kind: "epoch_start",
								rpc: "epoch/start",
								workspaceRoot: "/workspace/archboard",
								instructionHash: "1".repeat(64),
								manifestHash: "2".repeat(64),
								expected: fixture.store.snapshot().cas,
							});
						}
						return { data: [row], nextCursor: null, backwardsCursor: null };
					},
					threadLoadedListPage: async () => ({ data: [row.id], nextCursor: null }),
				},
			});
			const bound = await port.classifyAndBind("pane-a", null, fixture.target);

			expect(bound.link).toMatchObject({ state: "inspect_only", reason: "stale_child" });
		});
	});

	test("rechecks durable status at adoption and leaves the pane unchanged", async () => {
		await withFixture(async (fixture) => {
			let assertions = 0;
			const epoch = {
				snapshot: fixture.store.snapshot,
				assertCurrent: (request: Parameters<typeof fixture.store.assertCurrent>[0]) => {
					assertions += 1;
					if (assertions === 3) {
						throw new CodexEpochError(
							"inspect_only",
							"the durable operation became inspect-only before adoption",
						);
					}
					return fixture.store.assertCurrent(request);
				},
			};
			const port = createCodexThreadLink({ session: onePageSession(fixture), epoch });

			await expectConflict(port.classifyAndBind("pane-a", null, fixture.target));
			expect(port.snapshot("pane-a").link.state).toBe("unbound");
			expect(assertions).toBe(3);
		});
	});

	test("owns its binding even when an unchecked store is attached to input options", async () => {
		await withFixture(async (fixture) => {
			const replacement = createIdentityAuthority();
			const stale = executable(replacement);
			let injectedCalls = 0;
			const unchecked = {
				snapshot: () => {
					injectedCalls += 1;
					return {
						paneId: "pane-a",
						revision: 1,
						link: stale,
						cas: {
							revision: 1,
							paneId: "pane-a",
							childId: stale.childId,
							epoch: stale.epoch,
							threadId: stale.threadId,
						},
					};
				},
				read: () => undefined,
				compareAndSwap: () => {
					injectedCalls += 1;
					return undefined;
				},
				clear: () => undefined,
			};
			const options = Object.assign(
				{ session: onePageSession(fixture), epoch: fixture.store },
				{ binding: unchecked },
			);
			const port = createCodexThreadLink(options);

			expect(port.snapshot("pane-a").link.state).toBe("unbound");
			const bound = await port.classifyAndBind("pane-a", null, fixture.target);
			expect(bound.link.state).toBe("executable");
			expect(bound.link.childId).toBe(fixture.authority.validator.childId);
			expect(bound.link.childId).not.toBe(stale.childId);
			expect(injectedCalls).toBe(0);
		});
	});

	test("default classify-and-bind keeps a stale child inspect-only", async () => {
		await withFixture(async (fixture) => {
			const replacement = createIdentityAuthority();
			const port = createCodexThreadLink({
				session: onePageSession(fixture),
				epoch: fixture.store,
			});
			const bound = await port.classifyAndBind("pane-a", null, {
				...fixture.target,
				childId: replacement.validator.childId,
				epoch: replacement.validator.epoch,
			});

			expect(bound.link).toMatchObject({ state: "inspect_only", reason: "stale_child" });
		});
	});

	test("retains exact CAS identity and rejects stale responses", async () => {
		await withFixture(async (fixture) => {
			const replacement = createIdentityAuthority();
			const port = createCodexThreadLink({
				session: onePageSession(fixture),
				epoch: fixture.store,
			});
			const first = await port.classifyAndBind("pane-a", null, fixture.target);
			const second = await port.classifyAndBind("pane-a", first.cas, fixture.target);

			for (const expected of [
				first.cas,
				forgedCas(second.cas, { childId: replacement.validator.childId }),
				forgedCas(second.cas, { epoch: replacement.validator.epoch }),
				forgedCas(second.cas, { threadId: replacement.decoder.adoptThreadId("late") }),
				forgedCas(second.cas, { paneId: "other-pane" }),
			]) {
				await expectConflict(port.classifyAndBind("pane-a", expected, fixture.target));
			}
			expect(port.snapshot("pane-a")).toBe(second);
		});
	});

	test("copies and freezes source data when storing inspect-only links", () => {
		const authority = createIdentityAuthority();
		const bindings = createCodexThreadLinkBinding();
		const source = { custom: "integration" };
		const link = { ...inspectOnly(authority), source } as ThreadLinkNonExecutableSnapshot;
		const stored = bindings.compareAndSwap({ paneId: "pane-a", expected: null, next: link });

		source.custom = "mutated-after-bind";
		expect(stored.link.source).toEqual({ custom: "integration" });
		expect(Object.isFrozen(stored.link.source)).toBe(true);
	});

	test("rejects malformed or executable-looking snapshots at the public binding boundary", () => {
		const authority = createIdentityAuthority();
		const bindings = createCodexThreadLinkBinding();
		const valid = executable(authority);
		const cases: readonly unknown[] = [
			{ ...valid, state: "inspect_only", childId: null, epoch: null, reason: null },
			{ ...valid, source: { custom: "integration" } },
			{ ...valid, status: "systemError" },
			{ ...valid, loaded: false },
			{ ...inspectOnly(authority), reason: null },
			{ ...inspectOnly(authority), reason: "not-a-reason" },
		];

		for (const next of cases) {
			expect(() =>
				bindings.compareAndSwap({
					paneId: "pane-a",
					expected: null,
					next: next as ThreadLinkNonExecutableSnapshot,
				}),
			).toThrowError(expect.objectContaining({ code: "invalid_input" }));
		}
	});

	test("requires a fresh token to clear and prevents a second null-CAS writer", async () => {
		await withFixture(async (fixture) => {
			const port = createCodexThreadLink({
				session: onePageSession(fixture),
				epoch: fixture.store,
			});
			const bound = await port.classifyAndBind("pane-a", null, fixture.target);
			const cleared = port.clear("pane-a", bound.cas);

			expect(cleared.revision).toBe(2);
			expect(cleared.link.state).toBe("unbound");
			expect(() => port.clear("pane-a", null)).toThrowError(
				expect.objectContaining({ code: "conflict" }),
			);
		});
	});

	test("exposes one frozen port without an unchecked binding injection", async () => {
		await withFixture(async (fixture) => {
			const port = createCodexThreadLink({
				session: onePageSession(fixture),
				epoch: fixture.store,
			});

			expect(Object.isFrozen(port)).toBe(true);
			expect(typeof port.classify).toBe("function");
			expect(typeof port.classifyAndBind).toBe("function");
			expect(typeof port.compareAndSwap).toBe("function");
		});
	});

	test("reports a typed conflict with an actionable re-read message", () => {
		const bindings = createCodexThreadLinkBinding();
		const stale = bindings.snapshot("pane-a").cas;
		const empty: ThreadLinkSnapshot = {
			kind: "thread_link",
			state: "unbound",
			childId: null,
			epoch: null,
			threadId: null,
			source: null,
			status: "notLoaded",
			loaded: false,
			canAcceptDirectInput: false,
			reason: null,
		};
		bindings.compareAndSwap({
			paneId: "pane-a",
			expected: null,
			next: empty,
		});

		try {
			bindings.compareAndSwap({
				paneId: "pane-a",
				expected: stale,
				next: empty,
			});
			throw new Error("expected stale CAS to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(CodexThreadLinkConflictError);
			expect(error).toMatchObject({ code: "conflict" });
			expect(String(error)).toContain("re-read");
		}
	});
});

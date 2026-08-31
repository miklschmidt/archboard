import { describe, expect, test } from "bun:test";

import {
	CodexThreadLinkConflictError,
	createCodexThreadLink,
	createCodexThreadLinkBinding,
	type ThreadLink,
	type ThreadLinkCasToken,
	type ThreadLinkSnapshot,
} from "../index.ts";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.ts";

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

	test("binds one link with an exact pane, epoch, and link identity CAS", () => {
		const authority = createIdentityAuthority();
		const bindings = createCodexThreadLinkBinding();
		const link = executable(authority);
		const first = bindings.bind("pane-a", null, link);

		expect(first).toMatchObject({
			paneId: "pane-a",
			revision: 1,
			link,
			cas: {
				revision: 1,
				paneId: "pane-a",
				childId: authority.validator.childId,
				epoch: authority.validator.epoch,
				threadId: link.threadId,
			},
		});
		expect(bindings.read("pane-a")).toBe(first);
		expect(Object.isFrozen(first.cas)).toBe(true);
	});

	test("rejects stale responses and forged identity tokens without changing the binding", () => {
		const firstAuthority = createIdentityAuthority();
		const secondAuthority = createIdentityAuthority();
		const bindings = createCodexThreadLinkBinding();
		const first = bindings.bind("pane-a", null, executable(firstAuthority, "thread-a"));
		const second = bindings.bind("pane-a", first.cas, executable(secondAuthority, "thread-b"));

		for (const expected of [
			first.cas,
			forgedCas(second.cas, { childId: firstAuthority.validator.childId }),
			forgedCas(second.cas, { epoch: firstAuthority.validator.epoch }),
			forgedCas(second.cas, { threadId: firstAuthority.decoder.adoptThreadId("thread-a") }),
			forgedCas(second.cas, { paneId: "other-pane" }),
		]) {
			expect(() =>
				bindings.bind("pane-a", expected, executable(firstAuthority, "late")),
			).toThrowError(expect.objectContaining({ code: "conflict" }));
		}

		expect(bindings.snapshot("pane-a")).toBe(second);
	});

	test("rejects an executable response captured before the child epoch changed", () => {
		const oldAuthority = createIdentityAuthority();
		const replacement = createIdentityAuthority();
		let active = {
			childId: oldAuthority.validator.childId,
			epoch: oldAuthority.validator.epoch,
		};
		const bindings = createCodexThreadLinkBinding({ currentEpoch: () => active });

		active = {
			childId: replacement.validator.childId,
			epoch: replacement.validator.epoch,
		};
		expect(() => bindings.bind("pane-a", null, executable(oldAuthority))).toThrowError(
			expect.objectContaining({ code: "conflict" }),
		);
		expect(bindings.snapshot("pane-a").link.state).toBe("unbound");
		expect(bindings.bind("pane-a", null, executable(replacement)).link.state).toBe("executable");
	});

	test("requires a fresh token to clear and prevents a second null-CAS writer", () => {
		const authority = createIdentityAuthority();
		const bindings = createCodexThreadLinkBinding();
		const bound = bindings.bind("pane-a", null, executable(authority));
		const cleared = bindings.clear("pane-a", bound.cas);

		expect(cleared.revision).toBe(2);
		expect(cleared.link.state).toBe("unbound");
		expect(() => bindings.clear("pane-a", null)).toThrowError(
			expect.objectContaining({ code: "conflict" }),
		);
	});

	test("copies and freezes source data when storing inspect-only links", () => {
		const authority = createIdentityAuthority();
		const bindings = createCodexThreadLinkBinding();
		const source = { custom: "integration" };
		const link = { ...inspectOnly(authority), source } as ThreadLink;
		const stored = bindings.bind("pane-a", null, link);

		source.custom = "mutated-after-bind";
		expect(stored.link.source).toEqual({ custom: "integration" });
		expect(Object.isFrozen(stored.link.source)).toBe(true);
	});

	test("rejects malformed or executable-looking snapshots at the binding boundary", () => {
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
				bindings.compareAndSwap({ paneId: "pane-a", expected: null, next: next as ThreadLink }),
			).toThrowError(expect.objectContaining({ code: "invalid_input" }));
		}
	});

	test("combines classification and binding behind one frozen port", () => {
		const authority = createIdentityAuthority();
		const port = createCodexThreadLink({
			session: {
				threadListPage: async () => ({ data: [], nextCursor: null, backwardsCursor: null }),
				threadLoadedListPage: async () => ({ data: [], nextCursor: null }),
			},
			currentEpoch: {
				childId: authority.validator.childId,
				epoch: authority.validator.epoch,
			},
		});

		expect(Object.isFrozen(port)).toBe(true);
		expect(port.snapshot("pane-a").link.state).toBe("unbound");
		expect(typeof port.classify).toBe("function");
		expect(typeof port.compareAndSwap).toBe("function");
	});

	test("reports a typed conflict with an actionable re-read message", () => {
		const bindings = createCodexThreadLinkBinding();
		const stale = bindings.snapshot("pane-a").cas;
		const empty: ThreadLinkSnapshot = {
			kind: "thread_link" as const,
			state: "unbound" as const,
			childId: null,
			epoch: null,
			threadId: null,
			source: null,
			status: "notLoaded" as const,
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
			bindings.compareAndSwap({ paneId: "pane-a", expected: stale, next: empty });
			throw new Error("expected stale CAS to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(CodexThreadLinkConflictError);
			expect(error).toMatchObject({ code: "conflict" });
			expect(String(error)).toContain("re-read");
		}
	});
});

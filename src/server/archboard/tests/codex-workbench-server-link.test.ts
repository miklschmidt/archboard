import { describe, expect, test } from "bun:test";

import {
	createIdentityAuthority,
	type ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	createCodexThreadLinkBinding,
	type CodexThreadLinkPort,
	type InspectOnlyThreadLink,
} from "../../../runtime/codex-thread-link/index.js";
import { createServerThreadLink } from "../codex-workbench-adapters.js";

const authority = createIdentityAuthority();

/**
 * An inspect-only link, which the public store accepts without an epoch proof.
 * @param threadId The thread.
 * @returns The link.
 */
function inspectOnly(threadId: ThreadId): InspectOnlyThreadLink {
	return {
		kind: "thread_link",
		state: "inspect_only",
		childId: null,
		epoch: null,
		threadId,
		source: { custom: "integration" },
		status: "idle",
		loaded: true,
		canAcceptDirectInput: false,
		reason: "unknown_provenance",
	};
}

/**
 * A server link over a real compare-and-swap store, whose binds record the key
 * they were addressed to.
 * @returns The server port and the keys the store was asked about.
 */
function serverLink(): { readonly link: CodexThreadLinkPort; readonly keys: string[] } {
	const store = createCodexThreadLinkBinding();
	const keys: string[] = [];
	const bind: CodexThreadLinkPort["classifyAndBind"] = async (paneId, expected, target) => {
		keys.push(paneId);
		return store.compareAndSwap({
			paneId,
			expected,
			next: inspectOnly(target.threadId),
		});
	};
	const port: CodexThreadLinkPort = {
		...store,
		classify: () => Promise.reject(new Error("not used")),
		classifyAndBind: bind,
	};
	return { link: createServerThreadLink(port), keys };
}

describe("one thread link per server", () => {
	test("every pane reads the one link, labelled for the pane that asked", async () => {
		const { link, keys } = serverLink();
		const target = { threadId: authority.decoder.adoptThreadId("thread-a") } as never;
		const bound = await link.classifyAndBind("A", null, target);
		const seenFromB = link.read("B");

		expect(bound).toMatchObject({ paneId: "A", revision: 1, cas: { paneId: "A" } });
		expect(seenFromB).toMatchObject({ paneId: "B", revision: 1, cas: { paneId: "B" } });
		expect(seenFromB.link).toEqual(bound.link);
		expect(link.snapshot("C").revision).toBe(1);
		await link.classifyAndBind("B", seenFromB.cas, {
			threadId: authority.decoder.adoptThreadId("thread-b"),
		} as never);
		// Both binds reached one entry, whichever pane asked.
		expect(new Set(keys).size).toBe(1);
		expect(link.read("A").link.threadId).toBe(authority.decoder.adoptThreadId("thread-b"));
		expect(() => link.read("")).toThrow();
	});

	test("a swap takes any pane's current token and refuses one older than another pane's swap", async () => {
		const { link } = serverLink();
		link.compareAndSwap({
			paneId: "A",
			expected: null,
			next: inspectOnly(authority.decoder.adoptThreadId("thread-a")),
		});
		const staleFromA = link.read("A").cas;

		link.clear("B", link.read("B").cas);
		expect(link.read("A").link.state).toBe("unbound");
		expect(() =>
			link.compareAndSwap({
				paneId: "A",
				expected: staleFromA,
				next: inspectOnly(authority.decoder.adoptThreadId("thread-c")),
			}),
		).toThrow(expect.objectContaining({ code: "conflict" }));
		expect(
			link.compareAndSwap({
				paneId: "A",
				expected: link.read("A").cas,
				next: inspectOnly(authority.decoder.adoptThreadId("thread-c")),
			}).revision,
		).toBe(3);
	});

	test("a first binding from one pane refuses another pane's first binding", async () => {
		const { link } = serverLink();
		await link.classifyAndBind("A", null, {
			threadId: authority.decoder.adoptThreadId("thread-a"),
		} as never);

		await expect(
			link.classifyAndBind("B", null, {
				threadId: authority.decoder.adoptThreadId("thread-b"),
			} as never),
		).rejects.toMatchObject({ code: "conflict" });
		expect(link.read("B").link.threadId).toBe(authority.decoder.adoptThreadId("thread-a"));
	});
});

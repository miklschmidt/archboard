// The thread-link actions of one workhorse: New conversation from a pane of its checkout, and the
// start that work given to its checkout needs (ADR 0050).

import { expect, test } from "bun:test";

import { createIdentityAuthorities, type ThreadId } from "@archboard/codex-app-server/identity";
import { parseTabSessionId, workhorseLinkKey } from "#server/rules/tab-session/tab-session.ts";
import {
	clearServerThreadContextForLease,
	createServerThreadLinkActions,
} from "#server/services/actions/thread-links.ts";

/** The link key of the workhorse these actions belong to: one tab session's, in one checkout. */
const KEY = workhorseLinkKey(parseTabSessionId("tab-one")!, "/work/payments");

/**
 * Refuse a call the test does not expect.
 * @param name What was called.
 * @returns Never.
 */
function unused(name: string): never {
	throw new Error(`${name} was not expected.`);
}

/**
 * A coordinator that is ready and answers every start ready, recording which
 * start the create asked for.
 * @param starts Where each start is recorded.
 * @returns The coordinator double.
 */
function readyCoordinator(starts: string[] = []) {
	const ready = { state: "ready", reason: null } as const;
	return {
		snapshot: () => ready,
		ensure: async () => {
			starts.push("ensure");
			return ready;
		},
		replace: async () => {
			starts.push("replace");
			return ready;
		},
	} as never;
}

test("create replaces controller authority with the exact returned CAS proof", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("thread-exact");
	const operationId = authorities.operation.issuer.mintOperationId();
	const link = (revision: number) =>
		({
			paneId: "pane-1",
			revision,
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
				revision,
				paneId: "pane-1",
				childId: authorities.identity.validator.childId,
				epoch: authorities.identity.validator.epoch,
				threadId,
			},
		}) as const;
	const workhorseSnapshot = (binding: ReturnType<typeof link>) => ({
		kind: "codex_workhorse",
		state: "ready",
		paneId: "pane-1",
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		threadId,
		operationId,
		outcome: "delivered",
		start: null,
		binding,
		cleanup: null,
		reason: null,
	});
	let current = { token: { revision: 0 }, binding: null as unknown };
	const replacements: unknown[] = [];
	const semanticDelivery = {
		snapshot: () => current,
		compareAndSwap: (transition: { expected: { revision: number }; next: unknown }) => {
			expect(transition.expected).toEqual(current.token);
			replacements.push(transition.next);
			current = { token: { revision: current.token.revision + 1 }, binding: transition.next };
			return current;
		},
	};
	const actions = createServerThreadLinkActions({
		claimThread: () => undefined,
		retireThread: async () => unused("retireThread"),
		key: KEY,
		claimCoordinatorThread: () => undefined,
		coordinator: readyCoordinator(),
		identity: authorities,
		workhorse: {
			start: async () => workhorseSnapshot(link(1)),
		} as never,
		threadLink: {
			read: () => link(1),
		} as never,
		semanticDelivery: semanticDelivery as never,
	});
	const context = {
		browserId: "browser-1",
		connection: Object.freeze({}),
		paneId: "pane-1",
		tabSessionId: parseTabSessionId("tab-one")!,
		checkout: "/work/payments",
		commandId: authorities.identity.issuer.mintBrowserCommandId(),
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		linkRevision: 1,
		link: link(1).link,
	} as const;
	await actions.threadLinks.create({ command: "threadLinkCreate" } as never, context);

	expect(replacements).toEqual([expect.objectContaining({ paneId: "pane-1", link: link(1) })]);
});

test("a stale browser disconnect token cannot clear a newer controller binding", () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("thread-current");
	const binding = {
		paneId: "pane-1",
		target: {
			threadId,
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			operationId: String(authorities.operation.issuer.mintOperationId()),
		},
		link: { revision: 4 },
	};
	let clears = 0;
	const controller = {
		snapshot: () => ({ token: { revision: 8 }, binding }),
		compareAndSwap: (transition: { next: unknown }) => {
			clears += 1;
			expect(transition.next).toBeNull();
			return { token: { revision: 9 }, binding: null };
		},
	};
	clearServerThreadContextForLease(controller as never, { revision: 7 });
	expect(clears).toBe(0);
	clearServerThreadContextForLease(controller as never, { revision: 8 });
	expect(clears).toBe(1);
});

test("two panes of a tab creating at once leave one workhorse: the later create is refused before thread/start", async () => {
	const authorities = createIdentityAuthorities();
	const { childId, epoch } = authorities.identity.validator;
	const threadId = authorities.identity.decoder.adoptThreadId("thread-winner");
	const operationId = authorities.operation.issuer.mintOperationId();
	const unbound = {
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
	} as const;
	const created = (paneId: string) =>
		({
			paneId,
			revision: 1,
			link: {
				kind: "thread_link",
				state: "executable",
				childId,
				epoch,
				threadId,
				source: "appServer",
				status: "idle",
				loaded: true,
				canAcceptDirectInput: true,
				reason: null,
			},
			cas: { revision: 1, paneId, childId, epoch, threadId },
		}) as const;
	let serverRevision = 0;
	let releaseStart!: () => void;
	const startGate = new Promise<void>((resolve) => {
		releaseStart = resolve;
	});
	const starts: string[] = [];
	let binding: unknown = null;
	const actions = createServerThreadLinkActions({
		claimThread: () => undefined,
		retireThread: async () => unused("retireThread"),
		key: KEY,
		claimCoordinatorThread: () => undefined,
		coordinator: readyCoordinator(),
		identity: authorities,
		workhorse: {
			start: async ({ paneId }: { readonly paneId: string }) => {
				starts.push(paneId);
				await startGate;
				serverRevision = 1;
				return {
					state: "ready",
					paneId,
					childId,
					epoch,
					threadId,
					operationId,
					binding: created(paneId),
				};
			},
		} as never,
		threadLink: {
			read: (paneId: string) =>
				serverRevision === 0
					? {
							paneId,
							revision: 0,
							link: unbound,
							cas: { revision: 0, paneId, childId: null, epoch: null, threadId: null },
						}
					: created(paneId),
		} as never,
		semanticDelivery: {
			snapshot: () => ({ token: { revision: binding === null ? 0 : 1 }, binding }),
			compareAndSwap: (transition: { readonly next: unknown }) => {
				binding = transition.next;
				return { token: { revision: 1 }, binding };
			},
		} as never,
	});
	const contextFor = (paneId: string) =>
		({
			browserId: `browser-${paneId}`,
			connection: Object.freeze({}),
			paneId,
			tabSessionId: parseTabSessionId("tab-one")!,
			checkout: "/work/payments",
			commandId: authorities.identity.issuer.mintBrowserCommandId(),
			childId,
			epoch,
			linkRevision: 0,
			link: unbound,
		}) as const;
	const first = actions.threadLinks.create(
		{ command: "threadLinkCreate" } as never,
		contextFor("A"),
	);
	const second = actions.threadLinks.create(
		{ command: "threadLinkCreate" } as never,
		contextFor("B"),
	);
	releaseStart();

	expect(await first).toEqual({ outcome: "delivered" });
	expect(second).rejects.toThrow();
	await second.catch(() => undefined);
	// One thread/start, under the workhorse's link: the losing create never
	// reached the workhorse, so the workhorse snapshot stays the winner's ready one.
	expect(starts).toEqual([KEY]);
	expect(binding).toMatchObject({ target: { threadId } });
});

/**
 * One pane's create context, on an unbound link or on the conversation it holds.
 * @param authorities The identity authorities.
 * @param threadId The conversation the pane holds, or null.
 * @returns The context.
 */
function createContext(
	authorities: ReturnType<typeof createIdentityAuthorities>,
	threadId: ThreadId | null,
) {
	const { childId, epoch } = authorities.identity.validator;
	return {
		browserId: "browser-A",
		connection: Object.freeze({}),
		paneId: "A",
		tabSessionId: parseTabSessionId("tab-one")!,
		checkout: "/work/payments",
		commandId: authorities.identity.issuer.mintBrowserCommandId(),
		childId,
		epoch,
		linkRevision: 0,
		link:
			threadId === null
				? { threadId: null, childId: null, epoch: null }
				: { threadId, childId, epoch },
	} as never;
}

test("a create whose coordinator cannot start is refused with its reason and starts no workhorse", async () => {
	const authorities = createIdentityAuthorities();
	const reason = "Coordinator model selection failed.";
	const failed = { state: "failed", reason } as const;
	const workhorseStarts: unknown[] = [];
	const actions = createServerThreadLinkActions({
		claimThread: () => undefined,
		retireThread: async () => unused("retireThread"),
		key: KEY,
		claimCoordinatorThread: () => undefined,
		coordinator: {
			snapshot: () => failed,
			ensure: async () => failed,
			replace: async () => failed,
		} as never,
		identity: authorities,
		workhorse: {
			start: async (input: unknown) => {
				workhorseStarts.push(input);
				throw new Error("The workhorse must not start.");
			},
		} as never,
		threadLink: {
			read: () => ({ cas: { revision: 0, childId: null, epoch: null, threadId: null } }),
		} as never,
		semanticDelivery: undefined as never,
	});
	await expect(
		actions.threadLinks.create(
			{ command: "threadLinkCreate" } as never,
			createContext(authorities, null),
		),
	).rejects.toThrow(reason);
	expect(workhorseStarts).toEqual([]);
});

test("a new conversation keeps the tab's coordinator and readies it before its workhorse starts", async () => {
	const authorities = createIdentityAuthorities();
	const { childId, epoch } = authorities.identity.validator;
	const threadId = authorities.identity.decoder.adoptThreadId("thread-old");
	const starts: string[] = [];
	const actions = createServerThreadLinkActions({
		claimThread: () => undefined,
		retireThread: async () => unused("retireThread"),
		key: KEY,
		claimCoordinatorThread: () => undefined,
		coordinator: readyCoordinator(starts),
		identity: authorities,
		workhorse: {
			start: async () => {
				starts.push("workhorse");
				throw new Error("Stop after the workhorse start.");
			},
		} as never,
		threadLink: {
			read: () => ({ cas: { revision: 0, childId, epoch, threadId } }),
		} as never,
		semanticDelivery: undefined as never,
	});
	await actions.threadLinks
		.create({ command: "threadLinkCreate" } as never, createContext(authorities, threadId))
		.catch(() => undefined);
	// The coordinator speaks for every workhorse of the tab, so one checkout's new conversation
	// keeps it (ADR 0050).
	expect(starts).toEqual(["ensure", "workhorse"]);
});

test("a new conversation gives up the workhorse thread the old one ran on once the new one is linked", async () => {
	const authorities = createIdentityAuthorities();
	const { childId, epoch } = authorities.identity.validator;
	const adopt = (raw: string) => authorities.identity.decoder.adoptThreadId(raw);
	const [left, fresh] = [adopt("thread-left"), adopt("thread-fresh")];
	const cas = { revision: 1, paneId: "tab-one", childId, epoch, threadId: fresh };
	const link = { ...cas, state: "executable", kind: "thread_link", source: "appServer" };
	const retired: ThreadId[] = [];
	const ready = { state: "ready", reason: null } as const;
	const actions = createServerThreadLinkActions({
		claimThread: () => undefined,
		retireThread: async (threadId) => {
			retired.push(threadId);
			return { threadId, outcome: "unsubscribed" };
		},
		key: KEY,
		claimCoordinatorThread: () => undefined,
		coordinator: { snapshot: () => ready, ensure: async () => ready } as never,
		identity: authorities,
		workhorse: {
			start: async () => ({
				...cas,
				state: "ready",
				operationId: authorities.operation.issuer.mintOperationId(),
				binding: { paneId: "tab-one", revision: 1, link, cas },
			}),
		} as never,
		threadLink: { read: () => ({ cas: { revision: 0, childId, epoch, threadId: left } }) } as never,
		semanticDelivery: {
			snapshot: () => ({ token: { revision: 0 }, binding: null }),
			compareAndSwap: () => ({ token: { revision: 1 } }),
		} as never,
	});

	expect(
		await actions.threadLinks.create(
			{ command: "threadLinkCreate" } as never,
			createContext(authorities, left),
		),
	).toEqual({ outcome: "delivered" });
	expect(retired).toEqual([left]);
});

test("work given to a checkout starts its workhorse when its link cannot run turns, and only then, leaving the coordinator that gave it alone", async () => {
	const authorities = createIdentityAuthorities();
	const { childId, epoch } = authorities.identity.validator;
	const threadId = authorities.identity.decoder.adoptThreadId("thread-started");
	const cas = { revision: 1, paneId: KEY, childId, epoch, threadId };
	const link = { ...cas, state: "executable", kind: "thread_link", source: "appServer" };
	const unbound = { revision: 0, paneId: KEY, childId: null, epoch: null, threadId: null };
	let current: { readonly link: { readonly state: string }; readonly cas: unknown } = {
		link: { state: "unbound" },
		cas: unbound,
	};
	const starts: unknown[] = [];
	const coordinatorStarts: string[] = [];
	const actions = createServerThreadLinkActions({
		claimThread: () => undefined,
		retireThread: async () => unused("retireThread"),
		key: KEY,
		claimCoordinatorThread: () => undefined,
		coordinator: readyCoordinator(coordinatorStarts),
		identity: authorities,
		workhorse: {
			start: async (input: unknown) => {
				starts.push(input);
				current = { link, cas };
				return {
					...cas,
					state: "ready",
					operationId: authorities.operation.issuer.mintOperationId(),
					binding: { paneId: KEY, revision: 1, link, cas },
				};
			},
		} as never,
		threadLink: { read: () => current } as never,
		semanticDelivery: {
			snapshot: () => ({ token: { revision: 0 }, binding: null }),
			compareAndSwap: () => ({ token: { revision: 1 } }),
		} as never,
	});

	await actions.ensureStarted();
	await actions.ensureStarted();
	expect(starts).toEqual([{ paneId: KEY, expected: unbound }]);
	// The coordinator is running the turn that gives the work. Readying it again would show it
	// unready to that turn's other calls while it re-proved itself.
	expect(coordinatorStarts).toEqual([]);
});

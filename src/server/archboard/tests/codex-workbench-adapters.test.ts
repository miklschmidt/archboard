import { expect, test } from "bun:test";

import {
	createIdentityAuthorities,
	type ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import { parseTabSessionId } from "../../codex-workbench/index.js";
import { createDynamicAuthorityTokenIssuer } from "../../../runtime/codex-dynamic-tools/index.js";
import {
	clearServerThreadContextForLease,
	createServerDynamicOperationIdAdapter,
	createServerThreadLinkActions,
	presentingPane,
} from "../codex-workbench-adapters.js";

test("server-started work presents through the bound pane while it is open, another once it is not, and a recording page's only when nothing else is open", () => {
	const panes = [
		{ paneId: "pane-left", focused: false },
		{ paneId: "pane-focused", focused: true },
		{ paneId: "pane-bound", focused: false },
	];
	expect(presentingPane("pane-bound", panes)).toBe(panes[2]!);
	// The conversation belongs to the server: closing the pane that made it
	// moves presentation to the pane the person is in, not to a refusal.
	expect(presentingPane("pane-gone", panes)).toBe(panes[1]!);
	expect(presentingPane(null, panes)).toBe(panes[1]!);
	// With nobody focused, the first pane in reading order.
	const unfocused = [
		{ paneId: "pane-left", focused: false },
		{ paneId: "pane-right", focused: false },
	];
	expect(presentingPane("pane-gone", unfocused)).toBe(unfocused[0]!);
	expect(() => presentingPane("pane-bound", [])).toThrow();
	// A recording page presents the same id as the person's pane and comes first in reading
	// order; the person's pane is what the work presents through while it is open.
	const recorded = [
		{ paneId: "A", focused: false, recording: true as const },
		{ paneId: "A", focused: false },
	];
	expect(presentingPane("A", recorded)).toBe(recorded[1]!);
	expect(presentingPane(null, recorded)).toBe(recorded[1]!);
	expect(presentingPane("A", [recorded[0]!])).toBe(recorded[0]!);
});

test("the production dynamic authority token issuer retires exact opaque capabilities", () => {
	const issuer = createDynamicAuthorityTokenIssuer();
	const first = issuer.issue();
	const second = issuer.issue();
	expect(first).not.toBe(second);
	expect(issuer.owns(first)).toBeTrue();
	issuer.retire(first);
	expect(issuer.owns(first)).toBeFalse();
	expect(issuer.owns(second)).toBeTrue();
	issuer.retireAll();
	expect(issuer.owns(second)).toBeFalse();
});

test("the production operation adapter shares authority and terminalizes exactly once", () => {
	const authorities = createIdentityAuthorities();
	const adapter = createServerDynamicOperationIdAdapter(authorities.operation);
	const operationId = adapter.issueCanonicalOperationId();

	adapter.validateCurrentUnconsumedOperationId(operationId);
	expect(adapter.serializeForOwnedWireFields(operationId)).toBe(String(operationId));
	const terminal = adapter.terminalizeCanonicalOperationId({
		operationId,
		disposition: "consumed",
	});
	expect(adapter.readCanonicalOperationTerminalResult(operationId)).toBe(terminal);
	expect(() => adapter.validateCurrentUnconsumedOperationId(operationId)).toThrow(
		"already terminal",
	);
	expect(adapter.terminalizeCanonicalOperationId({ operationId, disposition: "consumed" })).toBe(
		terminal,
	);
	expect(() =>
		adapter.terminalizeCanonicalOperationId({ operationId, disposition: "retired" }),
	).toThrow("different terminal disposition");
});

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
		commandId: authorities.identity.issuer.mintBrowserCommandId(),
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		linkRevision: 1,
		link: link(1).link,
	} as const;
	await actions.create({ command: "threadLinkCreate" } as never, context);

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

test("two panes creating at once leave one workhorse: the later create is refused before thread/start", async () => {
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
			commandId: authorities.identity.issuer.mintBrowserCommandId(),
			childId,
			epoch,
			linkRevision: 0,
			link: unbound,
		}) as const;
	const first = actions.create({ command: "threadLinkCreate" } as never, contextFor("A"));
	const second = actions.create({ command: "threadLinkCreate" } as never, contextFor("B"));
	releaseStart();

	expect(await first).toEqual({ outcome: "delivered" });
	expect(second).rejects.toThrow();
	await second.catch(() => undefined);
	// One thread/start: the losing create never reached the workhorse, so the
	// workhorse snapshot stays the winner's ready one.
	expect(starts).toEqual(["A"]);
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
		actions.create({ command: "threadLinkCreate" } as never, createContext(authorities, null)),
	).rejects.toThrow(reason);
	expect(workhorseStarts).toEqual([]);
});

test("a new conversation replaces the coordinator that carried the old one before its workhorse starts", async () => {
	const authorities = createIdentityAuthorities();
	const { childId, epoch } = authorities.identity.validator;
	const threadId = authorities.identity.decoder.adoptThreadId("thread-old");
	const starts: string[] = [];
	const actions = createServerThreadLinkActions({
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
	await actions
		.create({ command: "threadLinkCreate" } as never, createContext(authorities, threadId))
		.catch(() => undefined);
	expect(starts).toEqual(["replace", "workhorse"]);
});

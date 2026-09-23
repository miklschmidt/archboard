import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createDynamicAuthorityTokenIssuer } from "../../../runtime/codex-dynamic-tools/index.js";
import {
	clearCanvasThreadContextForLease,
	createCanvasDynamicOperationIdAdapter,
	createCanvasThreadLinkActions,
	presentingPane,
} from "../codex-workbench-adapters.js";

test("host-started work presents through the bound pane while it is open, and another once it is not", () => {
	const panes = [
		{ paneId: "pane-left", focused: false },
		{ paneId: "pane-focused", focused: true },
		{ paneId: "pane-bound", focused: false },
	];
	expect(presentingPane("pane-bound", panes)).toBe(panes[2]!);
	// The conversation belongs to the canvas: closing the pane that made it
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
	const adapter = createCanvasDynamicOperationIdAdapter(authorities.operation);
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

test("create, attach, and relink replace controller authority with the exact returned CAS proof", async () => {
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
	let nextBinding = link(2);
	const classifiedTargets: unknown[] = [];
	const actions = createCanvasThreadLinkActions({
		candidates: {
			read: () => ({ kind: "codex_thread_candidates", state: "unknown" }),
			refresh: async () =>
				({ candidates: [{ selectionId: "selection-fresh", threadId }] }) as never,
			threadIdFor: (selectionId: string) =>
				selectionId === "selection-published" ? threadId : null,
			// The epoch stub below never moves, so the published list stays current.
			generation: () => "1:hash",
			invalidate: () => undefined,
		},
		workhorse: {
			start: async () => workhorseSnapshot(link(1)),
			snapshot: () => workhorseSnapshot(nextBinding),
		} as never,
		threadLink: {
			read: () => link(1),
			classify: async () => ({}) as never,
			bindCandidate: async (_paneId: string, _expected: unknown, selectionId: string) => {
				classifiedTargets.push(selectionId);
				return nextBinding;
			},
		} as never,
		semanticDelivery: semanticDelivery as never,
		epoch: {
			snapshot: () =>
				({
					cas: { revision: 1, bytesHash: "hash" },
					manifest: {
						activeEpoch: {
							childId: authorities.identity.validator.childId,
							epoch: authorities.identity.validator.epoch,
							operationId,
						},
						records: [
							{
								status: "committed",
								correlation: {
									childId: authorities.identity.validator.childId,
									epoch: authorities.identity.validator.epoch,
									operationId,
								},
								operation: { id: operationId, kind: "create_thread", rpc: "thread/start" },
								provenance: { threadId },
							},
						],
					},
				}) as never,
			assertCurrent: () => ({}) as never,
		} as never,
		identity: authorities,
		checkoutRoot: "/workspace/archboard",
	});
	const context = {
		browserId: "browser-1",
		connection: Object.freeze({}),
		paneId: "pane-1",
		commandId: authorities.identity.issuer.mintBrowserCommandId(),
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		linkRevision: 1,
		link: link(1).link,
	} as const;
	await actions.create({ command: "threadLinkCreate" } as never, context);
	await actions.attach(
		{ command: "threadLinkAttach", selectionId: "selection-published", threadId } as never,
		context,
	);
	nextBinding = link(3);
	await actions.relink(
		{ command: "threadLinkRelink", selectionId: "selection-published", threadId } as never,
		context,
	);

	expect(replacements).toHaveLength(3);
	expect(replacements).toEqual([
		expect.objectContaining({ paneId: "pane-1", link: link(1) }),
		expect.objectContaining({ paneId: "pane-1", link: link(2) }),
		expect.objectContaining({ paneId: "pane-1", link: link(3) }),
	]);
	// The thread already had an ownership record, so both binds consumed the
	// person's own retained selection rather than a re-resolved one.
	expect(classifiedTargets).toEqual(["selection-published", "selection-published"]);
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
	clearCanvasThreadContextForLease(controller as never, { revision: 7 });
	expect(clears).toBe(0);
	clearCanvasThreadContextForLease(controller as never, { revision: 8 });
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
	let canvasRevision = 0;
	let releaseStart!: () => void;
	const startGate = new Promise<void>((resolve) => {
		releaseStart = resolve;
	});
	const starts: string[] = [];
	let binding: unknown = null;
	const actions = createCanvasThreadLinkActions({
		candidates: {} as never,
		workhorse: {
			start: async ({ paneId }: { readonly paneId: string }) => {
				starts.push(paneId);
				await startGate;
				canvasRevision = 1;
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
				canvasRevision === 0
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
		epoch: {} as never,
		identity: authorities,
		checkoutRoot: "/workspace/archboard",
	});
	const contextFor = (paneId: string) =>
		({
			browserId: `browser-${paneId}`,
			connection: Object.freeze({}),
			paneId,
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

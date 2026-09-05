import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createDynamicAuthorityTokenIssuer } from "../../../runtime/codex-dynamic-tools/index.js";
import {
	clearCanvasThreadContextForLease,
	createCanvasDynamicOperationIdAdapter,
	createCanvasThreadLinkActions,
	requireExactSemanticPane,
} from "../codex-workbench-adapters.js";

test("semantic capture follows the controller pane across same-board focus and rebinds", () => {
	const panes = [
		{ paneId: "pane-focused", clientId: "focused", board: "shared", focused: true },
		{ paneId: "pane-bound", clientId: "bound", board: "shared", focused: false },
	];
	const select = (bindingPaneId: string | null, contextBoard = "shared") =>
		requireExactSemanticPane({
			bindingPaneId,
			contextBoard,
			panes,
			boardForPane: (pane) => pane.board,
		});
	expect(select("pane-bound")).toBe(panes[1]!);
	expect(select("pane-focused")).toBe(panes[0]!);
	expect(() => select(null)).toThrow("no current thread-context binding");
	expect(() => select("pane-bound", "stale-board")).toThrow("does not own board stale-board");
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

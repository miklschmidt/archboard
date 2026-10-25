import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { CODEX_REALTIME_MS } from "@archboard/timing";
import {
	createDefaultWorkbenchHost,
	type DefaultWorkbenchHostInput,
} from "#server/services/host/default.ts";
import type { CodexWorkbenchDomainScope } from "#server/protocol/generation/domain.ts";
import type { WorkbenchContextSource } from "#runtime/protocol/host/context-source.ts";
import type { WorkbenchOperationAuthority } from "#server/protocol/generation/host.ts";
import type { ThreadLinkBindingSnapshot } from "#runtime/rules/thread-link/contract.ts";
import { parseTabSessionId, workhorseLinkKey } from "#server/rules/tab-session/tab-session.ts";
import { TEST_INSTRUCTIONS } from "#tests/runtime/support/host.ts";

function contextSource() {
	let onRead: (() => void) | null = null;
	const source: WorkbenchContextSource = {
		read: () => {
			onRead?.();
			return "The actual host task.";
		},
		subscribe: () => () => {},
	};
	return {
		source,
		setRead: (next: (() => void) | null) => {
			onRead = next;
		},
	};
}

function harness(options: Partial<DefaultWorkbenchHostInput> = {}) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "workbench-host-")));
	const ids = createIdentityAuthorities();
	const identity = ids.identity;
	const childId = identity.validator.childId;
	const epoch = identity.validator.epoch;
	const threadId = identity.decoder.adoptThreadId("workhorse");
	const coordinatorId = identity.decoder.adoptThreadId("coordinator");
	const operationId = ids.operation.issuer.mintOperationId();
	const id = parseTabSessionId("host-tab");
	if (id === null) throw new Error("The test tab session is invalid.");
	const key = workhorseLinkKey(id, root);
	const link = {
		kind: "thread_link" as const,
		state: "executable" as const,
		childId,
		epoch,
		threadId,
		source: "appServer" as const,
		status: "idle" as const,
		loaded: true as const,
		canAcceptDirectInput: true as const,
		reason: null,
	};
	let binding: ThreadLinkBindingSnapshot = {
		linkKey: key,
		revision: 1,
		link,
		cas: { linkKey: key, revision: 1, childId, epoch, threadId },
	};
	let live = true;
	const proofRequests: unknown[] = [];
	const workhorse = {
		checkout: root,
		key,
		state: { activeTurn: null },
		components: {
			workhorse: {
				snapshot: () => ({
					state: "ready",
					chatId: key,
					childId,
					epoch,
					threadId,
					operationId,
					binding,
				}),
			},
		},
	};
	const workhorses = new Map([[root, workhorse]]);
	const session = {
		id,
		state: { phase: "live" },
		workhorses,
		voiceWorkhorse: () => workhorse,
		components: {
			coordinator: {
				snapshot: () => ({ state: "ready", threadId: coordinatorId, childId, epoch }),
			},
			realtime: { generation: () => null },
		},
	};
	const scope = {
		identity: ids,
		assertCurrent: () => {
			if (!live) throw new Error("The test generation is retired.");
		},
		sessions: { list: () => [session] },
		threadLink: { read: () => binding },
		epoch: {
			assertCurrent: (request: unknown) => {
				proofRequests.push(request);
				return {
					record: {
						correlation: { childId, epoch, operationId },
						provenance: { childId, epoch, threadId },
					},
				};
			},
		},
	} as unknown as CodexWorkbenchDomainScope;
	const host = createDefaultWorkbenchHost(
		{ instructions: TEST_INSTRUCTIONS, allowedCheckouts: [root], ...options },
		{
			shownCheckoutOf: () => root,
			shownConversationOf: () => root,
			onShownChange: () => () => {},
		},
	);
	const authority: WorkbenchOperationAuthority = {
		tabSessionId: id,
		checkout: root,
		clientId: null,
		childId,
		epoch,
		threadId,
		linkRevision: 1,
	};
	const retire = host.onGeneration?.(scope);
	return {
		root,
		ids,
		id,
		key,
		host,
		authority,
		proofRequests,
		workhorses,
		replaceBinding: () => {
			binding = { ...binding, revision: binding.revision + 1 };
		},
		retire: () => {
			live = false;
			retire?.();
		},
		close: () => {
			live = false;
			retire?.();
			rmSync(root, { recursive: true, force: true });
		},
	};
}
const OPERATION = {
	id: "requested-operation",
	kind: "send_message_to_thread",
	rpc: "turn/start",
} as const;

describe("the default workbench host", () => {
	test("admits real checkout directories, labels each by its directory and captures the allowed list", () => {
		const h = harness();
		try {
			expect(h.host.resolveCheckout(h.root)).toBe(h.root);
			const alias = `${h.root}-alias`;
			symlinkSync(h.root, alias, "dir");
			try {
				expect(h.host.resolveCheckout(alias)).toBe(h.root);
			} finally {
				rmSync(alias);
			}
			expect(h.host.resolveCheckout(tmpdir())).toBeNull();
			expect(h.host.checkoutLabel(h.root)).toBe(basename(h.root));
			expect(h.host.coordinatorContextFor(h.id).read()).toContain(h.root);
			expect(h.host.voiceFor(h.id).start(null)).toMatchObject({
				suppressCoordinatorSpeech: false,
				delegationAckFiller: true,
			});
		} finally {
			h.close();
		}
	});

	test("reads checkout admission callbacks live without overriding the core selectors", () => {
		let admitted = true;
		const h = harness({ allowedCheckouts: (named) => (admitted ? named : null) });
		try {
			expect(h.host.resolveCheckout(h.root)).toBe(h.root);
			expect(h.host.shownConversationOf(h.id)).toBe(h.root);
			admitted = false;
			expect(h.host.resolveCheckout(h.root)).toBeNull();
			expect(() => h.host.contextForOperation(h.authority, OPERATION)).toThrow();
		} finally {
			h.close();
		}
	});

	test("builds immutable operation context from exact authority and canonical host text", () => {
		const source = contextSource();
		const h = harness({ context: source.source });
		try {
			const context = h.host.contextForOperation(h.authority, OPERATION);
			expect(context.child).toEqual({ id: h.authority.childId, epoch: h.authority.epoch });
			expect(context.workhorse.threadId).toBe(h.authority.threadId);
			expect(context.brief.text).toBe("The actual host task.");
			expect(context.brief.freshUntilMs - context.brief.capturedAtMs).toBe(
				CODEX_REALTIME_MS.contextFreshness,
			);
			expect(context.operation).toEqual({ ...OPERATION, outcome: null });
			expect(Object.isFrozen(context.brief)).toBe(true);
			expect(h.proofRequests).toHaveLength(2);
			expect(h.host.contextCodec.key).toBe("workbench_context");
			const reversed = Object.fromEntries(Object.entries(context).toReversed()) as typeof context;
			expect(h.host.contextCodec.encode(context)).toBe(h.host.contextCodec.encode(reversed));
		} finally {
			h.close();
		}
	});

	test("refuses a stale operation revision before the host can read and a replaced link after capture", () => {
		const source = contextSource();
		const h = harness({ context: source.source });
		let reads = 0;
		source.setRead(() => {
			reads++;
		});
		try {
			expect(() =>
				h.host.contextForOperation({ ...h.authority, linkRevision: 0 }, OPERATION),
			).toThrow();
			expect(reads).toBe(0);
			source.setRead(h.replaceBinding);
			expect(() => h.host.contextForOperation(h.authority, OPERATION)).toThrow();
			h.retire();
			expect(() => h.host.contextForOperation(h.authority, OPERATION)).toThrow();
		} finally {
			h.close();
		}
	});
});

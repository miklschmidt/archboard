import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { CODEX_REALTIME_MS } from "@archboard/timing";
import {
	createDefaultWorkbenchHost,
	type DefaultWorkbenchHostInput,
} from "#server/services/host/default.ts";
import type { CodexWorkbenchDomainScope } from "#server/protocol/generation/domain.ts";
import type {
	WorkbenchContextEvent,
	WorkbenchContextSource,
} from "#runtime/protocol/host/context-source.ts";
import type { CoordinatorHostContextSource } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type { WorkbenchOperationAuthority } from "#server/protocol/generation/host.ts";
import type { ThreadLinkBindingSnapshot } from "#runtime/rules/thread-link/contract.ts";
import { parseTabSessionId, workhorseLinkKey } from "#server/rules/tab-session/tab-session.ts";
import { TEST_INSTRUCTIONS } from "#tests/runtime/support/host.ts";

function contextSource() {
	const listeners = new Set<() => void>();
	const errors = new Set<(error: Error) => void>();
	let text = "The actual host task.";
	let onRead: (() => void) | null = null;
	let failure: Error | null = null;
	let stops = 0;
	const source: WorkbenchContextSource = {
		read: () => {
			onRead?.();
			if (failure !== null) throw failure;
			return text;
		},
		subscribe: (listener, error) => {
			listeners.add(listener);
			errors.add(error);
			return () => {
				stops++;
				listeners.delete(listener);
				errors.delete(error);
			};
		},
	};
	return {
		source,
		listeners,
		setText: (next: string) => {
			text = next;
		},
		setRead: (next: (() => void) | null) => {
			onRead = next;
		},
		fail: (error: Error) => {
			failure = error;
		},
		emit: () => {
			for (const listener of listeners) listener();
		},
		emitError: (error: Error) => {
			for (const listener of errors) listener(error);
		},
		stops: () => stops,
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
		paneId: key,
		revision: 1,
		link,
		cas: { paneId: key, revision: 1, childId, epoch, threadId },
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
					paneId: key,
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
	test("admits real checkout directories without a vault and captures the allowed list", () => {
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
			expect(h.host.coordinatorContextFor(h.id).read()).toContain(h.root);
			expect(h.host.sessionContextFor(h.id).publisher.freshBrief().brief).toContain(h.root);
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
			expect(context.paneId).toBe(h.key);
			expect(context.semantic.brief).toBe("The actual host task.");
			expect(context.semantic.freshUntilMs - context.semantic.capturedAtMs).toBe(
				CODEX_REALTIME_MS.contextFreshness,
			);
			expect(context.operation).toEqual({ ...OPERATION, outcome: null });
			expect(Object.isFrozen(context.semantic)).toBe(true);
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

	test("emits exact immutable events and callback sources only for actual context invalidations", () => {
		const source = contextSource();
		const h = harness({ context: source.source });
		try {
			const workhorse = h.host.workhorseContextFor(h.id, h.root);
			const voice = h.host.sessionContextFor(h.id);
			const events: WorkbenchContextEvent[] = [];
			const callbacks: CoordinatorHostContextSource[] = [];
			workhorse.publisher.subscribeSettledChange((event) => events.push(event));
			voice.callbacks.subscribe((event) => callbacks.push(event));
			expect(events).toHaveLength(0);
			expect(callbacks).toHaveLength(0);
			source.setText("The host task changed.");
			source.emit();
			expect(events).toHaveLength(1);
			expect(callbacks).toHaveLength(1);
			const event = events[0]!;
			expect(event.child).toEqual({ id: h.authority.childId, epoch: h.authority.epoch });
			expect(event.workhorse.threadId).toBe(h.authority.threadId);
			expect(event.feedId).toBe(workhorse.feedId);
			expect(event.cursor).toEqual({ feedId: workhorse.feedId, sequence: 1 });
			expect(Object.isFrozen(event.change.cursor)).toBe(true);
			expect(callbacks[0]!.context.brief).toBe("The host task changed.");
			expect(workhorse.contextForEvent(event).semantic.brief).toBe(event.brief);
			h.replaceBinding();
			expect(h.host.workhorseContextFor(h.id, h.root)).toBe(workhorse);
			source.emit();
			expect(events[1]!.cursor?.sequence).toBe(2);
			workhorse.publisher.dispose();
			workhorse.publisher.dispose();
			voice.publisher.dispose();
			expect(source.listeners.size).toBe(0);
			expect(source.stops()).toBe(2);
		} finally {
			h.close();
		}
	});

	test("drops a context invalidation when authority changes during the host read", () => {
		const source = contextSource();
		const h = harness({ context: source.source });
		try {
			const owner = h.host.workhorseContextFor(h.id, h.root);
			const events: WorkbenchContextEvent[] = [];
			owner.publisher.subscribeSettledChange((event) => events.push(event));
			source.setRead(h.replaceBinding);
			source.emit();
			expect(events).toHaveLength(0);
			source.setRead(null);
			source.emit();
			expect(events[0]!.cursor?.sequence).toBe(1);
			h.retire();
			expect(source.listeners.size).toBe(0);
			source.emit();
			expect(events).toHaveLength(1);
		} finally {
			h.close();
		}
	});

	test("reports source failures and releases all subscriptions when the generation retires", () => {
		const source = contextSource();
		const failures: unknown[] = [];
		const h = harness({ context: source.source, onFatal: (error) => failures.push(error) });
		try {
			h.host.workhorseContextFor(h.id, h.root);
			h.host.sessionContextFor(h.id);
			const error = new Error("The host context is unavailable.");
			source.fail(error);
			source.emit();
			source.emitError(error);
			expect(failures.every((failure) => failure === error)).toBe(true);
			expect(failures.length).toBeGreaterThan(0);
			h.retire();
			expect(source.listeners.size).toBe(0);
		} finally {
			h.close();
		}
	});
});

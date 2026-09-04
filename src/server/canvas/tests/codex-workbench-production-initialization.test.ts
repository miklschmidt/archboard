import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	createBrowserLeaseLedger,
	createCodexWorkbenchGateway,
} from "../../codex-workbench/index.js";
import { createCanvasCodexWorkbenchInstallation } from "../codex-workbench-production.js";
import type { CodexWorkbenchComponents } from "../codex-workbench-generation.js";
import type { CodexWorkbenchGenerationInput } from "../codex-workbench-owner.js";
import { createCodexWorkbenchGenerationFixture } from "./support/codex-workbench-generation-fixture.js";
import { identities, waitOwnerFor } from "./support/codex-workbench-terminal-fixture.js";
import { runningProcessFacts } from "./support/codex-workbench-process-fixture.js";

function generationInput(generation: number): CodexWorkbenchGenerationInput {
	return {
		generation,
		process: { stop: async () => undefined },
	} as unknown as CodexWorkbenchGenerationInput;
}

function deferred(): {
	readonly promise: Promise<void>;
	readonly resolve: () => void;
} {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => void (resolve = done));
	return { promise, resolve };
}

function installation(host: Record<string, unknown> = {}) {
	const root = mkdtempSync(join(tmpdir(), "archboard-production-activation-"));
	const prior = process.env.XDG_STATE_HOME;
	process.env.XDG_STATE_HOME = root;
	try {
		return {
			root,
			value: createCanvasCodexWorkbenchInstallation({
				checkoutRoot: "/repo",
				...host,
			} as never),
		};
	} finally {
		if (prior === undefined) delete process.env.XDG_STATE_HOME;
		else process.env.XDG_STATE_HOME = prior;
	}
}

describe("production Codex generation ownership", () => {
	test("a settled or replaced generation leaves no reachable owners behind", async () => {
		const owned = installation();
		try {
			const created = {
				identity: createIdentityAuthorities(createIdentityLedger()),
				epoch: {},
				threadLink: {},
				transport: { inspect: () => ({ state: "open" }) },
			} as unknown as CodexWorkbenchComponents;
			const first = generationInput(1);
			const adapters = owned.value.bindings(first).dynamicAdapters;
			const approval = adapters.approval(created);
			const lifecycle = adapters.lifecycle(created);
			// The kernel and generation calls of one generation share one record.
			expect(owned.value.bindings(first).dynamicAdapters.approval(created)).toBe(approval);
			expect(owned.value.bindings(first).dynamicAdapters.lifecycle(created)).toBe(lifecycle);

			await owned.value
				.hooks(first)
				.cancelDynamicApprovalsAndWaits({} as never, "child_disconnected");

			// Settlement retires the record for good. A late call is refused rather
			// than handed a rebuilt approval owner with a live expiry timer and an
			// effect authority nothing will dispose.
			expect(() => owned.value.bindings(first)).toThrow("is retired");
			expect(() => owned.value.hooks(first)).toThrow("is retired");

			// A crash replacement that outruns its own cleanup retires the stranded
			// generation too: the map never accumulates one record per restart, and
			// the replaced generation cannot come back.
			const stranded = owned.value.bindings(generationInput(2)).dynamicAdapters.approval(created);
			const replacement = owned.value
				.bindings(generationInput(3))
				.dynamicAdapters.approval(created);
			expect(replacement).not.toBe(stranded);
			expect(() => owned.value.bindings(generationInput(2))).toThrow("was replaced by 3");
		} finally {
			rmSync(owned.root, { recursive: true, force: true });
		}
	});

	test("retiring a generation releases its owned-process readiness subscription", async () => {
		const subscribers = new Set<() => void>();
		const owned = installation({ browserLeaseLedger: createBrowserLeaseLedger() });
		try {
			const fixture = createCodexWorkbenchGenerationFixture([]);
			const input = {
				generation: 1,
				process: {
					stop: async () => undefined,
					snapshot: () => runningProcessFacts(),
					subscribe: (listener: () => void) => {
						subscribers.add(listener);
						return () => void subscribers.delete(listener);
					},
				},
			} as unknown as CodexWorkbenchGenerationInput;
			const options = owned.value.bindings(input).gateway(fixture.components);
			const gateway = createCodexWorkbenchGateway({
				...options,
				identity: fixture.components.identity,
				threadLink: fixture.components.threadLink,
			});
			// Readiness deltas publish without a browser command, so the gateway
			// holds one subscription on the owned process for this generation.
			expect(subscribers.size).toBe(1);
			// stopBrowser disposes the gateway before the generation settles.
			await gateway.dispose();
			expect(subscribers.size).toBe(0);
		} finally {
			rmSync(owned.root, { recursive: true, force: true });
		}
	});

	test("child-exit settlement aborts the generation live dynamic waits", async () => {
		let aborts = 0;
		const owned = installation({
			waitForTargets: ({ signal }: { readonly signal: AbortSignal }) => {
				signal.addEventListener("abort", () => (aborts += 1), { once: true });
				return new Promise(() => undefined);
			},
		});
		try {
			const h = identities();
			const created = {
				identity: h.identity,
				epoch: {},
				threadLink: {},
				transport: { inspect: () => ({ state: "open" }) },
			} as unknown as CodexWorkbenchComponents;
			const input = generationInput(1);
			// Drive the exact lifecycle port the composition built for this
			// generation, then settle a child exit through its own hook.
			const port = owned.value.bindings(input).dynamicAdapters.lifecycle(created);
			const owner = waitOwnerFor(h, "thread-target");
			await Promise.resolve(port.registerWaitOwner({ owner }));
			const waiting = port.waitForTargets({
				owner,
				cursor: null,
				timeoutMs: 60_000,
				previousSequence: 0,
			});

			await owned.value.hooks(input).retireDynamicLifecycle(owner.child, owner.epoch);

			// Bounded so an unretired wait reports "still pending" instead of
			// spending the whole case timeout.
			expect(
				await Promise.race([
					waiting.then(
						() => "resolved",
						(error: unknown) => error,
					),
					(async () => {
						for (let turn = 0; turn < 10; turn++) await Promise.resolve();
						return "still pending";
					})(),
				]),
			).toMatchObject({ code: "child_disconnected" });
			expect(aborts).toBe(1);
		} finally {
			rmSync(owned.root, { recursive: true, force: true });
		}
	});
});

describe("production Codex activation guards", () => {
	for (const stage of ["initialize", "account", "coordinator"] as const)
		test(`a retired ${stage} continuation cannot publish readiness`, async () => {
			const owned = installation();
			const events: string[] = [];
			const initializeGate = deferred();
			const accountGate = deferred();
			const coordinatorGate = deferred();
			let initializeEntered!: () => void;
			const initializeStarted = new Promise<void>((resolve) => void (initializeEntered = resolve));
			let accountEntered!: () => void;
			const accountStarted = new Promise<void>((resolve) => void (accountEntered = resolve));
			let coordinatorEntered!: () => void;
			const coordinatorStarted = new Promise<void>(
				(resolve) => void (coordinatorEntered = resolve),
			);
			let active = true;
			const identity = createIdentityAuthorities(createIdentityLedger());
			const input = {
				generation: 1,
				child: {
					lifecycle: {
						markAppServerReady: () => void events.push("child:app-ready"),
						markAccountReady: () => void events.push("child:account-ready"),
					},
				},
				adoptedSession: null,
				assertActivationCurrent: () => {
					if (!active) throw new Error("activation retired");
				},
				markSessionReady: () => void events.push("session:ready"),
			} as unknown as CodexWorkbenchGenerationInput;
			const session = {
				initialize: async () => {
					events.push("session:initialize");
					initializeEntered();
					if (stage === "initialize") await initializeGate.promise;
				},
				accountRead: async () => {
					events.push("session:account-read");
					accountEntered();
					if (stage === "account") await accountGate.promise;
					return { account: { type: "chatgpt" } };
				},
			};
			const components = {
				identity,
				epoch: {
					snapshot: () => ({ manifest: { activeEpoch: null } }),
					startEpoch: () => void events.push("epoch:start"),
				},
				coordinator: {
					ensure: async () => {
						events.push("coordinator:ensure");
						coordinatorEntered();
						if (stage === "coordinator") await coordinatorGate.promise;
						return { state: "ready" };
					},
				},
			} as unknown as CodexWorkbenchComponents;
			try {
				const activation = owned.value.hooks(input).initializeSession(session as never, components);
				if (stage === "initialize") await initializeStarted;
				if (stage === "account") await accountStarted;
				if (stage === "coordinator") await coordinatorStarted;
				active = false;
				initializeGate.resolve();
				accountGate.resolve();
				coordinatorGate.resolve();
				expect(
					await activation.then(
						() => null,
						(error: unknown) => error,
					),
				).toBeInstanceOf(Error);
				expect(events).not.toContain("session:ready");
				expect(events).not.toContain("child:account-ready");
				if (stage === "initialize") {
					expect(events).not.toContain("child:app-ready");
					expect(events).not.toContain("session:account-read");
				}
				if (stage === "account") expect(events).not.toContain("coordinator:ensure");
			} finally {
				rmSync(owned.root, { recursive: true, force: true });
			}
		});
});

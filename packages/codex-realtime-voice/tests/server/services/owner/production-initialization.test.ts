import { createProductionBindingsFixture } from "#tests/server/support/generation/production-fixture.ts";
import { describe, expect, test } from "bun:test";
import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "@archboard/codex-app-server/identity";
import { createCodexWorkbenchGateway } from "#server/services/gateway/gateway.ts";
import type { CodexWorkbenchComponents } from "#server/services/generation/lifecycle.ts";
import type { CodexWorkbenchGenerationInput } from "#server/services/owner/owner-state.ts";
import { createCodexWorkbenchGenerationFixture } from "#tests/server/support/generation/generation-fixture.ts";
import { runningProcessFacts } from "#tests/server/support/generation/process-fixture.ts";

function generationInput(generation: number): CodexWorkbenchGenerationInput {
	return {
		generation,
		process: { stop: async () => undefined },
		assertActivationCurrent: () => undefined,
	} as unknown as CodexWorkbenchGenerationInput;
}
function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => void (resolve = done));
	return { promise, resolve };
}

describe("production Codex generation ownership", () => {
	test("a settled or replaced generation leaves no reachable owners behind", async () => {
		const installed: number[] = [];
		const shutdowns: string[] = [];
		const owned = createProductionBindingsFixture({
			domainTools: {
				registrations: [{ namespace: "test-domain", manifestHash: "test-manifest" }],
				install: () => {
					installed.push(installed.length + 1);
					return {
						dispatch: async () => ({}),
						dispose: () => undefined,
						shutdown: (cause) => {
							shutdowns.push(cause);
						},
					};
				},
			},
		});
		try {
			const created = createCodexWorkbenchGenerationFixture([]).components;
			const first = generationInput(1);
			const domain = owned.bindings(first).dynamicTools(created);
			expect(domain).not.toBeNull();
			await owned.hooks(first).cancelDynamicApprovalsAndWaits(created, "child_disconnected");
			expect(shutdowns).toEqual(["child_disconnected"]);
			expect(() => owned.bindings(first)).toThrow("is retired");
			expect(() => owned.hooks(first)).toThrow("is retired");
			const stranded = owned.bindings(generationInput(2)).dynamicTools(created);
			const replacement = owned.bindings(generationInput(3)).dynamicTools(created);
			expect(replacement).not.toBe(stranded);
			expect(() => owned.bindings(generationInput(2))).toThrow("was replaced by 3");
			expect(installed).toEqual([1, 2, 3]);
		} finally {
			owned.close();
		}
	});
	test("retiring a generation releases its owned-process readiness and shown-conversation subscriptions", async () => {
		const subscribers = new Set<() => void>();
		const subscribe = (listener: () => void) => {
			subscribers.add(listener);
			return () => void subscribers.delete(listener);
		};
		const owned = createProductionBindingsFixture({
			onShownChange: subscribe,
		});
		try {
			const fixture = createCodexWorkbenchGenerationFixture([]);
			const input = {
				generation: 1,
				process: { stop: async () => undefined, snapshot: () => runningProcessFacts(), subscribe },
			} as unknown as CodexWorkbenchGenerationInput;
			const options = owned.bindings(input).gateway(fixture.components);
			const gateway = createCodexWorkbenchGateway({
				...options,
				identity: fixture.components.identity,
				threadLink: fixture.components.threadLink,
			});
			// Readiness deltas publish without a browser command, so the gateway holds one
			// subscription on the owned process for this generation. It holds one on the tabs' shown
			// conversations too: every chat of a tab shows the checkout the person activated (ADR 0050).
			expect(subscribers.size).toBe(2);
			// stopBrowser disposes the gateway before the generation settles.
			await gateway.dispose();
			expect(subscribers.size).toBe(0);
		} finally {
			owned.close();
		}
	});
	test("child-exit settlement reaches the installed domain before shutdown", async () => {
		const events: string[] = [];
		const created = createCodexWorkbenchGenerationFixture([]).components;
		const owned = createProductionBindingsFixture({
			domainTools: {
				registrations: [],
				install: () => ({
					dispatch: async () => ({}),
					dispose: () => undefined,
					childExit: (child, epoch) => {
						events.push(`exit:${String(child)}:${String(epoch)}`);
					},
					shutdown: (cause) => {
						events.push(`shutdown:${cause}`);
					},
				}),
			},
		});
		try {
			const input = generationInput(1);
			owned.bindings(input).dynamicTools(created);
			const hooks = owned.hooks(input);
			const { childId, epoch } = created.identity.identity.validator;
			await hooks.retireDynamicLifecycle(childId, epoch);
			expect(events).toEqual([`exit:${String(childId)}:${String(epoch)}`]);
			await hooks.cancelDynamicApprovalsAndWaits(created, "child_disconnected");
			expect(events).toEqual([
				`exit:${String(childId)}:${String(epoch)}`,
				"shutdown:child_disconnected",
			]);
		} finally {
			owned.close();
		}
	});
});
describe("production Codex activation guards", () => {
	for (const stage of ["initialize", "account"] as const) {
		test(`a retired ${stage} continuation cannot publish readiness`, async () => {
			const owned = createProductionBindingsFixture();
			const events: string[] = [];
			const initializeGate = deferred();
			const accountGate = deferred();
			let initializeEntered!: () => void;
			const initializeStarted = new Promise<void>((resolve) => void (initializeEntered = resolve));
			let accountEntered!: () => void;
			const accountStarted = new Promise<void>((resolve) => void (accountEntered = resolve));
			let active = true;
			const identity = createIdentityAuthorities(createIdentityLedger("codex"));
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
					if (!active) {
						throw new Error("activation retired");
					}
				},
				markSessionReady: () => void events.push("session:ready"),
			} as unknown as CodexWorkbenchGenerationInput;
			const session = {
				initialize: async () => {
					events.push("session:initialize");
					initializeEntered();
					if (stage === "initialize") {
						await initializeGate.promise;
					}
				},
				accountRead: async () => {
					events.push("session:account-read");
					accountEntered();
					if (stage === "account") {
						await accountGate.promise;
					}
					return { account: { type: "chatgpt" } };
				},
			};
			const components = {
				identity,
				epoch: {
					snapshot: () => ({ manifest: { activeEpoch: null } }),
					startEpoch: () => void events.push("epoch:start"),
				},
			} as unknown as CodexWorkbenchComponents;
			try {
				const activation = owned.hooks(input).initializeSession(session as never, components);
				if (stage === "initialize") {
					await initializeStarted;
				}
				if (stage === "account") {
					await accountStarted;
				}
				active = false;
				initializeGate.resolve();
				accountGate.resolve();
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
			} finally {
				owned.close();
			}
		});
	}
	test("a signed-in session is ready without starting a coordinator", async () => {
		const owned = createProductionBindingsFixture();
		const events: string[] = [];
		const input = {
			generation: 1,
			child: {
				lifecycle: {
					markAppServerReady: () => void events.push("child:app-ready"),
					markAccountReady: () => void events.push("child:account-ready"),
				},
			},
			adoptedSession: null,
			assertActivationCurrent: () => undefined,
			markSessionReady: (accountReady: boolean) =>
				void events.push(`session:ready:${String(accountReady)}`),
		} as unknown as CodexWorkbenchGenerationInput;
		const session = {
			initialize: async () => undefined,
			accountRead: async () => ({ account: { type: "chatgpt" } }),
		};
		const components = {
			identity: createIdentityAuthorities(createIdentityLedger("codex")),
			epoch: {
				snapshot: () => ({ manifest: { activeEpoch: null } }),
				startEpoch: () => undefined,
			},
			coordinator: {
				ensure: async () => {
					events.push("coordinator:ensure");
					return { state: "ready" };
				},
			},
		} as unknown as CodexWorkbenchComponents;
		try {
			await owned.hooks(input).initializeSession(session as never, components);
			// The conversation's first message or Talk starts the coordinator.
			expect(events).toEqual(["child:app-ready", "session:ready:true", "child:account-ready"]);
		} finally {
			owned.close();
		}
	});
});

import {
	ARCHBOARD_INSTRUCTIONS,
	ARCHBOARD_CONTEXT_CODEC,
} from "#runtime/services/host/archboard.ts";
import { createArchboardVoicePolicy } from "#runtime/services/host/archboard-voice.ts";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readlinkSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkoutPort, SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";
import { findVault } from "@archboard/workspace/vault";
import { withProductionState } from "#tests/server/support/generation/production-state.ts";
import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "@archboard/codex-app-server/identity";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "#shared/protocol/realtime-contract.ts";
import { createCodexRealtimeAdapter } from "#runtime/services/realtime/adapter.ts";
import {
	createSemanticContextPublisher,
	type SemanticContextInput,
} from "#runtime/api/semantic-context.ts";
import type { SessionParams } from "@archboard/codex-app-server/session";
import { createBrowserLeaseLedger } from "#server/services/lease/lease.ts";
import { createCodexWorkbenchGateway } from "#server/services/gateway/gateway.ts";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { createServerCodexWorkbenchInstallation } from "#server/services/owner/production.ts";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchSharedComponents,
} from "#server/services/generation/lifecycle.ts";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchTabSessionScope,
} from "#server/protocol/generation/session-contract.ts";
import type { CodexWorkbenchGenerationInput } from "#server/services/owner/owner-state.ts";
import { createCodexWorkbenchGenerationFixture } from "#tests/server/support/generation/generation-fixture.ts";
import { identities, waitOwnerFor } from "#tests/server/support/generation/terminal-fixture.ts";
import { runningProcessFacts } from "#tests/server/support/generation/process-fixture.ts";
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
function installation(server: Record<string, unknown> = {}) {
	const root = mkdtempSync(join(tmpdir(), "archboard-production-activation-"));
	return withProductionState(root, () => {
		return {
			root,
			value: createServerCodexWorkbenchInstallation({
				sourceRoot: "/repo",
				host: {
					instructions: ARCHBOARD_INSTRUCTIONS,
					contextCodec: ARCHBOARD_CONTEXT_CODEC,
					resolveCheckout: (named: string) => named,
					voiceFor: () => createArchboardVoicePolicy(),
					coordinatorContextFor: () => ({ read: () => "{}", subscribe: () => () => undefined }),
				},
				...server,
			} as never),
		};
	});
}
describe("production Codex storage", () => {
	test("the servers on a machine share one Codex home, and each port owns its own state", async () => {
		const { root, value } = installation();
		try {
			const workbench =
				process.platform === "darwin"
					? join(root, "Library", "Application Support", "archboard", "codex-workbench")
					: process.platform === "win32"
						? join(root, "Archboard", "codex-workbench")
						: join(root, "archboard", "codex-workbench");
			const owner = join(
				workbench,
				"canvases",
				process.env["PORT"] || String(checkoutPort(SOURCE_CHECKOUT)),
			);
			expect(value.process.storage).toEqual({ rootDirectory: workbench, ownerDirectory: owner });
			expect(statSync(owner).mode & 0o777).toBe(0o700);
			// The coordinator works in a directory of its own, in no checkout, and reads the server's
			// archboard skill from there (ADR 0050).
			const coordinator = join(owner, "coordinator");
			expect(value.process.workingDirectory).toBe(coordinator);
			expect(readlinkSync(join(coordinator, ".agents", "skills", "archboard"))).toBe(
				join("/repo", "skills", "archboard"),
			);
			expect(existsSync(join(coordinator, ".archboard"))).toBe(false);
			// So a command the coordinator runs without -C finds no vault and is refused, rather than
			// read the boards of a checkout it does not work in.
			expect(await findVault({ directory: null, cwd: coordinator })).toMatchObject({
				ok: false,
				code: "VAULT_NOT_FOUND",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
describe("production Codex generation ownership", () => {
	test("captures startup semantics under the exact minted wire session", async () => {
		const authorities = createIdentityAuthorities(createIdentityLedger());
		const workhorseThreadId = authorities.identity.decoder.adoptThreadId("voice-workhorse");
		const coordinatorThreadId = authorities.identity.decoder.adoptThreadId("voice-coordinator");
		const input: SemanticContextInput = {
			repository: "/repo",
			child: {
				id: authorities.identity.validator.childId,
				epoch: authorities.identity.validator.epoch,
			},
			threadLink: { state: "executable", reason: null },
			workhorse: { threadId: workhorseThreadId, turnId: null },
			coordinator: { threadId: coordinatorThreadId, realtimeSessionId: null },
			board: {
				key: "architecture",
				name: "Architecture",
				vault: "/repo/.archboard/vault",
				file: "boards/architecture.semantic.json",
				version: 7,
			},
			pane: { paneId: "pane-a", focused: true },
			architecture: {
				variant: null,
				view: null,
				selection: {
					count: 1,
					subjects: [{ kind: "node" as const, id: "node-a", name: "Gateway" }],
				},
				differences: null,
				reconciliation: { required: false, count: 0, blockedBy: null, issues: [] },
			},
			claim: { holder: "none", doing: null },
			doing: "Explaining the architecture",
			cursor: { feedId: "feed-a", sequence: 4 },
			description: "Architecture board",
		};
		const semanticPublisherOptions = {
			feed: { onChange: () => () => undefined },
			feedId: "feed-a",
			fresh: { read: () => input },
			contextForChange: () => input,
			now: () => 1_800_000_000_000,
		};
		const owned = installation({
			semanticPublisherFor: () => semanticPublisherOptions,
			narrationChangesFor: () => () => () => undefined,
			presentingVaultFor: () => null,
		});
		const publisher = createSemanticContextPublisher(semanticPublisherOptions);
		const starts: SessionParams<"thread/realtime/start">[] = [];
		try {
			const components = {
				semanticPublisher: publisher,
				coordinator: {
					snapshot: () => ({ state: "ready", threadId: coordinatorThreadId }),
				},
			} as unknown as CodexWorkbenchSessionComponents;
			// Voice is bound to the workhorse of the checkout it started from.
			const voiced = {
				components: {
					workhorse: {
						snapshot: () => ({
							state: "ready",
							childId: authorities.identity.validator.childId,
							epoch: authorities.identity.validator.epoch,
							threadId: workhorseThreadId,
						}),
					},
				},
			};
			const scope = {
				id: parseTabSessionId("tab-one")!,
				state: {
					delegations: new Map(),
					currentCoordinatorCall: null,
					threads: new Set(),
					voiceTrace: { begin: () => undefined, note: () => undefined },
					presenting: null,
					voiceCheckout: "/repo",
					phase: "live",
				},
				voiceWorkhorse: () => voiced,
				workhorses: () => [voiced],
			} as unknown as CodexWorkbenchTabSessionScope;
			const production = owned.value
				.bindings(generationInput(1))
				.tabSession(scope, { identity: authorities } as unknown as CodexWorkbenchSharedComponents)
				.realtime(components);
			const adapter = createCodexRealtimeAdapter({
				...production,
				coordinatorContext: {
					read: () => '{"type":"archboard_board_catalogue","boards":[],"omitted":0}',
					subscribe: () => () => {},
				},
				identity: authorities.identity,
				session: {
					realtimeStart: async (params) => {
						starts.push(params);
						return {};
					},
					realtimeAppendText: async () => ({}),
					threadInjectItems: async () => ({}),
					realtimeAppendSpeech: async () => ({}),
					realtimeStop: async () => ({}),
					timelineListPage: async () => ({
						data: [],
						nextCursor: null,
						activeRealtimeSessionAtPageStart: null,
					}),
				},
			});
			const pending = adapter.createOffer({
				sessionId: parseRealtimeSessionId("browser-session"),
				correlationId: parseRealtimeCorrelationId("browser-correlation"),
				sdp: "offer",
			});
			void pending.catch(() => undefined);
			await Promise.resolve();
			const start = starts[0];
			if (start === undefined) {
				throw new Error("The realtime start was not sent.");
			}
			// The brief is captured for this start's callbacks, and reaches neither model's start.
			expect(start.initialItems).toEqual([]);
			expect(start.realtimeStartInstructions).not.toContain("semantic_context");
			const exactBrief = adapter.generation()?.semanticBrief;
			if (exactBrief === undefined) {
				throw new Error("The generation has no semantic brief.");
			}
			expect(JSON.parse(exactBrief).coordinator.realtimeSessionId).toBe(start.realtimeSessionId);
			expect(adapter.generation()).toMatchObject({ wireSessionId: start.realtimeSessionId });
			adapter.dispose();
			await expect(pending).rejects.toThrow("disposed");
		} finally {
			publisher.dispose();
			rmSync(owned.root, { recursive: true, force: true });
		}
	});
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
	test("retiring a generation releases its owned-process readiness and shown-conversation subscriptions", async () => {
		const subscribers = new Set<() => void>();
		const subscribe = (listener: () => void) => {
			subscribers.add(listener);
			return () => void subscribers.delete(listener);
		};
		const owned = installation({
			browserLeaseLedger: createBrowserLeaseLedger(),
			onShownChange: subscribe,
		});
		try {
			const fixture = createCodexWorkbenchGenerationFixture([]);
			const input = {
				generation: 1,
				process: { stop: async () => undefined, snapshot: () => runningProcessFacts(), subscribe },
			} as unknown as CodexWorkbenchGenerationInput;
			const options = owned.value.bindings(input).gateway(fixture.components);
			const gateway = createCodexWorkbenchGateway({
				...options,
				identity: fixture.components.identity,
				threadLink: fixture.components.threadLink,
			});
			// Readiness deltas publish without a browser command, so the gateway holds one
			// subscription on the owned process for this generation. It holds one on the tabs' shown
			// conversations too: every pane of a tab shows the checkout the person activated (ADR 0050).
			expect(subscribers.size).toBe(2);
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
						for (let turn = 0; turn < 10; turn++) {
							await Promise.resolve();
						}
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
	for (const stage of ["initialize", "account"] as const) {
		test(`a retired ${stage} continuation cannot publish readiness`, async () => {
			const owned = installation();
			const events: string[] = [];
			const initializeGate = deferred();
			const accountGate = deferred();
			let initializeEntered!: () => void;
			const initializeStarted = new Promise<void>((resolve) => void (initializeEntered = resolve));
			let accountEntered!: () => void;
			const accountStarted = new Promise<void>((resolve) => void (accountEntered = resolve));
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
				const activation = owned.value.hooks(input).initializeSession(session as never, components);
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
				rmSync(owned.root, { recursive: true, force: true });
			}
		});
	}
	test("a signed-in session is ready without starting a coordinator", async () => {
		const owned = installation();
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
			identity: createIdentityAuthorities(createIdentityLedger()),
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
			await owned.value.hooks(input).initializeSession(session as never, components);
			// The conversation's first message or Talk starts the coordinator.
			expect(events).toEqual(["child:app-ready", "session:ready:true", "child:account-ready"]);
		} finally {
			rmSync(owned.root, { recursive: true, force: true });
		}
	});
});

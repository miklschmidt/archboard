import { expect, test } from "bun:test";

import { type CoordinatorCallbackDelivery } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import { EMPTY_SPOKEN_APPROVAL_SNAPSHOT } from "#runtime/state/spoken-approval/state.ts";
import type { CodexRealtimeGeneration } from "#runtime/services/realtime/contract.ts";
import { createCodexBrowserModel } from "#shared/schemas/browser/model.ts";
import { type BrowserReadiness } from "#shared/schemas/browser/snapshot.ts";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "#shared/protocol/realtime-contract.ts";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import {
	projectServerBrowserReadiness,
	type ServerReadinessInput,
} from "#server/rules/generation/readiness.ts";
import { processFacts } from "#tests/server/support/generation/process-fixture.ts";
import { projectionHarness } from "#tests/server/support/generation/projection-harness.ts";
import { createCodexWorkbenchGateway } from "#server/services/gateway/gateway.ts";

const identity = createIdentityAuthorities();
const readinessSchema = createCodexBrowserModel(identity).BrowserReadinessSchema;
const loginId = identity.identity.decoder.adoptLoginId("login-readiness");

test("the real gateway delivers the pending ChatGPT authorization URL to the browser", async () => {
	const harness = projectionHarness();
	harness.setFacts(processFacts());
	harness.state.account = { kind: "account", state: "signed_out" };
	const gateway = createCodexWorkbenchGateway({
		...harness.options,
		identity: harness.authorities,
		threadLink: { read: () => harness.context.binding },
		checkoutOf: () => harness.context.checkout,
	});
	try {
		const connection = gateway.connect(
			harness.context.browserId,
			harness.context.paneId,
			harness.context.tabSessionId,
		);
		const lease = connection.claimLease();
		const result = await connection.command({
			kind: "browser_command",
			command: "accountLogin",
			commandId: lease.commandId,
			paneId: lease.paneId,
			childId: lease.childId,
			epoch: lease.epoch,
			login: { type: "chatgpt" },
		});
		expect(result.outcome).toBe("delivered");
		expect(result.snapshot.login).toMatchObject({
			state: "pending",
			loginId: harness.loginId,
			authUrl: "https://example.test/login",
		});
	} finally {
		gateway.dispose();
	}
});

const signedInAccount = {
	kind: "codex_account_response",
	response: {
		account: { type: "chatgpt", email: "readiness@example.test", planType: "plus" },
		requiresOpenaiAuth: true,
		workspaceRouting: null,
	},
} as const satisfies ServerReadinessInput["account"];

function readiness(overrides: Partial<ServerReadinessInput>): BrowserReadiness {
	const value = projectServerBrowserReadiness({
		process: processFacts(),
		account: { kind: "account", state: "unknown", reason: "not read" },
		login: { kind: "login", state: "idle" },
		...overrides,
	});
	// Every produced arm must satisfy the closed browser contract, not just the
	// local union: the gateway publishes exactly this value.
	expect(readinessSchema.parse(value)).toEqual(value);
	return value;
}

test("owned-process, session and account facts produce every readiness arm", () => {
	expect(readiness({ process: processFacts({ state: "stopped" }) })).toEqual({
		kind: "readiness",
		state: "stopped",
		reason: "The Codex app server is not running.",
	});
	expect(
		readiness({
			process: processFacts({
				state: "terminal_failure",
				ready: false,
				failure: { code: "crash", message: "the child crashed", terminal: true },
			}),
		}),
	).toEqual({ kind: "readiness", state: "stopped", reason: "the child crashed" });
	expect(
		readiness({
			process: processFacts({
				state: "backoff",
				ready: false,
				restartAttempt: 2,
				nextRestartAtMs: 4096,
				failure: { code: "early_exit", message: "the child exited early", terminal: false },
			}),
		}),
	).toEqual({
		kind: "readiness",
		state: "backoff",
		retryAtMs: 4096,
		reason: "the child exited early",
	});
	expect(
		readiness({
			process: processFacts({
				state: "terminal_failure",
				ready: false,
				failure: { code: "storage_refused", message: "the sqlite home moved", terminal: true },
			}),
		}),
	).toEqual({ kind: "readiness", state: "storage_mismatch", reason: "the sqlite home moved" });
	for (const code of [
		"binary_invalid",
		"binary_missing",
		"binary_wrong_version",
		"strict_config_rejected",
	] as const) {
		expect(
			readiness({
				process: processFacts({
					state: "terminal_failure",
					ready: false,
					failure: { code, message: "codex 0.150.0", terminal: true },
				}),
			}),
		).toEqual({ kind: "readiness", state: "incompatible_contract", reason: "codex 0.150.0" });
	}
	expect(readiness({ process: processFacts({ state: "starting", ready: false }) })).toEqual({
		kind: "readiness",
		state: "reconnecting",
		reason: "The Codex app server is starting.",
	});
	expect(readiness({ process: processFacts({ ready: false }) })).toEqual({
		kind: "readiness",
		state: "reconnecting",
		reason: "The Codex app-server session is initializing.",
	});
	expect(readiness({})).toEqual({ kind: "readiness", state: "initialized" });
	expect(
		readiness({ account: { kind: "account", state: "failed", reason: "account/read failed" } }),
	).toEqual({ kind: "readiness", state: "login_capable" });
	expect(readiness({ account: { kind: "account", state: "signed_out" } })).toEqual({
		kind: "readiness",
		state: "signed_out",
	});
	expect(
		readiness({
			account: {
				kind: "codex_account_response",
				response: { account: null, requiresOpenaiAuth: true, workspaceRouting: null },
			},
		}),
	).toEqual({ kind: "readiness", state: "signed_out" });
	expect(
		readiness({
			login: {
				kind: "login",
				state: "pending",
				loginId,
				variant: "chatgpt",
				authUrl: "https://example.test/login",
			},
			account: signedInAccount,
		}),
	).toEqual({ kind: "readiness", state: "login_pending", loginId });
	// Signed in is thread-capable: the conversation's first message or Talk
	// starts the coordinator.
	expect(readiness({ account: signedInAccount })).toEqual({
		kind: "readiness",
		state: "thread_capable",
	});
});

test("a diagnostic failure message becomes one bounded contract-legal reason", () => {
	const value = readiness({
		process: processFacts({
			state: "terminal_failure",
			ready: false,
			failure: {
				code: "crash",
				message: `spawn\u0000 failed:\n\t${"détail ".repeat(200)}`,
				terminal: true,
			},
		}),
	});
	expect(value.state).toBe("stopped");
	const reason = "reason" in value ? value.reason : "";
	expect(reason).not.toContain("\u0000");
	expect(reason).not.toContain("\n");
	expect(reason.startsWith("spawn failed: détail")).toBe(true);
	expect(new TextEncoder().encode(reason).byteLength).toBeLessThanOrEqual(512);
});

test("the production browser projection derives readiness from its live owners", () => {
	const harness = projectionHarness();
	const { options, state, context } = harness;
	const stateNow = (): BrowserReadiness["state"] =>
		options.projection.read(context).readiness.state;

	expect(stateNow()).toBe("reconnecting");
	harness.setFacts(processFacts());
	expect(stateNow()).toBe("initialized");
	state.account = { kind: "account", state: "signed_out" };
	expect(stateNow()).toBe("signed_out");
	state.login = {
		kind: "login",
		state: "pending",
		loginId,
		variant: "chatgpt",
		authUrl: "https://example.test/login",
	};
	expect(stateNow()).toBe("login_pending");
	state.login = { kind: "login", state: "completed", loginId };
	state.account = signedInAccount;
	// No coordinator has started: the first create starts it.
	expect(stateNow()).toBe("thread_capable");
});

test("the production browser projection reads spoken approval from its runtime owner", () => {
	const spokenApproval = {
		...EMPTY_SPOKEN_APPROVAL_SNAPSHOT,
		state: "visual_fallback" as const,
		reason: "approval_unavailable" as const,
	};
	const harness = projectionHarness({ spokenApproval: { snapshot: () => spokenApproval } });
	expect(harness.options.projection.read(harness.context).spokenApproval).toBe(spokenApproval);
});

test("cached queue submissions are presented only for the thread they were read for", () => {
	const harness = projectionHarness();
	const { options, context } = harness;
	const state = harness.workhorse.state;
	const decoder = createIdentityAuthorities().identity.decoder;
	state.queue = {
		kind: "codex_queue",
		submissions: [
			{
				id: decoder.adoptQueuedSubmissionId("queued-one"),
				input: [{ type: "text", text: "queued prompt", text_elements: [] }],
				operationId: null,
			},
		],
	};

	state.queueThreadId = harness.threadId;
	expect(options.projection.read(context).queue.submissions).toHaveLength(1);

	state.queueThreadId = decoder.adoptThreadId("another-thread");
	expect(options.projection.read(context).queue.submissions).toBeNull();

	state.queueThreadId = null;
	expect(options.projection.read(context).queue.submissions).toBeNull();
});

test("the production browser projection publishes immutable voice start and ordered delivery evidence", () => {
	const canonicalBrief = '{"source":"semantic_context","captured":"exact-start"}';
	const harness = projectionHarness({
		voiceContext: (authorities) => {
			const voiceIdentity = authorities.identity;
			const generation: CodexRealtimeGeneration = {
				child: voiceIdentity.validator.childId,
				epoch: voiceIdentity.validator.epoch,
				linkedThreadId: voiceIdentity.decoder.adoptThreadId("voice-workhorse"),
				coordinatorThreadId: voiceIdentity.decoder.adoptThreadId("voice-coordinator"),
				browserSessionId: parseRealtimeSessionId("browser-voice-session"),
				browserCorrelationId: parseRealtimeCorrelationId("browser-voice-correlation"),
				wireSessionId: voiceIdentity.issuer.mintRealtimeSessionId(),
				semanticBrief: canonicalBrief,
			};
			const realtimeGeneration = {
				childId: generation.child,
				epoch: generation.epoch,
				coordinatorThreadId: generation.coordinatorThreadId,
				wireSessionId: generation.wireSessionId,
				browserSessionId: generation.browserSessionId,
				browserCorrelationId: generation.browserCorrelationId,
			};
			const callback = (type: "focus" | "selection") =>
				({
					kind: "semantic",
					type,
					correlation: { realtimeGeneration },
				}) as unknown as NonNullable<CoordinatorCallbackDelivery["callback"]>;
			const delivery = (
				sourceOrder: number,
				type: "focus" | "selection",
			): CoordinatorCallbackDelivery => ({
				kind: "coordinator_callback_delivery",
				callback: callback(type),
				sourceOrder,
				freshness: { capturedAtMs: 100 + sourceOrder, freshUntilMs: 200 + sourceOrder },
				attempted: true,
				attemptedAtMs: 150 + sourceOrder,
				path: "realtime_appendText",
				outcome: "delivered",
				reason: null,
				text: `exact-${type}`,
				realtimeRequest: null,
			});
			return {
				realtime: { generation: () => generation },
				callbacks: {
					inspectHistory: () => ({
						deliveries: [delivery(4, "selection"), delivery(2, "focus")],
						omittedPrefixCount: 3,
					}),
				},
			};
		},
	});

	const evidence = harness.options.projection.read(harness.context).voiceContext;
	expect(evidence?.canonicalBrief).toBe(canonicalBrief);
	expect(evidence?.ownerEntriesTruncated).toBe(3);
	expect(evidence?.entriesTruncated).toBe(3);
	expect(evidence?.entries.map((entry) => entry.sourceOrder)).toEqual([2, 4]);
	expect(evidence?.entries.map((entry) => entry.kind)).toEqual(["focus", "selection"]);
	expect(evidence?.entries.map((entry) => entry.body)).toEqual(["exact-focus", "exact-selection"]);
});

test("cancelling a pending sign-in reads the account again and offers sign-in", async () => {
	const harness = projectionHarness();
	const { options, context } = harness;
	harness.setFacts(processFacts());
	const readinessNow = (): BrowserReadiness["state"] =>
		options.projection.read(context).readiness.state;
	const command = {
		kind: "browser_command",
		commandId: harness.actionContext.commandId,
		paneId: harness.actionContext.paneId,
		childId: harness.actionContext.childId,
		epoch: harness.actionContext.epoch,
	} as const;

	await options.actions.account.login(
		{ ...command, command: "accountLogin", login: { type: "chatgpt" } },
		harness.actionContext,
	);
	expect(readinessNow()).toBe("login_pending");

	await options.actions.account.loginCancel(
		{ ...command, command: "accountLoginCancel", loginId: harness.loginId },
		harness.actionContext,
	);
	// Codex announces no account change after a cancel, so without reading the
	// account again the browser would stay on starting Codex with no sign-in.
	for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
	expect(readinessNow()).toBe("login_capable");
});

test("a pane of a checkout with no workhorse is shown none, and its first conversation starts that checkout's", async () => {
	const harness = projectionHarness();
	const shop = "/work/shop";

	// Reading what a pane shows starts nothing: the checkout has no queue or board news to show.
	const read = harness.options.projection.read({ ...harness.context, checkout: shop });
	expect(read.queue).toEqual({ kind: "codex_queue", submissions: null });
	expect([...harness.session.workhorses.keys()]).toEqual(["/work/payments"]);

	const created = await harness.options.actions.threadLinks.create(
		{ command: "threadLinkCreate" } as never,
		{ ...harness.actionContext, checkout: shop },
	);
	expect(created).toEqual({ outcome: "delivered" });
	expect([...harness.session.workhorses.keys()]).toEqual(["/work/payments", shop]);
});

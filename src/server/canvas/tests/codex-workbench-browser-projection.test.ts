import { expect, test } from "bun:test";

import {
	createCodexBrowserModel,
	type BrowserReadiness,
} from "../../../shared/codex-browser-model/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import type { ThreadLinkSnapshot } from "../../../runtime/codex-thread-link/index.js";
import type { ArchboardContext } from "../../../runtime/codex-instructions/index.js";
import type {
	BrowserActionContext,
	BrowserProjectionContext,
} from "../../codex-workbench/index.js";
import {
	createCanvasBrowserGatewayOptions,
	createCanvasBrowserProjectionBudget,
	createCanvasDynamicApprovalOwner,
	projectCanvasBrowserReadiness,
	type CanvasBrowserBindingState,
	type CanvasReadinessInput,
	type CanvasTimelineOwner,
} from "../codex-workbench-adapters.js";
import { createCodexWorkbenchGenerationFixture } from "./support/codex-workbench-generation-fixture.js";
import { processFacts } from "./support/codex-workbench-process-fixture.js";

const identity = createIdentityAuthorities();
const readinessSchema = createCodexBrowserModel(identity).BrowserReadinessSchema;
const loginId = identity.identity.decoder.adoptLoginId("login-readiness");

const signedInAccount = {
	kind: "codex_account_response",
	response: {
		account: { type: "chatgpt", email: "readiness@example.test", planType: "plus" },
		requiresOpenaiAuth: true,
	},
} as const satisfies CanvasReadinessInput["account"];

function readiness(overrides: Partial<CanvasReadinessInput>): BrowserReadiness {
	const value = projectCanvasBrowserReadiness({
		process: processFacts(),
		account: { kind: "account", state: "unknown", reason: "not read" },
		login: { kind: "login", state: "idle" },
		coordinatorReady: false,
		...overrides,
	});
	// Every produced arm must satisfy the closed browser contract, not just the
	// local union: the gateway publishes exactly this value.
	expect(readinessSchema.parse(value)).toEqual(value);
	return value;
}

test("owned-process, session, account, and coordinator facts produce every readiness arm", () => {
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
	] as const)
		expect(
			readiness({
				process: processFacts({
					state: "terminal_failure",
					ready: false,
					failure: { code, message: "codex 0.150.0", terminal: true },
				}),
			}),
		).toEqual({ kind: "readiness", state: "incompatible_contract", reason: "codex 0.150.0" });
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
				response: { account: null, requiresOpenaiAuth: true },
			},
		}),
	).toEqual({ kind: "readiness", state: "signed_out" });
	expect(
		readiness({
			login: { kind: "login", state: "pending", loginId, variant: "chatgpt" },
			account: signedInAccount,
			coordinatorReady: true,
		}),
	).toEqual({ kind: "readiness", state: "login_pending", loginId });
	expect(readiness({ account: signedInAccount })).toEqual({
		kind: "readiness",
		state: "account_ready",
	});
	expect(readiness({ account: signedInAccount, coordinatorReady: true })).toEqual({
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

const archboardContext: ArchboardContext = {
	schema: 1,
	paneId: "pane-readiness",
	board: { note: "vault/board.md", version: 1, cursor: null },
	threadLink: { state: "executable", reason: null },
	child: { id: "child", epoch: "epoch" },
	workhorse: { threadId: "thread", turnId: null },
	coordinator: { threadId: null, realtimeSessionId: null },
	semantic: {
		brief: "Readiness projection fixture.",
		capturedAtMs: 1,
		freshUntilMs: 2,
		truncated: false,
	},
	focus: { paneId: "pane-readiness", capturedAtMs: 1 },
	selection: { elementIds: [], capturedAtMs: 1 },
	claim: { holder: "none", doing: null },
	ambiguity: [],
	operation: { id: null, kind: null, rpc: null, outcome: null },
};

function executableLink(authorities: IdentityAuthorities): ThreadLinkSnapshot {
	return {
		kind: "thread_link",
		state: "executable",
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		threadId: authorities.identity.decoder.adoptThreadId("readiness-thread"),
		source: "appServer",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

interface ProjectionHarness {
	readonly options: ReturnType<typeof createCanvasBrowserGatewayOptions>;
	readonly state: CanvasBrowserBindingState;
	readonly context: BrowserProjectionContext;
	readonly actionContext: BrowserActionContext;
	readonly loginId: ReturnType<IdentityAuthorities["identity"]["decoder"]["adoptLoginId"]>;
	readonly threadId: ReturnType<typeof executableLink>["threadId"];
	setFacts: (value: ReturnType<typeof processFacts>) => void;
	setCoordinatorReady: (value: boolean) => void;
}

/** One production adapter over the generation fixture, with its live sources injectable. */
function projectionHarness(): ProjectionHarness {
	const authorities = createIdentityAuthorities();
	const harnessLoginId = authorities.identity.decoder.adoptLoginId("login-readiness");
	const harnessCommandId = authorities.identity.issuer.mintBrowserCommandId();
	const fixture = createCodexWorkbenchGenerationFixture([]).components;
	let coordinatorReady = false;
	let facts = processFacts({ state: "starting", ready: false });
	const components = {
		...fixture,
		session: {
			...fixture.session,
			accountLogin: async () => ({
				type: "chatgpt" as const,
				loginId: harnessLoginId,
				authUrl: "https://example.test/login",
			}),
			accountLoginCancel: async () => ({ status: "canceled" as const }),
		},
		coordinator: {
			...fixture.coordinator,
			snapshot: () => ({
				...fixture.coordinator.snapshot(),
				state: coordinatorReady ? ("ready" as const) : ("starting" as const),
			}),
		},
	};
	const state: CanvasBrowserBindingState = {
		account: { kind: "account", state: "unknown", reason: "not read" },
		login: { kind: "login", state: "idle" },
		queue: { kind: "codex_queue", submissions: null },
		queueThreadId: null,
	};
	const timeline: CanvasTimelineOwner = {
		read: () => null,
		onNotification: () => undefined,
		retire: () => undefined,
		dispose: () => undefined,
	};
	const options = createCanvasBrowserGatewayOptions({
		components,
		dynamicApprovals: createCanvasDynamicApprovalOwner({
			identity: authorities,
			now: () => 1,
			bindingForCaller: () => {
				throw new Error("The projection owner issues no dynamic approvals.");
			},
		}),
		state,
		timeline,
		budget: createCanvasBrowserProjectionBudget(),
		leaseLedger: { active: null, retired: new Map() },
		process: () => facts,
		checkoutRoot: "/repo",
		contextForOperation: () => archboardContext,
		onChange: () => () => undefined,
	});
	const link = executableLink(authorities);
	return {
		options,
		state,
		threadId: link.threadId,
		context: {
			browserId: "browser-projection",
			paneId: "pane-readiness",
			connection: {},
			binding: {
				paneId: "pane-readiness",
				revision: 1,
				link,
				cas: {
					revision: 1,
					paneId: "pane-readiness",
					childId: link.childId,
					epoch: link.epoch,
					threadId: link.threadId,
				},
			},
			lease: null,
			mediaReady: false,
		},
		actionContext: {
			browserId: "browser-projection",
			connection: {},
			paneId: "pane-readiness",
			commandId: harnessCommandId,
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			link,
			linkRevision: 1,
		},
		loginId: harnessLoginId,
		setFacts: (value) => void (facts = value),
		setCoordinatorReady: (value) => void (coordinatorReady = value),
	};
}

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
	state.login = { kind: "login", state: "pending", loginId, variant: "chatgpt" };
	expect(stateNow()).toBe("login_pending");
	state.login = { kind: "login", state: "completed", loginId };
	state.account = signedInAccount;
	expect(stateNow()).toBe("account_ready");
	harness.setCoordinatorReady(true);
	expect(stateNow()).toBe("thread_capable");
});

test("cached queue submissions are presented only for the thread they were read for", () => {
	const harness = projectionHarness();
	const { options, state, context } = harness;
	const decoder = createIdentityAuthorities().identity.decoder;
	state.queue = {
		kind: "codex_queue",
		submissions: [
			{
				id: decoder.adoptQueuedSubmissionId("queued-one"),
				input: [{ type: "text", text: "queued prompt", text_elements: [] }],
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

test("cancelling a pending sign-in clears the login-pending account arm", async () => {
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
	// Without clearing the account arm the browser would stay login_pending forever.
	expect(readinessNow()).toBe("initialized");
});

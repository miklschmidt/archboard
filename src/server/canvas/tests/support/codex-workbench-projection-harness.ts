import type { IdentityAuthorities } from "../../../../shared/codex-workbench-identity/index.js";
import { createIdentityAuthorities } from "../../../../shared/codex-workbench-identity/index.js";
import type { ThreadLinkSnapshot } from "../../../../runtime/codex-thread-link/index.js";
import type { ArchboardContext } from "../../../../runtime/codex-instructions/index.js";
import type {
	BrowserActionContext,
	BrowserProjectionContext,
} from "../../../codex-workbench/index.js";
import {
	createCanvasBrowserGatewayOptions,
	createCanvasBrowserProjectionBudget,
	createCanvasDynamicApprovalOwner,
	type CanvasBrowserBindingState,
	type CanvasTimelineOwner,
} from "../../codex-workbench-adapters.js";
import { createCodexWorkbenchGenerationFixture } from "./codex-workbench-generation-fixture.js";
import { processFacts } from "./codex-workbench-process-fixture.js";

/** The production browser adapter over the generation fixture, live sources injectable. */
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

export function executableLink(authorities: IdentityAuthorities): ThreadLinkSnapshot {
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

export interface ProjectionHarness {
	readonly options: ReturnType<typeof createCanvasBrowserGatewayOptions>;
	readonly state: CanvasBrowserBindingState;
	readonly context: BrowserProjectionContext;
	readonly actionContext: BrowserActionContext;
	readonly loginId: ReturnType<IdentityAuthorities["identity"]["decoder"]["adoptLoginId"]>;
	readonly threadId: ReturnType<typeof executableLink>["threadId"];
	setFacts: (value: ReturnType<typeof processFacts>) => void;
	setCoordinatorReady: (value: boolean) => void;
	readonly authorities: IdentityAuthorities;
	/** The operation authority the production adapter itself resolves against. */
	readonly operations: IdentityAuthorities["operation"];
}

type FixtureComponents = ReturnType<typeof createCodexWorkbenchGenerationFixture>["components"];

export interface HarnessOverrides {
	/** A live workhorse and queue, for the paths that read authoritative state. */
	readonly workhorse?: Partial<FixtureComponents["workhorse"]>;
	readonly queue?: Partial<FixtureComponents["queue"]>;
}

/** One production adapter over the generation fixture, with its live sources injectable. */
export function projectionHarness(overrides: HarnessOverrides = {}): ProjectionHarness {
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
		workhorse: { ...fixture.workhorse, ...overrides.workhorse },
		queue: { ...fixture.queue, ...overrides.queue },
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
		authorities,
		operations: components.identity.operation,
	};
}

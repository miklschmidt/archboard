import type { IdentityAuthorities } from "../../../../shared/codex-workbench-identity/index.js";
import type { ThreadLinkSnapshot } from "../../../../runtime/codex-thread-link/index.js";
import type { ArchboardContext } from "../../../../runtime/codex-instructions/index.js";
import type { TransportServerNotification } from "../../../../runtime/codex-transport/index.js";
import {
	parseTabSessionId,
	type BrowserActionContext,
	type BrowserProjectionContext,
} from "../../../codex-workbench/index.js";
import {
	createCodexWorkbenchSessions,
	SHARED_TAB_SESSION_ID,
	type CodexWorkbenchSessionComponents,
	type CodexWorkbenchTabSession,
} from "../../codex-workbench-generation.js";
import {
	createServerBrowserGatewayOptions,
	createServerBrowserProjectionBudget,
	createServerDynamicApprovalOwner,
	type ServerBrowserBindingState,
	type ServerTimelineOwner,
} from "../../codex-workbench-adapters.js";
import { createCodexWorkbenchGenerationFixture } from "./codex-workbench-generation-fixture.js";
import { processFacts } from "./codex-workbench-process-fixture.js";

/** The production browser adapter over the generation fixture, live sources injectable. */
const archboardContext: ArchboardContext = {
	schema: 1,
	paneId: "pane-readiness",
	board: { name: "Fixture board", key: "fixture board", version: 1, cursor: null },
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
	variant: null,
	view: null,
	selection: { count: 0, subjects: [], capturedAtMs: 1 },
	reconciliation: { required: false, count: 0, blockedBy: null, issues: [] },
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
	readonly options: ReturnType<typeof createServerBrowserGatewayOptions>;
	readonly state: ServerBrowserBindingState;
	/** The one tab session the adapter reads, whose queue listing a test can set. */
	readonly session: CodexWorkbenchTabSession;
	readonly context: BrowserProjectionContext;
	readonly actionContext: BrowserActionContext;
	readonly loginId: ReturnType<IdentityAuthorities["identity"]["decoder"]["adoptLoginId"]>;
	readonly threadId: ReturnType<typeof executableLink>["threadId"];
	setFacts: (value: ReturnType<typeof processFacts>) => void;
	readonly authorities: IdentityAuthorities;
	/** The operation authority the production adapter itself resolves against. */
	readonly operations: IdentityAuthorities["operation"];
	readonly notifyAccount: (event: TransportServerNotification) => void;
}

type FixtureComponents = ReturnType<typeof createCodexWorkbenchGenerationFixture>["components"];
type FixtureSessionComponents = CodexWorkbenchSessionComponents;

interface HarnessOverrides {
	readonly session?: Partial<FixtureComponents["session"]>;
	readonly coordinator?: Partial<FixtureSessionComponents["coordinator"]>;
	/** The clock the authoritative re-read floor reads. */
	readonly now?: () => number;
	/** A live workhorse and queue, for the paths that read authoritative state. */
	readonly workhorse?: Partial<FixtureSessionComponents["workhorse"]>;
	readonly queue?: Partial<FixtureSessionComponents["queue"]>;
	readonly spokenApproval?: Partial<FixtureSessionComponents["spokenApproval"]>;
	/** Exact realtime and callback evidence supplied to the browser projection. */
	readonly voiceContext?: (authorities: IdentityAuthorities) => {
		readonly realtime: Partial<FixtureSessionComponents["realtime"]>;
		readonly callbacks: Partial<FixtureSessionComponents["callbacks"]>;
	};
}

/** One production adapter over the generation fixture, with its live sources injectable. */
function projectionHarness(overrides: HarnessOverrides = {}): ProjectionHarness {
	const generation = createCodexWorkbenchGenerationFixture([]);
	const fixture = generation.components;
	const fixtureSession = generation.sessionComponents;
	const authorities = fixture.identity;
	const accountListeners = new Set<(event: TransportServerNotification) => void>();
	const harnessLoginId = authorities.identity.decoder.adoptLoginId("login-readiness");
	const harnessCommandId = authorities.identity.issuer.mintBrowserCommandId();
	let facts = processFacts({ state: "starting", ready: false });
	const voiceContext = overrides.voiceContext?.(authorities);
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
			...overrides.session,
		},
	};
	const sessionComponents: CodexWorkbenchSessionComponents = {
		...fixtureSession,
		coordinator: { ...fixtureSession.coordinator, ...overrides.coordinator },
		workhorse: { ...fixtureSession.workhorse, ...overrides.workhorse },
		queue: { ...fixtureSession.queue, ...overrides.queue },
		spokenApproval: { ...fixtureSession.spokenApproval, ...overrides.spokenApproval },
		realtime: { ...fixtureSession.realtime, ...voiceContext?.realtime },
		callbacks: { ...fixtureSession.callbacks, ...voiceContext?.callbacks },
	};
	const sessions = createCodexWorkbenchSessions({
		identity: authorities.identity,
		transport: fixture.transport,
		build: () => ({ components: sessionComponents, actions: generation.tabSession.actions }),
	});
	const session = sessions.open(SHARED_TAB_SESSION_ID);
	const state: ServerBrowserBindingState = {
		account: { kind: "account", state: "unknown", reason: "not read" },
		login: { kind: "login", state: "idle" },
	};
	const timeline: ServerTimelineOwner = {
		read: () => null,
		onNotification: () => undefined,
		retire: () => undefined,
		dispose: () => undefined,
	};
	const options = createServerBrowserGatewayOptions({
		components,
		sessions,
		dynamicApprovals: createServerDynamicApprovalOwner({
			identity: authorities,
			now: () => 1,
			bindingForCaller: () => {
				throw new Error("The projection owner issues no dynamic approvals.");
			},
		}),
		state,
		timeline,
		budget: createServerBrowserProjectionBudget(),
		leaseLedger: { sessions: new Map() },
		process: () => facts,
		...(overrides.now === undefined ? {} : { now: overrides.now }),
		contextForOperation: () => archboardContext,
		onChange: () => () => undefined,
		onAccountNotification: (listener) => {
			accountListeners.add(listener);
			return () => void accountListeners.delete(listener);
		},
	});
	const link = executableLink(authorities);
	return {
		options,
		state,
		session,
		threadId: link.threadId,
		context: {
			browserId: "browser-projection",
			paneId: "pane-readiness",
			connection: {},
			tabSessionId: parseTabSessionId("tab-one")!,
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
			tabSessionId: parseTabSessionId("tab-one")!,
			commandId: harnessCommandId,
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			link,
			linkRevision: 1,
		},
		loginId: harnessLoginId,
		setFacts: (value) => void (facts = value),
		authorities,
		operations: components.identity.operation,
		notifyAccount: (event) => {
			for (const listener of accountListeners) {
				listener(event);
			}
		},
	};
}

export { executableLink, type ProjectionHarness, type HarnessOverrides, projectionHarness };

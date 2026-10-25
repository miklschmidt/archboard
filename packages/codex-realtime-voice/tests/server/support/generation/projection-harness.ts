import {
	TEST_CONTEXT_CODEC,
	TEST_CONTEXT_SCHEMA,
	testContextFixture,
} from "#tests/runtime/support/host.ts";
import type { IdentityAuthorities } from "@archboard/codex-app-server/identity";
import type { ThreadLinkSnapshot } from "#runtime/rules/thread-link/contract.ts";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import { parseTabSessionId, workhorseLinkKey } from "#server/rules/tab-session/tab-session.ts";
import {
	type BrowserActionContext,
	type BrowserProjectionContext,
} from "#server/protocol/gateway/contract.ts";
import { createCodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";
import {
	type CodexWorkbenchSessionComponents,
	type CodexWorkbenchTabSession,
} from "#server/protocol/generation/session-contract.ts";
import {
	type CodexWorkbenchWorkhorse,
	type CodexWorkbenchWorkhorseComponents,
} from "#server/services/sessions/workhorses.ts";
import { createServerBrowserGatewayOptions } from "#server/services/actions/browser-gateway.ts";
import { createServerBrowserProjectionBudget } from "#server/projections/timeline/budget.ts";
import { type ServerBrowserBindingState } from "#server/projections/browser-state/binding-state.ts";
import { type ServerTimelineOwner } from "#server/projections/timeline/timeline.ts";
import { createCodexWorkbenchGenerationFixture } from "#tests/server/support/generation/generation-fixture.ts";
import { processFacts } from "#tests/server/support/generation/process-fixture.ts";
import { createWorkhorseComponentsFixture } from "#tests/server/support/generation/session-fixture.ts";

/** The checkout every pane of the harness is in, so its one workhorse is the one it shows. */
const HARNESS_CHECKOUT = "/work/payments";

/** The production browser adapter over the generation fixture, live sources injectable. */
const executionContext = TEST_CONTEXT_SCHEMA.parse({
	...testContextFixture,
	paneId: "pane-readiness",
});

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
	/** The one tab session the adapter reads. */
	readonly session: CodexWorkbenchTabSession;
	/** The workhorse of the harness's checkout, whose queue listing a test can set. */
	readonly workhorse: CodexWorkbenchWorkhorse;
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
type FixtureWorkhorseComponents = CodexWorkbenchWorkhorseComponents;

interface HarnessOverrides {
	readonly session?: Partial<FixtureComponents["session"]>;
	readonly coordinator?: Partial<FixtureSessionComponents["coordinator"]>;
	/** The clock the authoritative re-read floor reads. */
	readonly now?: () => number;
	/** A live workhorse and queue, for the paths that read authoritative state. */
	readonly workhorse?: Partial<FixtureWorkhorseComponents["workhorse"]>;
	readonly queue?: Partial<FixtureWorkhorseComponents["queue"]>;
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
		spokenApproval: { ...fixtureSession.spokenApproval, ...overrides.spokenApproval },
		realtime: { ...fixtureSession.realtime, ...voiceContext?.realtime },
		callbacks: { ...fixtureSession.callbacks, ...voiceContext?.callbacks },
	};
	const sessions = createCodexWorkbenchSessions({
		resolveCheckout: (named) => named,
		identity: authorities.identity,
		transport: fixture.transport,
		session: fixture.session,
		threadLink: fixture.threadLink,
		endApprovals: async () => undefined,
		shownConversationOf: () => null,
		build: () => ({ components: sessionComponents, actions: generation.tabSession.actions }),
		buildWorkhorse: () => {
			const fixtureWorkhorse = createWorkhorseComponentsFixture([]);
			return {
				components: {
					...fixtureWorkhorse,
					workhorse: { ...fixtureWorkhorse.workhorse, ...overrides.workhorse },
					queue: { ...fixtureWorkhorse.queue, ...overrides.queue },
				},
				actions: {
					threadLinks: { create: async () => ({ outcome: "delivered" as const }) },
					ensureStarted: async () => undefined,
				},
			};
		},
	});
	const session = sessions.open(parseTabSessionId("tab-one")!);
	const workhorse = session.workhorse(HARNESS_CHECKOUT);
	const key = workhorseLinkKey(session.id, HARNESS_CHECKOUT);
	const state: ServerBrowserBindingState = {
		account: { kind: "account", state: "unknown", reason: "not read" },
		login: { kind: "login", state: "idle" },
	};
	const timeline: ServerTimelineOwner = {
		read: () => null,
		readTarget: () => null,
		onNotification: () => undefined,
		retire: () => undefined,
		dispose: () => undefined,
	};
	const options = createServerBrowserGatewayOptions({
		contextCodec: TEST_CONTEXT_CODEC,
		components,
		checkoutLabel: (checkout) => checkout,
		sessions,
		dynamicApprovals: null,
		state,
		timeline,
		coordinatorTimeline: timeline,
		budget: createServerBrowserProjectionBudget(),
		leaseLedger: { sessions: new Map() },
		process: () => facts,
		...(overrides.now === undefined ? {} : { now: overrides.now }),
		contextForOperation: () => executionContext,
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
		workhorse,
		threadId: link.threadId,
		context: {
			browserId: "browser-projection",
			paneId: "pane-readiness",
			connection: {},
			tabSessionId: parseTabSessionId("tab-one")!,
			checkout: HARNESS_CHECKOUT,
			// A link is keyed by its workhorse: its tab session and its checkout.
			binding: {
				paneId: key,
				revision: 1,
				link,
				cas: {
					revision: 1,
					paneId: key,
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
			checkout: HARNESS_CHECKOUT,
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

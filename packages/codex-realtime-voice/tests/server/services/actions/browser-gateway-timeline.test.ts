import { TEST_CONTEXT_CODEC, testContextFixture } from "#tests/runtime/support/host.ts";
import { expect, test } from "bun:test";

import type { ThreadLinkSnapshot } from "#runtime/rules/thread-link/contract.ts";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
	type ThreadId,
} from "@archboard/codex-app-server/identity";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { type BrowserProjectionContext } from "#server/protocol/gateway/contract.ts";
import { type CodexTimelineProjectionInput } from "#server/protocol/projection/projection-contract.ts";
import { createServerBrowserProjectionBudget } from "#server/projections/timeline/budget.ts";
import { createServerBrowserGatewayOptions } from "#server/services/actions/browser-gateway.ts";
import { type ServerBrowserBindingState } from "#server/projections/browser-state/binding-state.ts";
import { type ServerTimelineOwner } from "#server/projections/timeline/timeline.ts";
import { createCodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";
import { createCodexWorkbenchGenerationFixture } from "#tests/server/support/generation/generation-fixture.ts";
import { runningProcessFacts } from "#tests/server/support/generation/process-fixture.ts";
import { createWorkhorseComponentsFixture } from "#tests/server/support/generation/session-fixture.ts";

function executableLink(
	authorities: IdentityAuthorities,
	threadId: ReturnType<IdentityAuthorities["identity"]["decoder"]["adoptThreadId"]>,
): ThreadLinkSnapshot {
	return {
		kind: "thread_link",
		state: "executable",
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		threadId,
		source: "appServer",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

test("server gateway binds exact connection reads and retires it at disconnect", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("gateway-timeline-thread");
	const link = executableLink(authorities, threadId);
	const connection = {};
	const timelineValue: CodexTimelineProjectionInput = {
		kind: "codex_timeline",
		threadId,
		turns: [],
		cursor: null,
		usage: null,
	};
	const received: {
		read: {
			chatId: string;
			revision: number;
			link: ThreadLinkSnapshot;
			capable: boolean;
			connection: object;
		} | null;
		retire: { chatId: string; connection: object } | null;
	} = { read: null, retire: null };
	const timeline: ServerTimelineOwner = {
		read: (chatId, revision, receivedLink, capable, receivedConnection) => {
			received.read = {
				chatId,
				revision,
				link: receivedLink,
				capable,
				connection: receivedConnection,
			};
			return timelineValue;
		},
		readTarget: () => null,
		onNotification: () => undefined,
		retire: (chatId, receivedConnection) => {
			received.retire = { chatId, connection: receivedConnection };
		},
		dispose: () => undefined,
	};
	const fixture = createCodexWorkbenchGenerationFixture([]);
	const coordinator = fixture.sessionComponents.coordinator;
	// The live voice session presents a narrative, which the host says nobody listens to live.
	const narrative = { topic: "tour" };
	const sessions = createCodexWorkbenchSessions({
		resolveCheckout: (named) => named,
		identity: authorities.identity,
		transport: fixture.components.transport,
		session: fixture.components.session,
		threadLink: fixture.components.threadLink,
		endApprovals: async () => undefined,
		shownConversationOf: () => null,
		build: () => ({
			components: {
				...fixture.sessionComponents,
				realtime: { ...fixture.sessionComponents.realtime, narrative: () => narrative },
				coordinator: {
					...coordinator,
					snapshot: () => ({ ...coordinator.snapshot(), state: "ready" as const }),
				},
			},
			actions: fixture.tabSession.actions,
		}),
		buildWorkhorse: inertWorkhorse,
	});
	const tabSessionId = parseTabSessionId("tab-one")!;
	sessions.open(tabSessionId);
	const state = {
		account: {
			kind: "codex_account_response",
			response: {
				account: { type: "chatgpt", email: "fixture@example.test", planType: "plus" },
				requiresOpenaiAuth: true,
				workspaceRouting: null,
			},
		},
		login: { kind: "login", state: "idle" },
	} satisfies ServerBrowserBindingState;
	const asked: unknown[] = [];
	const budget = createServerBrowserProjectionBudget();
	const options = createServerBrowserGatewayOptions({
		components: fixture.components,
		checkoutLabel: (checkout: string) => checkout,
		sessions,
		dynamicApprovals: null,
		narrative: {
			prepare: (input) => input ?? narrative,
			unattended: (presented) => {
				asked.push(presented);
				return true;
			},
		},
		state,
		timeline,
		coordinatorTimeline: timeline,
		budget,
		leaseLedger: { sessions: new Map() },
		process: () => runningProcessFacts(),
		contextCodec: TEST_CONTEXT_CODEC,
		contextForOperation: () => testContextFixture,
		onChange: () => () => undefined,
		onAccountNotification: () => () => undefined,
	});
	const context = {
		browserId: "browser-timeline",
		chatId: "chat-timeline",
		tabSessionId,
		checkout: "/work/payments",
		binding: {
			linkKey: "link-timeline",
			revision: 7,
			link,
			cas: {
				revision: 7,
				linkKey: "link-timeline",
				childId: link.childId,
				epoch: link.epoch,
				threadId,
			},
		},
		lease: null,
		mediaReady: false,
		connection,
	} satisfies BrowserProjectionContext;
	const projected = options.projection.read(context);
	expect(projected.timeline).toBe(timelineValue);
	expect(projected.dynamicApprovals).toEqual([]);
	expect(projected.voice.unattended).toBe(true);
	expect(asked).toEqual([narrative]);
	await expect(
		options.actions.dynamicApprovals.resolve({} as never, {} as never),
	).rejects.toMatchObject({
		code: "invalid_command",
		outcome: "not_delivered",
	});
	expect(received.read).toEqual({
		chatId: "chat-timeline",
		revision: 7,
		link,
		capable: true,
		connection,
	});
	options.projection.onBrowserDisconnect?.(
		{ browserId: "browser-timeline", chatId: "chat-timeline", connection },
		"browser_disconnected",
	);
	expect(received.retire).toEqual({ chatId: "chat-timeline", connection });
});

/** A workhorse that is never asked anything: these projections read no workhorse. */
function inertWorkhorse() {
	return { components: createWorkhorseComponentsFixture([]), actions: {} as never };
}

function timelineFor(threadId: ThreadId): CodexTimelineProjectionInput {
	return { kind: "codex_timeline", threadId, turns: [], cursor: null, usage: null };
}

test("a chat's snapshot carries its own tab's coordinator turns, never another tab's", () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const workhorseLink = executableLink(authorities, decoder.adoptThreadId("workhorse-thread"));
	const coordinatorThreads = new Map([
		["tab-one", decoder.adoptThreadId("coordinator-one")],
		["tab-two", decoder.adoptThreadId("coordinator-two")],
	]);
	const read: { chatId: string; threadId: ThreadId | null }[] = [];
	const coordinatorTimeline: ServerTimelineOwner = {
		read: () => null,
		readTarget: (chatId, target) => {
			read.push({ chatId, threadId: target.threadId });
			return target.threadId === null ? null : timelineFor(target.threadId);
		},
		onNotification: () => undefined,
		retire: () => undefined,
		dispose: () => undefined,
	};
	const fixture = createCodexWorkbenchGenerationFixture([]);
	const sessions = createCodexWorkbenchSessions({
		resolveCheckout: (named) => named,
		identity: authorities.identity,
		transport: fixture.components.transport,
		session: fixture.components.session,
		threadLink: fixture.components.threadLink,
		endApprovals: async () => undefined,
		shownConversationOf: () => null,
		build: (scope) => ({
			components: {
				...fixture.sessionComponents,
				coordinator: {
					...fixture.sessionComponents.coordinator,
					snapshot: () => ({
						...fixture.sessionComponents.coordinator.snapshot(),
						threadId: coordinatorThreads.get(scope.id) ?? null,
					}),
				},
			},
			actions: fixture.tabSession.actions,
		}),
		buildWorkhorse: inertWorkhorse,
	});
	const options = createServerBrowserGatewayOptions({
		components: fixture.components,
		checkoutLabel: (checkout: string) => checkout,
		sessions,
		dynamicApprovals: null,
		state: {
			account: { kind: "account", state: "unknown", reason: "not read" },
			login: { kind: "login", state: "idle" },
		},
		timeline: { ...coordinatorTimeline, read: () => null },
		coordinatorTimeline,
		budget: createServerBrowserProjectionBudget(),
		leaseLedger: { sessions: new Map() },
		process: () => runningProcessFacts(),
		contextCodec: TEST_CONTEXT_CODEC,
		contextForOperation: () => testContextFixture,
		onChange: () => () => undefined,
		onAccountNotification: () => () => undefined,
	});
	const contextFor = (tab: string): BrowserProjectionContext => {
		const tabSessionId = parseTabSessionId(tab)!;
		sessions.open(tabSessionId);
		return {
			browserId: `browser-${tab}`,
			chatId: `chat-${tab}`,
			tabSessionId,
			checkout: "/work/payments",
			binding: {
				linkKey: tab,
				revision: 1,
				link: workhorseLink,
				cas: {
					revision: 1,
					linkKey: tab,
					childId: workhorseLink.childId,
					epoch: workhorseLink.epoch,
					threadId: workhorseLink.threadId,
				},
			},
			lease: null,
			mediaReady: false,
			connection: {},
		};
	};

	const one = options.projection.read(contextFor("tab-one")).coordinatorTimeline;
	const two = options.projection.read(contextFor("tab-two")).coordinatorTimeline;

	expect(one?.threadId).toBe(coordinatorThreads.get("tab-one"));
	expect(two?.threadId).toBe(coordinatorThreads.get("tab-two"));
	expect(read.map((entry) => entry.chatId)).toEqual(["chat-tab-one", "chat-tab-two"]);
});

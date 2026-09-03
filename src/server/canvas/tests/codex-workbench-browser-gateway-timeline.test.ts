import { expect, test } from "bun:test";

import type { ThreadLinkSnapshot } from "../../../runtime/codex-thread-link/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import type { BrowserProjectionContext } from "../../codex-workbench/index.js";
import {
	createCanvasBrowserGatewayOptions,
	type CanvasBrowserBindingState,
	type CanvasTimelineOwner,
} from "../codex-workbench-adapters.js";
import type { CodexWorkbenchComponents } from "../codex-workbench-generation.js";

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

test("canvas gateway binds exact connection reads and retires it at disconnect", () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("gateway-timeline-thread");
	const link = executableLink(authorities, threadId);
	const connection = {};
	const timelineValue = { kind: "codex_timeline", threadId, turns: [], cursor: null } as never;
	const received: {
		read: {
			paneId: string;
			revision: number;
			link: ThreadLinkSnapshot;
			capable: boolean;
			connection: object;
		} | null;
		retire: { paneId: string; connection: object } | null;
	} = { read: null, retire: null };
	const timeline: CanvasTimelineOwner = {
		read: (paneId, revision, receivedLink, capable, receivedConnection) => {
			received.read = {
				paneId,
				revision,
				link: receivedLink,
				capable,
				connection: receivedConnection,
			};
			return timelineValue;
		},
		onNotification: () => undefined,
		retire: (paneId, receivedConnection) => {
			received.retire = { paneId, connection: receivedConnection };
		},
		dispose: () => undefined,
	};
	const components = {
		identity: { operation: { issuer: { mintOperationId: () => "operation" as never } } },
		workhorse: { snapshot: () => ({ state: "stopped", start: null }) },
		coordinator: {
			snapshot: () => ({
				state: "unbound",
				threadId: null,
				configured: null,
				effective: null,
				approvalPolicy: null,
				approvalsReviewer: null,
				sandboxPolicy: null,
				activePermissionProfile: null,
			}),
		},
		semanticDelivery: { inspect: () => [], snapshot: () => ({ binding: null }) },
		semanticPublisher: {},
		realtime: { generation: () => null, transcript: () => [] },
		approvals: { inspectViews: () => [] },
	} as unknown as Omit<CodexWorkbenchComponents, "gateway">;
	const state = {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "unknown", reason: "fixture" },
		login: { kind: "login", state: "idle" },
		queue: { kind: "codex_queue", submissions: null },
	} as CanvasBrowserBindingState;
	const options = createCanvasBrowserGatewayOptions({
		components,
		dynamicApprovals: {
			pending: () => [],
			bindLease: () => undefined,
			browser: { pending: () => [] },
		} as never,
		state,
		timeline,
		leaseLedger: { active: null, retired: new Map() },
		checkoutRoot: "/repo",
		contextForOperation: () => ({}) as never,
		onChange: () => () => undefined,
	});
	const context = {
		browserId: "browser-timeline",
		paneId: "pane-timeline",
		binding: {
			paneId: "pane-timeline",
			revision: 7,
			link,
			cas: {
				revision: 7,
				paneId: "pane-timeline",
				childId: link.childId,
				epoch: link.epoch,
				threadId,
			},
		},
		lease: null,
		mediaReady: false,
		connection,
	} satisfies BrowserProjectionContext;
	expect(options.projection.read(context).timeline).toBe(timelineValue);
	expect(received.read).toEqual({
		paneId: "pane-timeline",
		revision: 7,
		link,
		capable: true,
		connection,
	});
	options.projection.onBrowserDisconnect?.(
		{ browserId: "browser-timeline", paneId: "pane-timeline", connection },
		"browser_disconnected",
	);
	expect(received.retire).toEqual({ paneId: "pane-timeline", connection });
});

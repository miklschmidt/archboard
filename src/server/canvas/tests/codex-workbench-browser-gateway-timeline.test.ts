import { expect, test } from "bun:test";

import type { ThreadLinkSnapshot } from "../../../runtime/codex-thread-link/index.js";
import type { ArchboardContext } from "../../../runtime/codex-instructions/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	BrowserProjectionContext,
	CodexTimelineProjectionInput,
} from "../../codex-workbench/index.js";
import {
	createCanvasBrowserProjectionBudget,
	createCanvasBrowserGatewayOptions,
	createCanvasDynamicApprovalOwner,
	type CanvasBrowserBindingState,
	type CanvasTimelineOwner,
} from "../codex-workbench-adapters.js";
import { createCodexWorkbenchGenerationFixture } from "./support/codex-workbench-generation-fixture.js";

const archboardContext: ArchboardContext = {
	schema: 1,
	paneId: "pane-timeline",
	board: { note: "vault/board.md", version: 1, cursor: null },
	threadLink: { state: "executable", reason: null },
	child: { id: "child", epoch: "epoch" },
	workhorse: { threadId: "thread", turnId: null },
	coordinator: { threadId: null, realtimeSessionId: null },
	semantic: {
		brief: "Timeline projection fixture.",
		capturedAtMs: 1,
		freshUntilMs: 2,
		truncated: false,
	},
	focus: { paneId: "pane-timeline", capturedAtMs: 1 },
	selection: { elementIds: [], capturedAtMs: 1 },
	claim: { holder: "none", doing: null },
	ambiguity: [],
	operation: { id: null, kind: null, rpc: null, outcome: null },
};

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
	const timelineValue: CodexTimelineProjectionInput = {
		kind: "codex_timeline",
		threadId,
		turns: [],
		cursor: null,
	};
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
	const components = createCodexWorkbenchGenerationFixture([]).components;
	Object.assign(components.workhorse, {
		snapshot: () => ({ state: "stopped", start: null }),
	});
	Object.assign(components.coordinator, {
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
	});
	Object.assign(components.semanticDelivery, {
		inspect: () => [],
		snapshot: () => ({ binding: null }),
	});
	Object.assign(components.realtime, { generation: () => null, transcript: () => [] });
	Object.assign(components.approvals, { inspectViews: () => [] });
	const state = {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "unknown", reason: "fixture" },
		login: { kind: "login", state: "idle" },
		queue: { kind: "codex_queue", submissions: null },
	} satisfies CanvasBrowserBindingState;
	const dynamicApprovals = createCanvasDynamicApprovalOwner({
		identity: authorities,
		now: () => 1,
		bindingForCaller: () => ({
			commandId: authorities.identity.issuer.mintBrowserCommandId(),
			paneId: "pane-timeline",
			capturedLink: {
				threadId,
				childId: authorities.identity.validator.childId,
				epoch: authorities.identity.validator.epoch,
			},
		}),
	});
	const budget = createCanvasBrowserProjectionBudget();
	const options = createCanvasBrowserGatewayOptions({
		components,
		dynamicApprovals,
		state,
		timeline,
		budget,
		leaseLedger: { active: null, retired: new Map() },
		checkoutRoot: "/repo",
		contextForOperation: () => archboardContext,
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

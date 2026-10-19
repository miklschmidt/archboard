import {
	createDynamicAuthorityTokenIssuer,
	type DynamicToolApprovalRequest,
} from "../../../runtime/codex-dynamic-tools/index.js";
import {
	createIdentityAuthorities,
	type ChildEpoch,
	type ChildId,
	type IdentityAuthorities,
	type ThreadId,
	type TurnId,
	type BrowserCommandId,
} from "@archboard/codex-app-server/identity";
import { EMPTY_SPOKEN_APPROVAL_SNAPSHOT } from "../../../runtime/codex-spoken-approval/index.js";
import { createCodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import type {
	DynamicApprovalOwnerView,
	BrowserOwnerProjection,
	BrowserReadiness,
	BrowserWorkbenchActions,
	BrowserActionResult,
	BrowserProjectionPort,
	BrowserDisconnectReason,
	BrowserLeaseLedger,
	BrowserLifecyclePort,
	CodexWorkbenchGateway,
	BrowserConnectionInstance,
	BrowserWorkbenchConnection,
	TabSessionId,
} from "../index.js";
import { createCodexWorkbenchGateway, parseTabSessionId } from "../index.js";
import type {
	ThreadLinkBindingSnapshot,
	ThreadLinkSnapshot,
} from "../../../runtime/codex-thread-link/index.js";
import type { ApprovalOwnerView } from "../../../runtime/codex-approvals/index.js";
import { commandApprovalOwnerFixture } from "./approval-owner-fixture.js";
import {
	CLOCK_START,
	bindingFor,
	executableLink,
	readinessFor,
	readyAccount,
} from "./support-values.js";

export { commandTarget } from "./support-values.js";

export interface GatewayHarness {
	readonly authorities: IdentityAuthorities;
	readonly model: ReturnType<typeof createCodexBrowserModel>;
	readonly gateway: CodexWorkbenchGateway;
	/** Connect the harness's own browser pane, in its own tab session. */
	readonly open: (instance?: BrowserConnectionInstance) => BrowserWorkbenchConnection;
	readonly browserId: string;
	readonly paneId: string;
	readonly tabSessionId: TabSessionId;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly calls: string[];
	/** The context each action that ran was handed, in order. */
	readonly actionContexts: unknown[];
	/** Why each browser that went told voice it had gone, in order. */
	readonly disconnectReasons: BrowserDisconnectReason[];
	/** How many of those voice settlements finished. */
	readonly disconnectSettled: string[];
	readonly publishedAcknowledgements: string[];
	readonly realtimeActive: () => boolean;
	readonly advance: (milliseconds: number) => void;
	readonly setReadiness: (state: BrowserReadiness["state"]) => void;
	readonly setLink: (link: ThreadLinkSnapshot) => void;
	readonly setOrdinaryApproval: (approval: ApprovalOwnerView | null, notify?: boolean) => void;
	readonly setDynamicApprovals: (approvals: readonly DynamicApprovalOwnerView[]) => void;
	readonly emitProjectionChange: () => void;
	readonly setActionError: (error: unknown) => void;
	readonly setActionResult: (result: BrowserActionResult | undefined) => void;
	readonly setActionGate: (gate: Promise<BrowserActionResult> | null) => void;
	/** Hold voice's disconnect settlement until the gate resolves. */
	readonly setDisconnectGate: (gate: Promise<void> | null) => void;
	/** Fail voice's disconnect settlement. */
	readonly setDisconnectError: (error: unknown) => void;
	/** End the tab session, as the server does after its grace: its approvals settle, its lease goes. */
	readonly endSession: () => void;
	readonly binding: () => ThreadLinkBindingSnapshot;
	readonly makeOrdinaryApproval: (targetThreadId?: ThreadId) => ApprovalOwnerView;
	readonly makeDynamicApproval: (
		commandId: BrowserCommandId,
		targetThreadId?: ThreadId,
	) => DynamicApprovalOwnerView;
}

export interface GatewayHarnessOptions {
	readonly snapshotMaxBytes?: number;
	readonly project?: (projection: BrowserOwnerProjection) => BrowserOwnerProjection;
	/** The lease ledger the server keeps across generations. */
	readonly leaseLedger?: BrowserLeaseLedger;
	/** The checkout of each browser's pane; one checkout for every pane by default. */
	readonly checkoutOf?: (browserId: string) => string;
	/** The link under one workhorse's link key; the harness's own link by default. */
	readonly linkFor?: (key: string) => ThreadLinkSnapshot | null;
	/** The checkout of the workhorse that asked the approval; the tab's coordinator by default. */
	readonly approvalCheckout?: string;
}

export function createGatewayHarness(
	authorities: IdentityAuthorities = createIdentityAuthorities(),
	lifecycle?: BrowserLifecyclePort,
	onProjectionDisconnect?: BrowserProjectionPort["onBrowserDisconnect"],
	options: GatewayHarnessOptions = {},
): GatewayHarness {
	const model = createCodexBrowserModel(authorities);
	const childId = model.ChildIdSchema.parse(authorities.identity.validator.childId);
	const epoch = model.ChildEpochSchema.parse(authorities.identity.validator.epoch);
	const threadId = model.ThreadIdSchema.parse(
		authorities.identity.decoder.adoptThreadId("gateway-thread"),
	);
	const turnId = model.TurnIdSchema.parse(authorities.identity.decoder.adoptTurnId("gateway-turn"));
	const loginId = model.LoginIdSchema.parse(
		authorities.identity.decoder.adoptLoginId("gateway-login"),
	);
	const requestId = model.JsonRpcRequestIdSchema.parse(
		authorities.identity.decoder.adoptJsonRpcRequestId("gateway-request"),
	);
	const itemId = model.ItemIdSchema.parse(authorities.identity.decoder.adoptItemId("gateway-item"));
	const approvalId = model.ApprovalIdSchema.parse(
		authorities.identity.decoder.adoptApprovalId("gateway-approval"),
	);
	const browserId = "browser-one";
	const paneId = "pane-one";
	const tabSessionId = parseTabSessionId("tab-one")!;
	let clock = CLOCK_START;
	let readiness: BrowserReadiness = readinessFor("thread_capable", loginId);
	let account: BrowserOwnerProjection["account"] = readyAccount();
	let link: ThreadLinkSnapshot = executableLink(childId, epoch, threadId);
	let revision = 0;
	let ordinaryApproval: ApprovalOwnerView | null = null;
	let dynamicApprovals: readonly DynamicApprovalOwnerView[] = [];
	let actionError: unknown = null;
	let actionResult: BrowserActionResult | undefined;
	let actionGate: Promise<BrowserActionResult> | null = null;
	let disconnectGate: Promise<void> | null = null;
	let disconnectError: unknown = null;
	const calls: string[] = [];
	const actionContexts: unknown[] = [];
	const disconnectReasons: BrowserDisconnectReason[] = [];
	const disconnectSettled: string[] = [];
	const publishedAcknowledgements: string[] = [];
	let realtimeActive = false;
	const projectionListeners = new Set<() => void>();

	const run = async (name: string): Promise<BrowserActionResult> => {
		calls.push(name);
		if (actionError !== null) throw actionError;
		if (actionGate !== null) return actionGate;
		return actionResult;
	};
	const action =
		(name: string) =>
		async (...args: readonly unknown[]): Promise<BrowserActionResult> => {
			actionContexts.push(args.at(-1));
			return run(name);
		};
	const settleDisconnect = async (): Promise<void> => {
		if (disconnectGate !== null) await disconnectGate;
		if (disconnectError !== null) throw disconnectError;
		disconnectSettled.push("realtime");
	};
	const actions: BrowserWorkbenchActions = {
		account: {
			read: action("account.read"),
			login: action("account.login"),
			loginCancel: action("account.loginCancel"),
			logout: action("account.logout"),
		},
		threadLinks: {
			create: action("threadLink.create"),
		},
		text: {
			start: action("text.start"),
			steer: action("text.steer"),
			interrupt: action("text.interrupt"),
		},
		queue: {
			add: action("queue.add"),
			update: action("queue.update"),
			delete: action("queue.delete"),
			reorder: action("queue.reorder"),
			start: action("queue.start"),
		},
		realtime: {
			start: async (..._args) => {
				const result = await run("realtime.start");
				realtimeActive = true;
				return result;
			},
			appendText: action("realtime.appendText"),
			stop: async (..._args) => {
				const result = await run("realtime.stop");
				realtimeActive = false;
				return result;
			},
			onBrowserDisconnect: (_context, reason) => {
				disconnectReasons.push(reason);
				realtimeActive = false;
				return settleDisconnect();
			},
		},
		ordinaryApprovals: {
			pending: (candidate) =>
				candidate === requestId && ordinaryApproval?.snapshot.state === "pending"
					? ordinaryApproval
					: null,
			resolve: async () => {
				const result = await run("approval.resolve");
				if (ordinaryApproval !== null)
					ordinaryApproval = {
						...ordinaryApproval,
						snapshot: {
							...ordinaryApproval.snapshot,
							state: "settled",
							decision: "approved",
							outcome: "delivered",
							reason: "The approval settled.",
						},
						spoken: { eligible: false, reason: "not_pending" },
					};
				return result;
			},
			acknowledge: (candidate) => {
				if (candidate === requestId) ordinaryApproval = null;
			},
			unpresentedTerminals: () =>
				ordinaryApproval?.terminalDelivery === "after_publish"
					? [{ requestId, tabSessionId, checkout: options.approvalCheckout ?? null }]
					: [],
			acknowledgePublished: (candidates) => {
				publishedAcknowledgements.push(...candidates);
				if (
					ordinaryApproval?.terminalDelivery === "after_publish" &&
					candidates.includes(requestId)
				)
					ordinaryApproval = null;
			},
		},
		dynamicApprovals: {
			resolve: async (..._args) => {
				const result = await run("dynamic.resolve");
				dynamicApprovals = [];
				return result;
			},
		},
	};
	const projection: BrowserProjectionPort = {
		read: ({ mediaReady, checkout }): BrowserOwnerProjection => {
			// A workhorse's approval is shown only to the panes of its checkout.
			const shown =
				options.approvalCheckout === undefined || options.approvalCheckout === checkout
					? ordinaryApproval
					: null;
			const owner: BrowserOwnerProjection = {
				readiness,
				account,
				login: { kind: "login", state: "idle" },
				timeline: null,
				queue: { kind: "codex_queue", submissions: [] },
				settings: [],
				approvals: shown === null ? [] : [shown],
				dynamicApprovals,
				semantic: { kind: "codex_semantic", outcome: null, freshness: null },
				coordinator: {
					kind: "codex_coordinator",
					state: "unbound",
					threadId: null,
					configured: null,
					effective: null,
					reason: null,
				},
				voice: {
					kind: "codex_voice",
					recording: false,
					mediaReady,
					generation: null,
					coordinatorState: "ready",
					transcript: [],
				},
				spokenApproval: EMPTY_SPOKEN_APPROVAL_SNAPSHOT,
			};
			return options.project?.(owner) ?? owner;
		},
		onChange: (listener) => {
			projectionListeners.add(listener);
			return () => projectionListeners.delete(listener);
		},
		...(onProjectionDisconnect ? { onBrowserDisconnect: onProjectionDisconnect } : {}),
	};
	const threadLink = {
		read: (key: string) => bindingFor(key, revision, options.linkFor?.(key) ?? link),
	};
	const gateway = createCodexWorkbenchGateway({
		identity: authorities,
		projection,
		threadLink,
		// Every pane of the fixture is in one checkout, so it has one workhorse link.
		checkoutOf: options.checkoutOf ?? (() => "/work/checkout"),
		actions,
		...(lifecycle ? { lifecycle } : {}),
		...(options.snapshotMaxBytes === undefined
			? {}
			: { snapshotMaxBytes: options.snapshotMaxBytes }),
		...(options.leaseLedger === undefined ? {} : { leaseLedger: options.leaseLedger }),
		now: () => clock,
	});

	const emitProjectionChange = (): void => {
		for (const listener of projectionListeners) listener();
	};
	const setReadiness = (state: BrowserReadiness["state"]): void => {
		readiness = readinessFor(state, loginId);
		account =
			state === "thread_capable" ? readyAccount() : { kind: "account", state: "signed_out" };
		emitProjectionChange();
	};
	const setLink = (next: ThreadLinkSnapshot): void => {
		link = next;
		revision += 1;
		emitProjectionChange();
	};
	const makeOrdinaryApproval = (targetThreadId = threadId): ApprovalOwnerView =>
		commandApprovalOwnerFixture({
			identity: authorities.identity,
			childId,
			epoch,
			requestId,
			threadId: targetThreadId,
			turnId,
			itemId,
			approvalId,
			nowMs: CLOCK_START,
		});
	const makeDynamicApproval = (
		commandId: BrowserCommandId,
		targetThreadId = threadId,
	): DynamicApprovalOwnerView => {
		const authority = createDynamicAuthorityTokenIssuer();
		const operationId = authorities.operation.issuer.mintOperationId();
		const identity = {
			child: childId,
			epoch,
			threadId: targetThreadId,
			turnId,
			callId: authorities.identity.decoder.adoptDynamicToolCallId("gateway-call"),
			namespace: "archboard_app",
			tool: "send_message_to_thread",
			manifestHash: "gateway-manifest",
			operationId: String(operationId),
		} as const;
		const effect = {
			tool: "send_message_to_thread",
			arguments: {
				threadId: authorities.identity.decoder.serializeCodexIdentity(targetThreadId),
				prompt: "Send one bounded message",
			},
			callerAuthority: authority.issue(),
			targetAuthority: authority.issue(),
			contextAuthority: authority.issue(),
			effectiveBoundary: null,
			mutationOperationId: String(operationId),
			initialTurnOperationId: null,
			visualSummary: "Send one bounded message",
		} as const;
		const request: DynamicToolApprovalRequest = {
			identity,
			effect,
			effectHash: `sha256:${"7".repeat(64)}`,
			createdAtMs: CLOCK_START,
			expiresAtMs: CLOCK_START + 90_000,
		};
		return {
			request,
			binding: { commandId, paneId, capturedLink: { threadId: targetThreadId, childId, epoch } },
		};
	};

	return {
		authorities,
		model,
		gateway,
		open: (instance) => gateway.connect(browserId, paneId, tabSessionId, instance),
		browserId,
		paneId,
		tabSessionId,
		childId,
		epoch,
		threadId,
		turnId,
		calls,
		actionContexts,
		disconnectReasons,
		disconnectSettled,
		publishedAcknowledgements,
		realtimeActive: () => realtimeActive,
		advance: (milliseconds) => {
			clock += milliseconds;
		},
		setReadiness,
		setLink,
		setOrdinaryApproval: (approval, notify = true) => {
			ordinaryApproval = approval;
			if (notify) emitProjectionChange();
		},
		setDynamicApprovals: (approvals) => {
			dynamicApprovals = approvals;
			emitProjectionChange();
		},
		emitProjectionChange,
		setActionError: (error) => {
			actionError = error;
		},
		setActionResult: (result) => {
			actionResult = result;
		},
		setActionGate: (gate) => {
			actionGate = gate;
		},
		setDisconnectGate: (gate) => {
			disconnectGate = gate;
		},
		setDisconnectError: (error) => {
			disconnectError = error;
		},
		endSession: () => {
			ordinaryApproval = null;
			dynamicApprovals = [];
			gateway.endSession(tabSessionId);
			emitProjectionChange();
		},
		binding: () => bindingFor(tabSessionId, revision, link),
		makeOrdinaryApproval,
		makeDynamicApproval,
	};
}
